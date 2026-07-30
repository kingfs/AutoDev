import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { autoDevConfigSchema } from "../src/config/schema.js";
import type { PlanResult } from "../src/domain.js";
import { addChangedPathGates, materializeGates } from "../src/policies/gates.js";
import { globMatches } from "../src/policies/glob.js";
import { requiredGatesPassed, verifyGates } from "../src/stages/verify.js";

const config = autoDevConfigSchema.parse({
  repository: { provider: "gitlab", url: "https://git.example/repo.git" }, automation: {},
  verification: { commands: [{ id: "base", command: "true" }], path_rules: [{ pattern: "frontend/**", commands: [{ id: "frontend", command: "test -f ok" }] }] },
  security: { denied_paths: [".gitlab-ci.yml"] },
});
const plan: PlanResult = { summary: "s", acceptanceCriteria: [], affectedAreas: [], implementationSteps: [], risks: [], expectedChangedPaths: ["frontend/a.ts"], proposedChecks: [], requiresHumanInput: false, humanQuestions: [], changeRequest: { title: "t", description: "d", draft: true } };

describe("quality gates", () => {
  it("matches recursive paths", () => {
    expect(globMatches("frontend/**", "frontend/src/a.ts")).toBe(true);
    expect(globMatches("*.ts", "frontend/a.ts")).toBe(false);
  });

  it("freezes repository and plan-derived checks without duplicates", () => {
    const gates = materializeGates(config, plan);
    expect(gates.map((gate) => gate.id)).toEqual(["git-changes", "denied-paths", "change-limits", "secret-scan", "base", "frontend"]);
    expect(addChangedPathGates(gates, config, ["frontend/other.ts"])).toHaveLength(6);
  });

  it("executes commands and enforces denied paths", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "autodev-gates-"));
    await writeFile(path.join(workspace, "ok"), "ok");
    const gates = materializeGates(config, plan);
    const evidence = await verifyGates({ workspace, artifactRoot: path.join(workspace, "artifacts"), gates, config, checkpoint: { baseBranch: "main", baseSha: "a", taskBranch: "task", headSha: "a", changedFiles: ["frontend/a.ts"], clean: false } });
    expect(requiredGatesPassed(gates, evidence)).toBe(true);
  });
});
