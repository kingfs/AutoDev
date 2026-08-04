import { afterEach, describe, expect, it, vi } from "vitest";

const { agent } = vi.hoisted(() => ({ agent: vi.fn() }));

vi.mock("@chaitin-ai/agent-compose-runtime-sdk", () => ({
  default: { agent },
}));

import { AgentComposeRuntime } from "../src/runtime/runtime.js";

const validPlan = {
  summary: "Add a regression test",
  acceptanceCriteria: ["The test passes"],
  affectedAreas: ["tests"],
  implementationSteps: [{ title: "Test", description: "Add coverage", expectedPaths: ["tests/example.test.ts"] }],
  risks: [],
  expectedChangedPaths: ["tests/example.test.ts"],
  proposedChecks: ["npm test"],
  requiresHumanInput: false,
  humanQuestions: [],
  changeRequest: { title: "Add coverage", description: "Adds regression coverage", draft: true },
};

function subject(redactedEnv: string[] = [], provider = "codex"): AgentComposeRuntime {
  return new AgentComposeRuntime({ provider, workspace: "/workspace", stateRoot: "/state", timeoutMs: 1_000, redactedEnv });
}

afterEach(() => {
  agent.mockReset();
  delete process.env.RUNTIME_TEST_SECRET;
});

describe("AgentComposeRuntime structured output", () => {
  it("uses the SDK validated JSON on the first attempt", async () => {
    agent.mockResolvedValue({ json: validPlan, finalText: JSON.stringify(validPlan), threadId: "first", transcript: "ok" });

    await expect(subject().plan("plan")).resolves.toMatchObject({ value: validPlan, threadId: "first" });
    expect(agent).toHaveBeenCalledTimes(1);
    expect(agent.mock.calls[0]![1]).toHaveProperty("outputSchema");
  });

  it("retries known provider incompatibility and validates an explicit fenced JSON result", async () => {
    agent
      .mockRejectedValueOnce(new Error("agent finalText is not valid JSON for outputSchema"))
      .mockResolvedValueOnce({ json: null, finalText: `\`\`\`json\n${JSON.stringify(validPlan)}\n\`\`\``, threadId: "retry", transcript: "retried" });

    await expect(subject().plan("plan")).resolves.toMatchObject({ value: validPlan, threadId: "retry" });
    expect(agent).toHaveBeenCalledTimes(2);
    expect(agent.mock.calls[1]![0]).toContain("Return exactly one JSON value");
    expect(agent.mock.calls[1]![1]).not.toHaveProperty("outputSchema");
  });

  it("rejects prose around fallback JSON and restores redacted environment", async () => {
    process.env.RUNTIME_TEST_SECRET = "do-not-expose";
    agent
      .mockRejectedValueOnce(new Error("agent finalText is not valid JSON for outputSchema"))
      .mockImplementationOnce(async () => {
        expect(process.env.RUNTIME_TEST_SECRET).toBeUndefined();
        return { json: null, finalText: `Here is the result: ${JSON.stringify(validPlan)}`, threadId: "retry", transcript: "bad" };
      });

    await expect(subject(["RUNTIME_TEST_SECRET"]).plan("plan")).rejects.toThrow(SyntaxError);
    expect(process.env.RUNTIME_TEST_SECRET).toBe("do-not-expose");
  });

  it("does not retry unrelated agent failures", async () => {
    agent.mockRejectedValue(new Error("agent timed out"));

    await expect(subject().plan("plan")).rejects.toThrow("agent timed out");
    expect(agent).toHaveBeenCalledTimes(1);
  });

  it("uses prompt-guided strict JSON for runners without native output schema support", async () => {
    agent.mockResolvedValue({ json: null, finalText: JSON.stringify(validPlan), threadId: "opencode", transcript: "ok" });

    await expect(subject([], "opencode").plan("plan")).resolves.toMatchObject({ value: validPlan, threadId: "opencode" });
    expect(agent).toHaveBeenCalledTimes(1);
    expect(agent.mock.calls[0]![0]).toContain("Return exactly one JSON value");
    expect(agent.mock.calls[0]![1]).not.toHaveProperty("outputSchema");
  });
});
