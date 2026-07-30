import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { autoDevConfigSchema } from "../src/config/schema.js";
import { executeWorkflow } from "../src/controller/workflow.js";
import type { ImplementationResult, PlanResult, ReviewResult, WorkItem } from "../src/domain.js";
import { runChecked } from "../src/git/command.js";
import type { DevelopmentRuntime } from "../src/runtime/runtime.js";
import type { SCMClient } from "../src/scm/scm.js";
import { FileRunStateStore } from "../src/state/store.js";

describe("workflow integration", () => {
  it("runs issue through plan, implementation, deterministic verify and no-push completion", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-workflow-"));
    const bare = path.join(root, "origin.git");
    const workspace = path.join(root, "workspace");
    await runChecked("git", ["init", "--bare", "-b", "main", bare], { cwd: root });
    await runChecked("git", ["clone", bare, workspace], { cwd: root });
    await runChecked("git", ["config", "user.name", "AutoDev Test"], { cwd: workspace });
    await runChecked("git", ["config", "user.email", "autodev@example.test"], { cwd: workspace });
    await runChecked("bash", ["-lc", "echo base > README.md"], { cwd: workspace });
    await runChecked("git", ["add", "README.md"], { cwd: workspace });
    await runChecked("git", ["commit", "-m", "base"], { cwd: workspace });
    await runChecked("git", ["push", "origin", "main"], { cwd: workspace });

    const repositoryUrl = `file://${bare}`;
    const config = autoDevConfigSchema.parse({
      repository: { provider: "gitlab", url: repositoryUrl, required_label: "ai-ready", allowlist: ["group/repo"] },
      automation: { mode: "no-push", ci_watch: false },
      verification: { commands: [{ id: "content", command: "grep -q implemented feature.txt" }] },
      security: {},
    });
    const item: WorkItem = {
      provider: "gitlab", deliveryId: "d", actor: "alice", action: "open", revision: "r",
      repository: { provider: "gitlab", id: "1", fullName: "group/repo", cloneUrl: repositoryUrl, webUrl: "https://git.example/group/repo", defaultBranch: "main" },
      issue: { id: "2", number: 7, title: "Add feature", body: "Create feature.txt", labels: ["ai-ready"], author: "alice", url: "https://git.example/issues/7", updatedAt: "r" },
    };
    const plan: PlanResult = { summary: "Add file", acceptanceCriteria: ["file exists"], affectedAreas: ["root"], implementationSteps: [{ title: "write", description: "write file", expectedPaths: ["feature.txt"] }], risks: [], expectedChangedPaths: ["feature.txt"], proposedChecks: [], requiresHumanInput: false, humanQuestions: [], changeRequest: { title: "Add feature", description: "Adds file", draft: true } };
    const implementation: ImplementationResult = { summary: "implemented", changedFiles: ["feature.txt"], testsAttempted: [], remainingRisks: [] };
    const review: ReviewResult = { approved: true, summary: "approved", acceptanceCoverage: [{ criterion: "file exists", covered: true, evidence: "diff" }], findings: [] };
    const runtime: DevelopmentRuntime = {
      plan: vi.fn().mockResolvedValue({ value: plan, threadId: "p", transcript: "" }),
      implement: vi.fn().mockImplementation(async () => { await runChecked("bash", ["-lc", "echo broken > feature.txt"], { cwd: workspace }); return { value: implementation, threadId: "i", transcript: "" }; }),
      review: vi.fn().mockResolvedValue({ value: review, threadId: "r", transcript: "" }),
      repair: vi.fn().mockImplementation(async () => { await runChecked("bash", ["-lc", "echo implemented > feature.txt"], { cwd: workspace }); return { value: implementation, threadId: "fix", transcript: "" }; }),
    };
    const scm = { commentIssue: vi.fn().mockResolvedValue(undefined) } as unknown as SCMClient;
    const state = await executeWorkflow(item, "run-7", "key", { config, workspace, artifactRoot: path.join(root, "artifacts"), runtime, scm, store: new FileRunStateStore(path.join(root, "state")) });
    expect(state.status, state.terminalReason).toBe("completed");
    expect(state.revisions).toHaveLength(2);
    expect(state.revisions[0]?.verification?.passed).toBe(false);
    expect(state.revisions[1]?.verification?.passed).toBe(true);
    expect(runtime.repair).toHaveBeenCalledOnce();
    expect(scm.commentIssue).toHaveBeenCalledOnce();
  });

  it("persists cancellation received from the agent-compose run", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-cancel-"));
    const config = autoDevConfigSchema.parse({ repository: { provider: "gitlab", url: "https://git.example/group/repo.git" }, automation: {}, verification: {}, security: {} });
    const item = {
      provider: "gitlab", deliveryId: "d", actor: "alice", action: "open", revision: "r",
      repository: { provider: "gitlab", id: "1", fullName: "group/repo", cloneUrl: config.repository.url, webUrl: "https://git.example/group/repo", defaultBranch: "main" },
      issue: { id: "2", number: 8, title: "Cancel", body: "", labels: ["ai-ready"], author: "alice", url: "", updatedAt: "r" },
    } as WorkItem;
    const controller = new AbortController();
    controller.abort(new Error("platform cancelled"));
    const scm = { commentIssue: vi.fn().mockResolvedValue(undefined) } as unknown as SCMClient;
    const runtime = {} as DevelopmentRuntime;
    const store = new FileRunStateStore(path.join(root, "state"));
    const state = await executeWorkflow(item, "run-cancel", "key", { config, workspace: root, artifactRoot: path.join(root, "artifacts"), runtime, scm, store, signal: controller.signal });
    expect(state.status).toBe("cancelled");
    expect((await store.load("run-cancel"))?.status).toBe("cancelled");
  });
});
