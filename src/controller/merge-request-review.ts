import { createHash } from "node:crypto";
import path from "node:path";
import type { AutoDevConfig } from "../config/schema.js";
import type { GateEvidence, MergeReviewFinding, MergeReviewResult, MergeReviewVerdict } from "../domain.js";
import { runChecked } from "../git/command.js";
import { prepareMergeRequestWorkspace } from "../git/merge-request-workspace.js";
import { materializeMergeRequestGates } from "../policies/gates.js";
import { buildMergeReviewPrompt } from "../runtime/merge-review-prompt.js";
import type { DevelopmentRuntime } from "../runtime/runtime.js";
import type { GitLabClient, GitLabTargetSnapshot } from "../scm/gitlab.js";
import type { ReviewFindingRecord } from "../state/command-store.js";
import { requiredGatesPassed, verifyGates } from "../stages/verify.js";

export interface MergeRequestReviewOutcome { status: MergeReviewVerdict; revision: string; summary: string; findings: ReviewFindingRecord[] }

export async function reviewMergeRequest(mr: GitLabTargetSnapshot, dependencies: { config: AutoDevConfig; workspace: string; artifactRoot: string; runtime: DevelopmentRuntime; scm: GitLabClient; projectId: string; previousFindings?: ReviewFindingRecord[] }): Promise<MergeRequestReviewOutcome> {
  if (!mr.headSha) throw new Error("Merge Request has no head SHA");
  if (mr.state !== "opened" && mr.state !== "open") return { status: "needs_attention", revision: mr.headSha, summary: `MR state ${mr.state} is not reviewable`, findings: dependencies.previousFindings ?? [] };
  const checkpoint = await prepareMergeRequestWorkspace(dependencies.workspace, mr);
  const gates = materializeMergeRequestGates(dependencies.config, checkpoint.changedFiles);
  const evidence = await verifyGates({ workspace: dependencies.workspace, artifactRoot: path.join(dependencies.artifactRoot, mr.headSha), gates, checkpoint, config: dependencies.config });
  const currentHead = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: dependencies.workspace })).stdout.trim();
  // Verification tools may create untracked dependency/build caches in the
  // sandbox. Integrity is about preserving the reviewed tracked source; reject
  // staged or unstaged tracked-file mutations without treating caches as code.
  const worktree = (await runChecked("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: dependencies.workspace })).stdout.trim();
  const integrityPassed = currentHead === mr.headSha && worktree.length === 0;
  gates.push({ id: "review-integrity", type: "review", description: "Verification commands preserve the reviewed SHA and worktree.", required: true, source: "global" });
  evidence.push({ gateId: "review-integrity", passed: integrityPassed, summary: integrityPassed ? "reviewed SHA and worktree remained unchanged" : `verification mutated review workspace (head=${currentHead}, dirty=${Boolean(worktree)})` });
  const previous = dependencies.previousFindings ?? [];
  const semantic = (await dependencies.runtime.reviewMergeRequest(buildMergeReviewPrompt(mr, checkpoint, evidence, previous))).value;
  const findings = reconcileReviewFindings(mr.headSha, semantic, previous);
  const verdict = decideMergeReviewVerdict(gates, evidence, semantic, findings);
  await publishFindingDiscussions(mr, dependencies.projectId, dependencies.scm, findings);
  await dependencies.scm.commentTarget(dependencies.projectId, "merge_request", mr.iid, formatMergeReview(mr, checkpoint.baseSha, evidence, semantic, verdict, findings));
  return { status: verdict, revision: mr.headSha, summary: `${verdict}: ${semantic.summary}`, findings };
}

export function findingFingerprint(finding: Pick<MergeReviewFinding, "title" | "path">): string {
  return createHash("sha256").update(`${normalize(finding.path ?? "general")}\n${normalize(finding.title)}`).digest("hex").slice(0, 20);
}

export function reconcileReviewFindings(headSha: string, review: MergeReviewResult, previous: ReviewFindingRecord[]): ReviewFindingRecord[] {
  const prior = new Map(previous.map((finding) => [finding.fingerprint, finding]));
  const claimed = new Set<string>();
  const current: ReviewFindingRecord[] = review.findings.map((finding) => {
    const linked = finding.priorFingerprint && prior.has(finding.priorFingerprint) ? finding.priorFingerprint : undefined;
    const fingerprint = linked ?? findingFingerprint(finding);
    const old = prior.get(fingerprint);
    claimed.add(fingerprint);
    return { fingerprint, severity: finding.severity, title: finding.title, evidence: finding.evidence, recommendation: finding.recommendation, ...(finding.path ? { path: finding.path } : {}), ...(finding.line ? { line: finding.line } : {}), firstSeenSha: old?.firstSeenSha ?? headSha, latestConfirmedSha: headSha, status: old ? "still_present" as const : "new" as const };
  });
  const resolved = new Set(review.resolvedFindingFingerprints.filter((fingerprint) => prior.has(fingerprint)));
  const deduplicated = [...new Map(current.map((finding) => [finding.fingerprint, finding])).values()];
  for (const old of previous) if (!claimed.has(old.fingerprint)) deduplicated.push({ ...old, status: resolved.has(old.fingerprint) || old.status === "resolved" ? "resolved" : "relocated_or_unconfirmed" });
  return deduplicated.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

export function decideMergeReviewVerdict(gates: Parameters<typeof requiredGatesPassed>[0], evidence: GateEvidence[], review: MergeReviewResult, tracked: ReviewFindingRecord[] = []): MergeReviewVerdict {
  if (!requiredGatesPassed(gates, evidence)) return "blocking";
  if (review.findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) return "blocking";
  if (review.recommendedVerdict === "blocking") return "blocking";
  if (tracked.some((finding) => finding.status === "relocated_or_unconfirmed")) return "needs_attention";
  if (review.recommendedVerdict === "needs_attention" || review.findings.length > 0) return "needs_attention";
  return "merge_ready";
}

async function publishFindingDiscussions(mr: GitLabTargetSnapshot, projectId: string, scm: GitLabClient, findings: ReviewFindingRecord[]): Promise<void> {
  if (!mr.headSha) return;
  for (const finding of findings) {
    const marker = `<!-- autodev-mr-finding:${mr.iid}:${finding.fingerprint} -->`;
    const body = [marker, `**AutoDev · ${finding.severity} · ${finding.status}**`, "", finding.title, "", finding.evidence, "", `建议：${finding.recommendation}`, "", `确认 SHA：\`${finding.latestConfirmedSha}\``].join("\n");
    const isCurrentLine = finding.status !== "resolved" && finding.path && finding.line && isAddedDiffLine(mr.diff ?? "", finding.path, finding.line);
    const position = isCurrentLine && mr.baseSha && mr.startSha ? { baseSha: mr.baseSha, startSha: mr.startSha, headSha: mr.headSha, path: finding.path!, line: finding.line! } : undefined;
    if (position) await scm.upsertMergeRequestDiscussion(projectId, mr.iid, body, position);
    else if (finding.status === "resolved" || finding.status === "relocated_or_unconfirmed") await scm.upsertMergeRequestDiscussion(projectId, mr.iid, body, undefined, false);
  }
}

export function isAddedDiffLine(diff: string, expectedPath: string, expectedLine: number): boolean {
  let pathName = ""; let newLine = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) { pathName = line.slice(6); continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = Number(hunk[1]); continue; }
    if (!pathName || line.startsWith("--- ") || line.startsWith("diff --git")) continue;
    if (line.startsWith("+")) { if (pathName === expectedPath && newLine === expectedLine) return true; newLine += 1; }
    else if (!line.startsWith("-")) newLine += 1;
  }
  return false;
}

function formatMergeReview(mr: GitLabTargetSnapshot, baseSha: string, evidence: GateEvidence[], review: MergeReviewResult, verdict: MergeReviewVerdict, tracked: ReviewFindingRecord[]): string {
  const marker = `<!-- autodev-mr-review:${mr.iid} -->`;
  const gates = evidence.map((item) => `- ${item.passed ? "✅" : "❌"} \`${item.gateId}\`: ${item.summary}`).join("\n");
  const changes = review.coreChanges.length ? review.coreChanges.map((item) => `- ${item}`).join("\n") : "- 未形成可靠摘要";
  const findings = tracked.length ? tracked.map((item) => `- **${item.severity} · ${item.status} · ${item.title}** (${item.fingerprint}) — ${item.evidence}\n  - 建议：${item.recommendation}`).join("\n") : "- 未发现阻塞性问题";
  const risks = review.residualRisks.length ? review.residualRisks.map((item) => `- ${item}`).join("\n") : "- 无已知残余风险";
  return [marker, "## AutoDev MR 合入审查", "", `结论：**${verdict}**`, "", `审查 SHA：\`${mr.headSha}\``, `目标基线：\`${baseSha}\``, "", review.summary, "", "### 核心改动", changes, "", "### 逻辑与需求闭环", review.logicClosure, "", review.requirementCoverage, "", "### 确定性门禁", gates, "", "### Findings 与修复确认", findings, "", "### 残余风险", risks, "", "> 结论仅绑定上述 MR head SHA；新提交会使该结论失效。AutoDev 不会自动 Approve 或 Merge。"].join("\n");
}

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\\/g, "/").replace(/\s+/g, " "); }
