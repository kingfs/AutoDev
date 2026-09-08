import { describe, expect, it, vi } from "vitest";
import type { AutoDevConfig } from "../src/config/schema.js";
import { executeGitLabCommand } from "../src/controller/command.js";
import type { DevelopmentRuntime } from "../src/runtime/runtime.js";
import type { GitLabClient } from "../src/scm/gitlab.js";
import type { CommandStateStore, CommandTargetState } from "../src/state/command-store.js";

const config = {
  repository: { allowlist: ["group/repo"], required_label: "ai-ready", url: "https://git/repo.git", default_branch: "main" },
  security: { allowed_actors: [], gitlab_min_access_level: 30 },
} as unknown as AutoDevConfig;

function event(command: "help" | "status" | "analyze" | "run" | "retry" | "review" = "help") {
  return { deliveryId: "delivery", eventKind: "note" as const, actor: { id: 7, username: "alice" }, project: { id: "1", fullName: "group/repo" }, target: { kind: "issue" as const, iid: 3 }, noteId: 9, command };
}

function dependencies() {
  let targetState: CommandTargetState | null = null;
  const scm = {
    currentUser: vi.fn().mockResolvedValue({ id: 99, username: "bot", bot: true }),
    project: vi.fn().mockResolvedValue({ id: 1, path_with_namespace: "group/repo" }),
    memberAccess: vi.fn().mockResolvedValue(30),
    target: vi.fn().mockResolvedValue({ kind: "issue", iid: 3, title: "Bug", description: "Broken", state: "opened", webUrl: "https://git/issue/3", labels: ["ai-ready"], updatedAt: "2026-09-08T00:00:00Z", author: "reporter" }),
    commentTarget: vi.fn().mockResolvedValue(undefined),
  } as unknown as GitLabClient;
  const store = {
    claim: vi.fn().mockResolvedValue(true),
    loadTarget: vi.fn().mockImplementation(async () => targetState),
    saveTarget: vi.fn().mockImplementation(async (state: CommandTargetState) => { targetState = state; }),
    startInvocation: vi.fn().mockImplementation(async (targetKey: string, id: string, command: string, actor: string, revision?: string) => {
      const now = new Date().toISOString(); const invocation = { id, command, actor, createdAt: now, ...(revision ? { revision } : {}), attempts: [{ number: 1, status: "running" as const, startedAt: now }] }; targetState = targetState ? { ...targetState, updatedAt: now, invocations: [...targetState.invocations, invocation] } : { targetKey, updatedAt: now, invocations: [invocation] }; return targetState;
    }),
    finishInvocation: vi.fn().mockImplementation(async (_targetKey: string, id: string, status: "completed" | "failed", summary: string) => {
      const attempt = targetState?.invocations.find((entry) => entry.id === id)?.attempts.at(-1); if (attempt) { attempt.status = status; attempt.summary = summary; }
    }),
    saveReviewFindings: vi.fn().mockImplementation(async (_targetKey: string, findings: []) => { if (targetState) targetState.reviewFindings = findings; }),
  } as unknown as CommandStateStore;
  const runtime = {
    analyze: vi.fn().mockResolvedValue({ value: { summary: "Evidence found", codeEvidence: [{ path: "src/a.ts", symbol: "run", evidence: "missing check" }], validity: "valid", necessity: "needed", feasibility: "feasible", acceptanceCriteria: ["check passes"], risks: [], questions: [], recommendation: "proceed" }, threadId: "a", transcript: "" }),
  } as unknown as DevelopmentRuntime;
  const runIssue = vi.fn().mockResolvedValue({ status: "completed", reason: "done" });
  return { config, scm, store, runtime, runIssue };
}

describe("GitLab command controller", () => {
  it("answers help after authoritative project and member checks", async () => {
    const deps = dependencies();
    await expect(executeGitLabCommand(event(), deps)).resolves.toEqual({ status: "completed", reason: "help replied" });
    expect(deps.scm.memberAccess).toHaveBeenCalledWith("1", 7);
    expect(deps.scm.commentTarget).toHaveBeenCalledOnce();
  });

  it("runs read-only analysis and records completion", async () => {
    const deps = dependencies();
    await expect(executeGitLabCommand(event("analyze"), deps)).resolves.toEqual({ status: "completed", reason: "analysis replied" });
    expect(deps.runtime.analyze).toHaveBeenCalledOnce();
    expect(deps.store.finishInvocation).toHaveBeenLastCalledWith(expect.any(String), "9:analyze", "completed", "Evidence found");
    expect(deps.scm.commentTarget).toHaveBeenCalledWith("1", "issue", 3, expect.stringContaining("结论建议：**proceed**"));
  });

  it("dispatches an authoritative Issue to the workflow and records an invocation", async () => {
    const deps = dependencies();
    await expect(executeGitLabCommand(event("run"), deps)).resolves.toEqual({ status: "completed", reason: "run dispatched" });
    expect(deps.runIssue).toHaveBeenCalledWith(expect.objectContaining({ issue: expect.objectContaining({ author: "reporter", labels: ["ai-ready"] }) }), false);
    expect(deps.store.startInvocation).toHaveBeenCalledWith("gitlab:1:issue:3", "9:run", "run", "alice");
    expect(deps.store.finishInvocation).toHaveBeenCalledWith("gitlab:1:issue:3", "9:run", "completed", "completed: done");
  });

  it("marks retry as an explicit workflow retry", async () => {
    const deps = dependencies();
    await executeGitLabCommand(event("retry"), deps);
    expect(deps.runIssue).toHaveBeenCalledWith(expect.any(Object), true);
    expect(deps.store.startInvocation).toHaveBeenCalledWith("gitlab:1:issue:3", "9:retry", "retry", "alice");
  });

  it("dispatches an automatic MR event once per authoritative SHA", async () => {
    const deps = dependencies();
    vi.mocked(deps.scm.target).mockResolvedValue({ kind: "merge_request", iid: 4, title: "MR", description: "", state: "opened", webUrl: "https://git/mr/4", labels: [], targetBranch: "main", sourceBranch: "feature", headSha: "abc" });
    const reviewMergeRequest = vi.fn().mockResolvedValue({ status: "merge_ready", revision: "abc", summary: "ready", findings: [] });
    const { command: _command, ...baseEvent } = event("review");
    const mrEvent = { ...baseEvent, eventKind: "merge_request" as const, target: { kind: "merge_request" as const, iid: 4 } };
    await expect(executeGitLabCommand(mrEvent, { ...deps, reviewMergeRequest })).resolves.toEqual({ status: "completed", reason: "review merge_ready" });
    expect(reviewMergeRequest).toHaveBeenCalledWith(expect.objectContaining({ headSha: "abc" }), []);
    await expect(executeGitLabCommand({ ...mrEvent, deliveryId: "delivery-2" }, { ...deps, reviewMergeRequest })).resolves.toEqual({ status: "ignored", reason: "merge request revision already reviewed" });
    expect(reviewMergeRequest).toHaveBeenCalledOnce();
  });

  it("allows an explicit review command to rerun a completed current SHA", async () => {
    const deps = dependencies();
    vi.mocked(deps.scm.target).mockResolvedValue({ kind: "merge_request", iid: 4, title: "MR", description: "", state: "opened", webUrl: "https://git/mr/4", labels: [], targetBranch: "main", sourceBranch: "feature", headSha: "abc" });
    const reviewMergeRequest = vi.fn().mockResolvedValue({ status: "merge_ready", revision: "abc", summary: "ready", findings: [] });
    const reviewEvent = { ...event("review"), target: { kind: "merge_request" as const, iid: 4 } };
    await executeGitLabCommand(reviewEvent, { ...deps, reviewMergeRequest });
    await executeGitLabCommand({ ...reviewEvent, deliveryId: "delivery-2", noteId: 10 }, { ...deps, reviewMergeRequest });
    expect(reviewMergeRequest).toHaveBeenCalledTimes(2);
  });

  it("ignores bot events and duplicate deliveries", async () => {
    const botDeps = dependencies();
    vi.mocked(botDeps.scm.currentUser).mockResolvedValue({ id: 7, username: "alice", bot: true });
    await expect(executeGitLabCommand(event(), botDeps)).resolves.toMatchObject({ status: "ignored" });
    expect(botDeps.scm.commentTarget).not.toHaveBeenCalled();

    const duplicateDeps = dependencies();
    vi.mocked(duplicateDeps.store.claim).mockResolvedValue(false);
    await expect(executeGitLabCommand(event(), duplicateDeps)).resolves.toEqual({ status: "ignored", reason: "duplicate command delivery" });
  });

  it("rejects actors below the configured project access level", async () => {
    const deps = dependencies();
    vi.mocked(deps.scm.memberAccess).mockResolvedValue(20);
    await expect(executeGitLabCommand(event(), deps)).rejects.toThrow("below required 30");
    expect(deps.scm.commentTarget).not.toHaveBeenCalled();
  });
});
