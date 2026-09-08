import { describe, expect, it, vi } from "vitest";
import type { AutoDevConfig } from "../src/config/schema.js";
import { executeGitLabCommand } from "../src/controller/command.js";
import type { DevelopmentRuntime } from "../src/runtime/runtime.js";
import type { GitLabClient } from "../src/scm/gitlab.js";
import type { CommandStateStore, CommandTargetState } from "../src/state/command-store.js";

const config = {
  repository: { allowlist: ["group/repo"] },
  security: { allowed_actors: [], gitlab_min_access_level: 30 },
} as unknown as AutoDevConfig;

function event(command: "help" | "status" | "analyze" = "help") {
  return { deliveryId: "delivery", eventKind: "note" as const, actor: { id: 7, username: "alice" }, project: { id: "1", fullName: "group/repo" }, target: { kind: "issue" as const, iid: 3 }, noteId: 9, command };
}

function dependencies() {
  let targetState: CommandTargetState | null = null;
  const scm = {
    currentUser: vi.fn().mockResolvedValue({ id: 99, username: "bot", bot: true }),
    project: vi.fn().mockResolvedValue({ id: 1, path_with_namespace: "group/repo" }),
    memberAccess: vi.fn().mockResolvedValue(30),
    target: vi.fn().mockResolvedValue({ kind: "issue", iid: 3, title: "Bug", description: "Broken", state: "opened", webUrl: "https://git/issue/3", labels: [] }),
    commentTarget: vi.fn().mockResolvedValue(undefined),
  } as unknown as GitLabClient;
  const store = {
    claim: vi.fn().mockResolvedValue(true),
    loadTarget: vi.fn().mockImplementation(async () => targetState),
    saveTarget: vi.fn().mockImplementation(async (state: CommandTargetState) => { targetState = state; }),
  } as unknown as CommandStateStore;
  const runtime = {
    analyze: vi.fn().mockResolvedValue({ value: { summary: "Evidence found", codeEvidence: [{ path: "src/a.ts", symbol: "run", evidence: "missing check" }], validity: "valid", necessity: "needed", feasibility: "feasible", risks: [], questions: [], recommendation: "proceed" }, threadId: "a", transcript: "" }),
  } as unknown as DevelopmentRuntime;
  return { config, scm, store, runtime };
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
    expect(deps.store.saveTarget).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed", summary: "Evidence found" }));
    expect(deps.scm.commentTarget).toHaveBeenCalledWith("1", "issue", 3, expect.stringContaining("结论建议：**proceed**"));
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
