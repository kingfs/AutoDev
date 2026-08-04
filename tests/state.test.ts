import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkItem } from "../src/domain.js";
import { reconcile } from "../src/controller/reconciler.js";
import { beginRevision, createRunState, currentRevision, replayFailedRun, resumeFromHumanInput } from "../src/state/model.js";
import { FileRunStateStore } from "../src/state/store.js";

const item: WorkItem = {
  provider: "gitlab",
  deliveryId: "delivery-1",
  actor: "alice",
  action: "open",
  revision: "2026-07-30T00:00:00Z",
  repository: { provider: "gitlab", id: "1", fullName: "group/repo", cloneUrl: "https://git/repo.git", webUrl: "https://git/repo", defaultBranch: "main" },
  issue: { id: "2", number: 3, title: "Fix bug", body: "body", labels: ["ai-ready"], author: "alice", url: "https://git/issues/3", updatedAt: "2026-07-30T00:00:00Z" },
};

describe("run state", () => {
  it("persists atomically and reloads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-state-"));
    const store = new FileRunStateStore(root);
    const state = createRunState("run-1", "key", item);
    await store.save(state);
    expect((await store.load("run-1"))?.workItem.issue.number).toBe(3);
  });

  it("atomically claims an idempotency key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-state-"));
    const store = new FileRunStateStore(root);
    const [first, second] = await Promise.all([store.claim("event-key", "run-1"), store.claim("event-key", "run-2")]);
    expect([first, second].filter((entry) => entry.claimed)).toHaveLength(1);
    expect(first.runId).toBe(second.runId);
  });

  it("creates revision-scoped evidence", () => {
    const state = createRunState("run-1", "key", item);
    const first = beginRevision(state, "first");
    first.verification = { passed: true, evidence: [], verifiedAt: new Date().toISOString() };
    const second = beginRevision(state, "repair");
    expect(second.number).toBe(2);
    expect(currentRevision(state)?.verification).toBeUndefined();
  });

  it("reconciles only unsatisfied conditions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-state-"));
    const store = new FileRunStateStore(root);
    const state = createRunState("run-1", "key", item);
    const calls: string[] = [];
    await reconcile(state, store, [
      { name: "admit", satisfied: (s) => Boolean(s.admission), run: async (s) => { calls.push("admit"); s.admission = { accepted: true, mode: "draft", reason: "ok" }; } },
      { name: "finish", satisfied: (s) => s.status === "completed", run: async (s) => { calls.push("finish"); s.status = "completed"; } },
    ]);
    expect(calls).toEqual(["admit", "finish"]);
  });

  it("binds human approval to the current implementation revision", () => {
    const state = createRunState("run-1", "key", item);
    const revision = beginRevision(state, "sensitive change");
    state.status = "needs_human";
    state.currentStage = "human-review";
    const updated = { ...item, revision: "later", actor: "maintainer", issue: { ...item.issue, labels: [...item.issue.labels, "ai-approved"] } };
    expect(resumeFromHumanInput(state, updated, "later-key", "ai-approved")).toBe(true);
    expect(state.humanApprovals).toEqual([{ revision: revision.number, actor: "maintainer", approvedAt: expect.any(String) }]);
    expect(state.status).toBe("running");
  });

  it("replays a failed run only after a newer work item revision", () => {
    const state = createRunState("run-1", "key", item);
    state.status = "failed";
    state.currentStage = "plan";
    state.terminalReason = "provider failed";
    state.report = { summary: "failed", reportedAt: new Date().toISOString() };

    expect(replayFailedRun(state, item, "same-key")).toBe(false);
    const updated = { ...item, revision: "later", issue: { ...item.issue, updatedAt: "later" } };
    expect(replayFailedRun(state, updated, "later-key")).toBe(true);
    expect(state).toMatchObject({ status: "running", currentStage: "intake-replay", idempotencyKey: "later-key", workItem: updated });
    expect(state.terminalReason).toBeUndefined();
    expect(state.report).toBeUndefined();
  });
});
