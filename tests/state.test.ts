import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkItem } from "../src/domain.js";
import { reconcile } from "../src/controller/reconciler.js";
import { beginRevision, createRunState, currentRevision } from "../src/state/model.js";
import { FileRunStateStore } from "../src/state/store.js";

const item: WorkItem = {
  provider: "gitlab",
  deliveryId: "delivery-1",
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
});
