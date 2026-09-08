import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { autoDevConfigSchema } from "../src/config/schema.js";
import { decideMergeReviewVerdict, findingFingerprint, isAddedDiffLine, reconcileReviewFindings, reviewMergeRequest } from "../src/controller/merge-request-review.js";
import type { MergeReviewResult } from "../src/domain.js";
import type { ReviewFindingRecord } from "../src/state/command-store.js";
import { runChecked } from "../src/git/command.js";
import type { DevelopmentRuntime } from "../src/runtime/runtime.js";
import type { GitLabClient } from "../src/scm/gitlab.js";

describe("Merge Request review", () => {
  it("keeps a deterministic finding identity across line changes and reconciles prior status", () => {
    expect(findingFingerprint({ title: " Missing check ", path: "src/a.ts" })).toBe(findingFingerprint({ title: "missing   check", path: "src/a.ts" }));
    const previous: ReviewFindingRecord[] = [
      { fingerprint: "same", severity: "high", title: "Still broken", evidence: "old", recommendation: "fix", path: "src/a.ts", line: 2, firstSeenSha: "sha-1", latestConfirmedSha: "sha-1", status: "new" },
      { fingerprint: "fixed", severity: "medium", title: "Fixed", evidence: "old", recommendation: "fix", firstSeenSha: "sha-1", latestConfirmedSha: "sha-1", status: "new" },
      { fingerprint: "unknown", severity: "low", title: "Moved", evidence: "old", recommendation: "check", firstSeenSha: "sha-1", latestConfirmedSha: "sha-1", status: "new" },
    ];
    const review = { summary: "review", coreChanges: [], logicClosure: "closed", requirementCoverage: "covered", findings: [{ severity: "high", title: "Still broken", evidence: "new", recommendation: "fix", path: "src/a.ts", line: 8, priorFingerprint: "same" }], resolvedFindingFingerprints: ["fixed", "invented"], residualRisks: [], recommendedVerdict: "blocking" } satisfies MergeReviewResult;
    expect(reconcileReviewFindings("sha-2", review, previous)).toEqual(expect.arrayContaining([
      expect.objectContaining({ fingerprint: "same", status: "still_present", firstSeenSha: "sha-1", latestConfirmedSha: "sha-2", line: 8 }),
      expect.objectContaining({ fingerprint: "fixed", status: "resolved" }),
      expect.objectContaining({ fingerprint: "unknown", status: "relocated_or_unconfirmed" }),
    ]));
    const resolved = reconcileReviewFindings("sha-3", { ...review, findings: [], resolvedFindingFingerprints: [] }, [{ ...previous[1]!, status: "resolved" }]);
    expect(resolved[0]?.status).toBe("resolved");
  });

  it("accepts only concrete added-line positions from the current diff", () => {
    const diff = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n old\n+added\n tail";
    expect(isAddedDiffLine(diff, "src/a.ts", 2)).toBe(true);
    expect(isAddedDiffLine(diff, "src/a.ts", 1)).toBe(false);
    expect(isAddedDiffLine(diff, "src/other.ts", 2)).toBe(false);
  });

  it("makes required gate failures blocking regardless of model output", () => {
    const gates = [{ id: "test", type: "command" as const, description: "test", required: true, source: "repository" as const }];
    const review = { summary: "looks fine", coreChanges: [], logicClosure: "closed", requirementCoverage: "covered", findings: [], resolvedFindingFingerprints: [], residualRisks: [], recommendedVerdict: "merge_ready" as const };
    expect(decideMergeReviewVerdict(gates, [{ gateId: "test", passed: false, summary: "failed" }], review)).toBe("blocking");
  });

  it("checks out the authoritative SHA, runs gates and publishes a merge-ready comment", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-mr-")); const bare = path.join(root, "origin.git"); const author = path.join(root, "author"); const workspace = path.join(root, "workspace");
    await runChecked("git", ["init", "--bare", "-b", "main", bare], { cwd: root }); await runChecked("git", ["clone", bare, author], { cwd: root });
    await runChecked("git", ["config", "user.name", "Test"], { cwd: author }); await runChecked("git", ["config", "user.email", "test@example.test"], { cwd: author });
    await runChecked("bash", ["-lc", "echo base > README.md"], { cwd: author }); await runChecked("git", ["add", "."], { cwd: author }); await runChecked("git", ["commit", "-m", "base"], { cwd: author }); await runChecked("git", ["push", "origin", "main"], { cwd: author });
    await runChecked("git", ["checkout", "-b", "feature"], { cwd: author }); await runChecked("bash", ["-lc", "echo good > feature.txt"], { cwd: author }); await runChecked("git", ["add", "."], { cwd: author }); await runChecked("git", ["commit", "-m", "feature"], { cwd: author });
    const headSha = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: author })).stdout.trim(); await runChecked("git", ["push", "origin", `HEAD:refs/merge-requests/8/head`], { cwd: author }); await runChecked("git", ["clone", bare, workspace], { cwd: root });
    const config = autoDevConfigSchema.parse({ repository: { provider: "gitlab", url: `file://${bare}` }, automation: {}, verification: { commands: [{ id: "content", command: "grep -q good feature.txt" }] }, security: {} });
    const runtime = { reviewMergeRequest: vi.fn().mockResolvedValue({ value: { summary: "safe bounded change", coreChanges: ["adds feature"], logicClosure: "closed", requirementCoverage: "covered", findings: [], resolvedFindingFingerprints: [], residualRisks: [], recommendedVerdict: "merge_ready" }, threadId: "r", transcript: "" }) } as unknown as DevelopmentRuntime;
    const scm = { commentTarget: vi.fn().mockResolvedValue(undefined), upsertMergeRequestDiscussion: vi.fn().mockResolvedValue(undefined) } as unknown as GitLabClient;
    const result = await reviewMergeRequest({ kind: "merge_request", iid: 8, title: "Feature", description: "", state: "opened", webUrl: "https://git/mr/8", labels: [], sourceBranch: "feature", targetBranch: "main", headSha, diff: "diff" }, { config, workspace, artifactRoot: path.join(root, "artifacts"), runtime, scm, projectId: "1" });
    expect(result.status).toBe("merge_ready"); expect(result.revision).toBe(headSha); expect(scm.commentTarget).toHaveBeenCalledWith("1", "merge_request", 8, expect.stringContaining(`审查 SHA：\`${headSha}\``));
  });

  it("deepens a shallow workspace before computing the MR merge-base diff", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-mr-shallow-")); const bare = path.join(root, "origin.git"); const author = path.join(root, "author"); const workspace = path.join(root, "workspace");
    await runChecked("git", ["init", "--bare", "-b", "main", bare], { cwd: root }); await runChecked("git", ["clone", bare, author], { cwd: root });
    await runChecked("git", ["config", "user.name", "Test"], { cwd: author }); await runChecked("git", ["config", "user.email", "test@example.test"], { cwd: author });
    await runChecked("bash", ["-lc", "echo base > file"], { cwd: author }); await runChecked("git", ["add", "."], { cwd: author }); await runChecked("git", ["commit", "-m", "base"], { cwd: author }); await runChecked("git", ["checkout", "-b", "feature"], { cwd: author }); await runChecked("bash", ["-lc", "echo feature >> file"], { cwd: author }); await runChecked("git", ["commit", "-am", "feature"], { cwd: author });
    const headSha = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: author })).stdout.trim(); await runChecked("git", ["push", "origin", `HEAD:refs/merge-requests/2/head`], { cwd: author }); await runChecked("git", ["checkout", "main"], { cwd: author }); await runChecked("bash", ["-lc", "echo main > other"], { cwd: author }); await runChecked("git", ["add", "."], { cwd: author }); await runChecked("git", ["commit", "-m", "main moves"], { cwd: author }); await runChecked("git", ["push", "origin", "main"], { cwd: author });
    await runChecked("git", ["clone", "--depth=1", `file://${bare}`, workspace], { cwd: root });
    const { prepareMergeRequestWorkspace } = await import("../src/git/merge-request-workspace.js");
    const checkpoint = await prepareMergeRequestWorkspace(workspace, { kind: "merge_request", iid: 2, title: "MR", description: "", state: "opened", webUrl: "", labels: [], targetBranch: "main", headSha });
    expect(checkpoint.changedFiles).toEqual(["file"]); expect((await runChecked("git", ["rev-parse", "--is-shallow-repository"], { cwd: workspace })).stdout.trim()).toBe("false");
  });
});
