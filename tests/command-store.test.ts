import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CommandStateStore } from "../src/state/command-store.js";

describe("command target state", () => {
  it("persists Target, Invocation and Attempt history", async () => {
    const store = new CommandStateStore(await mkdtemp(path.join(os.tmpdir(), "autodev-command-")));
    await store.startInvocation("gitlab:1:issue:3", "note-1:analyze", "analyze", "alice");
    await store.finishInvocation("gitlab:1:issue:3", "note-1:analyze", "completed", "valid");
    await store.startInvocation("gitlab:1:issue:3", "note-2:run", "run", "alice");
    const state = await store.loadTarget("gitlab:1:issue:3");
    expect(state?.invocations).toHaveLength(2);
    expect(state?.invocations[0]?.attempts[0]).toMatchObject({ number: 1, status: "completed", summary: "valid" });
    expect(state?.invocations[1]).toMatchObject({ command: "run", attempts: [{ status: "running" }] });
  });
});
