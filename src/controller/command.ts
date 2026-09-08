import type { AutoDevConfig } from "../config/schema.js";
import type { DevelopmentRuntime } from "../runtime/runtime.js";
import { buildAnalysisPrompt } from "../runtime/analysis-prompt.js";
import type { GitLabClient } from "../scm/gitlab.js";
import type { GitLabCommandEvent } from "../scm/gitlab-events.js";
import type { CommandStateStore } from "../state/command-store.js";

export async function executeGitLabCommand(event: GitLabCommandEvent, dependencies: {
  config: AutoDevConfig;
  scm: GitLabClient;
  runtime: DevelopmentRuntime;
  store: CommandStateStore;
}): Promise<{ status: "ignored" | "completed"; reason: string }> {
  if (event.eventKind === "merge_request" || !event.command || !event.target) return { status: "ignored", reason: "event contains no AutoDev command" };
  const bot = await dependencies.scm.currentUser();
  if (event.actor.id === bot.id || event.actor.username === bot.username) return { status: "ignored", reason: "ignored AutoDev bot event" };

  const project = await dependencies.scm.project(event.project.fullName);
  if (String(project.id) !== event.project.id || project.path_with_namespace !== event.project.fullName) throw new Error("GitLab webhook project does not match authoritative project");
  const allowlist = dependencies.config.repository.allowlist;
  if (allowlist.length && !allowlist.includes(project.path_with_namespace)) throw new Error(`repository ${project.path_with_namespace} is not allowlisted`);
  const actors = dependencies.config.security.allowed_actors;
  if (actors.length && !actors.includes(event.actor.username)) throw new Error(`event actor ${event.actor.username} is not allowlisted`);
  const access = await dependencies.scm.memberAccess(event.project.id, event.actor.id);
  if (access < dependencies.config.security.gitlab_min_access_level) throw new Error(`event actor access level ${access} is below required ${dependencies.config.security.gitlab_min_access_level}`);

  const claimKey = `${event.deliveryId}:${event.noteId}:${event.command}`;
  if (!await dependencies.store.claim(claimKey)) return { status: "ignored", reason: "duplicate command delivery" };
  const targetKey = `gitlab:${event.project.id}:${event.target.kind}:${event.target.iid}`;
  const marker = `<!-- autodev-command:${event.noteId} -->`;

  if (event.command === "help") {
    await dependencies.scm.commentTarget(event.project.id, event.target.kind, event.target.iid, `${marker}\nAutoDev 可用命令：\n\n- \`@autodev help\`\n- \`@autodev status\`\n- \`@autodev analyze\`（只读分析，不修改代码）`);
    return { status: "completed", reason: "help replied" };
  }
  if (event.command === "status") {
    const current = await dependencies.store.loadTarget(targetKey);
    const detail = current ? `最近命令：**${current.command}**\n\n状态：**${current.status}**\n\n更新时间：${current.updatedAt}${current.summary ? `\n\n摘要：${current.summary}` : ""}` : "当前对象没有 AutoDev 命令运行记录。";
    await dependencies.scm.commentTarget(event.project.id, event.target.kind, event.target.iid, `${marker}\n${detail}`);
    return { status: "completed", reason: "status replied" };
  }

  await dependencies.store.saveTarget({ targetKey, command: "analyze", status: "running", actor: event.actor.username, updatedAt: new Date().toISOString() });
  try {
    const target = await dependencies.scm.target(event.project.id, event.target.kind, event.target.iid);
    const analysis = (await dependencies.runtime.analyze(buildAnalysisPrompt(target))).value;
    const summary = formatAnalysis(analysis);
    await dependencies.store.saveTarget({ targetKey, command: "analyze", status: "completed", actor: event.actor.username, updatedAt: new Date().toISOString(), summary: analysis.summary });
    await dependencies.scm.commentTarget(event.project.id, event.target.kind, event.target.iid, `${marker}\n${summary}`);
    return { status: "completed", reason: "analysis replied" };
  } catch (error) {
    await dependencies.store.saveTarget({ targetKey, command: "analyze", status: "failed", actor: event.actor.username, updatedAt: new Date().toISOString(), summary: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

function formatAnalysis(value: Awaited<ReturnType<DevelopmentRuntime["analyze"]>>["value"]): string {
  const evidence = value.codeEvidence.length ? value.codeEvidence.map((item) => `- \`${item.path}\`${item.symbol ? ` · \`${item.symbol}\`` : ""}: ${item.evidence}`).join("\n") : "- 暂无充分的代码证据";
  const risks = value.risks.length ? value.risks.map((item) => `- **${item.level}** · ${item.area}: ${item.description}`).join("\n") : "- 未发现明确风险";
  const questions = value.questions.length ? value.questions.map((item) => `- ${item}`).join("\n") : "- 无";
  return [`## AutoDev 只读分析`, "", `结论建议：**${value.recommendation}**`, "", value.summary, "", "### 代码证据", evidence, "", "### 判断", `- 合理性：${value.validity}`, `- 必要性：${value.necessity}`, `- 可行性：${value.feasibility}`, "", "### 风险", risks, "", "### 待确认", questions, "", "> 此结果是只读分析，不表示 MR 已通过完整合入审查，也不会触发代码修改。"].join("\n");
}
