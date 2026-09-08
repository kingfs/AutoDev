import type { AutoDevConfig } from "../config/schema.js";
import type { DevelopmentRuntime } from "../runtime/runtime.js";
import { buildAnalysisPrompt } from "../runtime/analysis-prompt.js";
import type { GitLabClient, GitLabTargetSnapshot } from "../scm/gitlab.js";
import type { GitLabCommandEvent } from "../scm/gitlab-events.js";
import type { CommandStateStore, ReviewFindingRecord } from "../state/command-store.js";
import type { WorkItem } from "../domain.js";
import { decideAnalysisAdmission } from "../policies/analysis.js";

export async function executeGitLabCommand(event: GitLabCommandEvent, dependencies: {
  config: AutoDevConfig;
  scm: GitLabClient;
  runtime: DevelopmentRuntime;
  store: CommandStateStore;
  runIssue?: (item: WorkItem, retry: boolean) => Promise<{ status: string; reason?: string }>;
  reviewMergeRequest?: (mr: GitLabTargetSnapshot, previousFindings: ReviewFindingRecord[]) => Promise<{ status: string; revision: string; summary: string; findings: ReviewFindingRecord[] }>;
}): Promise<{ status: "ignored" | "completed"; reason: string }> {
  if (!event.target || (event.eventKind === "note" && !event.command)) return { status: "ignored", reason: "event contains no AutoDev command" };
  if (event.eventKind === "merge_request" && !["open", "update", "reopen"].includes(event.action ?? "update")) return { status: "ignored", reason: `merge request action ${event.action} is not reviewable` };
  const command = event.eventKind === "merge_request" ? "review" : event.command!;
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

  const claimKey = `${event.deliveryId}:${event.noteId ?? "event"}:${command}`;
  if (!await dependencies.store.claim(claimKey)) return { status: "ignored", reason: "duplicate command delivery" };
  const targetKey = `gitlab:${event.project.id}:${event.target.kind}:${event.target.iid}`;
  const invocationId = `${event.noteId ?? event.deliveryId}:${command}`;
  const marker = `<!-- autodev-command:${event.noteId ?? event.deliveryId} -->`;

  if (command === "help") {
    await dependencies.scm.commentTarget(event.project.id, event.target.kind, event.target.iid, `${marker}\nAutoDev 可用命令：\n\n- \`@autodev help\`\n- \`@autodev status\`\n- \`@autodev analyze\`（只读分析，不修改代码）\n- \`@autodev run\`（仅 Issue，分析通过后实现）\n- \`@autodev retry\`（仅 Issue，重试终态任务）\n- \`@autodev review\`（仅 MR，审查当前精确 SHA）`);
    return { status: "completed", reason: "help replied" };
  }
  if (command === "status") {
    const current = await dependencies.store.loadTarget(targetKey);
    const invocation = current?.invocations.at(-1);
    const attempt = invocation?.attempts.at(-1);
    const detail = invocation && attempt ? `最近命令：**${invocation.command}**\n\n状态：**${attempt.status}**\n\n更新时间：${attempt.finishedAt ?? attempt.startedAt}${attempt.summary ? `\n\n摘要：${attempt.summary}` : ""}` : "当前对象没有 AutoDev 命令运行记录。";
    await dependencies.scm.commentTarget(event.project.id, event.target.kind, event.target.iid, `${marker}\n${detail}`);
    return { status: "completed", reason: "status replied" };
  }

  if (command === "run" || command === "retry") {
    if (event.target.kind !== "issue") throw new Error(`${command} is only supported for Issues in M2`);
    if (!dependencies.runIssue) throw new Error("Issue workflow runner is not configured");
    const target = await dependencies.scm.target(event.project.id, "issue", event.target.iid);
    if (!target.labels.includes(dependencies.config.repository.required_label)) throw new Error(`Issue is missing required label ${dependencies.config.repository.required_label}`);
    const updatedAt = target.updatedAt ?? new Date().toISOString();
    const item: WorkItem = { provider: "gitlab", deliveryId: event.deliveryId, actor: event.actor.username, action: "open", revision: updatedAt, repository: { provider: "gitlab", id: event.project.id, fullName: event.project.fullName, cloneUrl: dependencies.config.repository.url, webUrl: target.webUrl, defaultBranch: dependencies.config.repository.default_branch }, issue: { id: String(target.iid), number: target.iid, title: target.title, body: target.description, labels: target.labels, author: target.author ?? event.actor.username, url: target.webUrl, updatedAt } };
    await dependencies.store.startInvocation(targetKey, invocationId, command, event.actor.username);
    let result;
    try {
      result = await dependencies.runIssue(item, command === "retry");
      await dependencies.store.finishInvocation(targetKey, invocationId, "completed", `${result.status}: ${result.reason ?? ""}`);
    } catch (error) {
      await dependencies.store.finishInvocation(targetKey, invocationId, "failed", error instanceof Error ? error.message : String(error));
      throw error;
    }
    await dependencies.scm.commentTarget(event.project.id, "issue", event.target.iid, `${marker}\nAutoDev ${command} 结果：**${result.status}**\n\n${result.reason ?? ""}`);
    return { status: "completed", reason: `${command} dispatched` };
  }

  if (command === "review") {
    if (event.target.kind !== "merge_request") throw new Error("review is only supported for Merge Requests");
    if (!dependencies.reviewMergeRequest) throw new Error("Merge Request reviewer is not configured");
    const mr = await dependencies.scm.target(event.project.id, "merge_request", event.target.iid);
    if (!mr.headSha) throw new Error("Merge Request has no authoritative head SHA");
    const current = await dependencies.store.loadTarget(targetKey);
    if (event.eventKind === "merge_request" && current?.invocations.some((entry) => entry.command === "review" && entry.revision === mr.headSha && entry.attempts.at(-1)?.status === "completed")) return { status: "ignored", reason: "merge request revision already reviewed" };
    await dependencies.store.startInvocation(targetKey, invocationId, "review", event.actor.username, mr.headSha);
    let result;
    try {
      result = await dependencies.reviewMergeRequest(mr, current?.reviewFindings ?? []);
      await dependencies.store.saveReviewFindings(targetKey, result.findings);
      await dependencies.store.finishInvocation(targetKey, invocationId, "completed", result.summary);
    } catch (error) {
      await dependencies.store.finishInvocation(targetKey, invocationId, "failed", error instanceof Error ? error.message : String(error));
      throw error;
    }
    return { status: "completed", reason: `review ${result.status}` };
  }

  await dependencies.store.startInvocation(targetKey, invocationId, "analyze", event.actor.username);
  try {
    const target = await dependencies.scm.target(event.project.id, event.target.kind, event.target.iid);
    const analysis = (await dependencies.runtime.analyze(buildAnalysisPrompt(target))).value;
    const summary = formatAnalysis(analysis, decideAnalysisAdmission(analysis).verdict);
    await dependencies.store.finishInvocation(targetKey, invocationId, "completed", analysis.summary);
    await dependencies.scm.commentTarget(event.project.id, event.target.kind, event.target.iid, `${marker}\n${summary}`);
    return { status: "completed", reason: "analysis replied" };
  } catch (error) {
    await dependencies.store.finishInvocation(targetKey, invocationId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function formatAnalysis(value: Awaited<ReturnType<DevelopmentRuntime["analyze"]>>["value"], verdict: "proceed" | "needs_human" | "reject"): string {
  const evidence = value.codeEvidence.length ? value.codeEvidence.map((item) => `- \`${item.path}\`${item.symbol ? ` · \`${item.symbol}\`` : ""}: ${item.evidence}`).join("\n") : "- 暂无充分的代码证据";
  const risks = value.risks.length ? value.risks.map((item) => `- **${item.level}** · ${item.area}: ${item.description}`).join("\n") : "- 未发现明确风险";
  const acceptance = value.acceptanceCriteria.length ? value.acceptanceCriteria.map((item) => `- ${item}`).join("\n") : "- 尚未形成可机械验证的验收条件";
  const questions = value.questions.length ? value.questions.map((item) => `- ${item}`).join("\n") : "- 无";
  return [`## AutoDev 只读分析`, "", `结论建议：**${verdict}**`, "", value.summary, "", "### 代码证据", evidence, "", "### 判断", `- 合理性：${value.validity}`, `- 必要性：${value.necessity}`, `- 可行性：${value.feasibility}`, "", "### 验收条件", acceptance, "", "### 风险", risks, "", "### 待确认", questions, "", "> 此结果是只读分析，不表示 MR 已通过完整合入审查，也不会触发代码修改。"].join("\n");
}
