import path from "node:path";
import type { AutoDevConfig } from "../config/schema.js";
import type { GateEvidence, MergeReviewResult, MergeReviewVerdict } from "../domain.js";
import { prepareMergeRequestWorkspace } from "../git/merge-request-workspace.js";
import { materializeMergeRequestGates } from "../policies/gates.js";
import { buildMergeReviewPrompt } from "../runtime/merge-review-prompt.js";
import type { DevelopmentRuntime } from "../runtime/runtime.js";
import type { GitLabClient, GitLabTargetSnapshot } from "../scm/gitlab.js";
import { requiredGatesPassed, verifyGates } from "../stages/verify.js";
import { runChecked } from "../git/command.js";

export async function reviewMergeRequest(mr: GitLabTargetSnapshot, dependencies: { config: AutoDevConfig; workspace: string; artifactRoot: string; runtime: DevelopmentRuntime; scm: GitLabClient; projectId: string }): Promise<{ status: MergeReviewVerdict; revision: string; summary: string }> {
  if (!mr.headSha) throw new Error("Merge Request has no head SHA");
  if (mr.state !== "opened" && mr.state !== "open") return { status: "needs_attention", revision: mr.headSha, summary: `MR state ${mr.state} is not reviewable` };
  const checkpoint = await prepareMergeRequestWorkspace(dependencies.workspace, mr);
  const gates = materializeMergeRequestGates(dependencies.config, checkpoint.changedFiles);
  const evidence = await verifyGates({ workspace: dependencies.workspace, artifactRoot: path.join(dependencies.artifactRoot, mr.headSha), gates, checkpoint, config: dependencies.config });
  const currentHead = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: dependencies.workspace })).stdout.trim();
  const worktree = (await runChecked("git", ["status", "--porcelain"], { cwd: dependencies.workspace })).stdout.trim();
  const integrityPassed = currentHead === mr.headSha && worktree.length === 0;
  gates.push({ id: "review-integrity", type: "review", description: "Verification commands preserve the reviewed SHA and worktree.", required: true, source: "global" });
  evidence.push({ gateId: "review-integrity", passed: integrityPassed, summary: integrityPassed ? "reviewed SHA and worktree remained unchanged" : `verification mutated review workspace (head=${currentHead}, dirty=${Boolean(worktree)})` });
  const semantic = (await dependencies.runtime.reviewMergeRequest(buildMergeReviewPrompt(mr, checkpoint, evidence))).value;
  const verdict = decideMergeReviewVerdict(gates, evidence, semantic);
  const body = formatMergeReview(mr, checkpoint.baseSha, evidence, semantic, verdict);
  await dependencies.scm.commentTarget(dependencies.projectId, "merge_request", mr.iid, body);
  return { status: verdict, revision: mr.headSha, summary: `${verdict}: ${semantic.summary}` };
}

export function decideMergeReviewVerdict(gates: Parameters<typeof requiredGatesPassed>[0], evidence: GateEvidence[], review: MergeReviewResult): MergeReviewVerdict {
  if (!requiredGatesPassed(gates, evidence)) return "blocking";
  if (review.findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) return "blocking";
  if (review.recommendedVerdict === "blocking") return "blocking";
  if (review.recommendedVerdict === "needs_attention" || review.findings.length > 0) return "needs_attention";
  return "merge_ready";
}

function formatMergeReview(mr: GitLabTargetSnapshot, baseSha: string, evidence: GateEvidence[], review: MergeReviewResult, verdict: MergeReviewVerdict): string {
  const marker = `<!-- autodev-mr-review:${mr.iid} -->`;
  const gates = evidence.map((item) => `- ${item.passed ? "✅" : "❌"} \`${item.gateId}\`: ${item.summary}`).join("\n");
  const changes = review.coreChanges.length ? review.coreChanges.map((item) => `- ${item}`).join("\n") : "- 未形成可靠摘要";
  const findings = review.findings.length ? review.findings.map((item) => `- **${item.severity} · ${item.title}** — ${item.evidence}\n  - 建议：${item.recommendation}`).join("\n") : "- 未发现阻塞性问题";
  const risks = review.residualRisks.length ? review.residualRisks.map((item) => `- ${item}`).join("\n") : "- 无已知残余风险";
  return [marker, "## AutoDev MR 合入审查", "", `结论：**${verdict}**`, "", `审查 SHA：\`${mr.headSha}\``, `目标基线：\`${baseSha}\``, "", review.summary, "", "### 核心改动", changes, "", "### 逻辑与需求闭环", review.logicClosure, "", review.requirementCoverage, "", "### 确定性门禁", gates, "", "### Findings", findings, "", "### 残余风险", risks, "", "> 结论仅绑定上述 MR head SHA；新提交会使该结论失效。AutoDev 不会自动 Approve 或 Merge。"].join("\n");
}
