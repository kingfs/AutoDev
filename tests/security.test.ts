import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { autoDevConfigSchema } from "../src/config/schema.js";
import { materializeGates } from "../src/policies/gates.js";
import { redactText } from "../src/security/redact.js";
import { verifyGates } from "../src/stages/verify.js";
import type { PlanResult } from "../src/domain.js";

const plan = { expectedChangedPaths: [], changeRequest: {}, implementationSteps: [], acceptanceCriteria: [], affectedAreas: [], risks: [], proposedChecks: [], requiresHumanInput: false, humanQuestions: [], summary: "" } as unknown as PlanResult;

describe("security evidence", () => {
  it("redacts configured and common credential values", () => {
    expect(redactText("token=known-secret-value password=abcdefghijklmnop", ["known-secret-value"]))
      .toBe("token=[REDACTED] [REDACTED]");
  });

  it("fails the deterministic secret scan without storing the value", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-security-"));
    const artifacts = path.join(root, "artifacts");
    await writeFile(path.join(root, "config.txt"), "client_secret=abcdefghijklmnop\n");
    const config = autoDevConfigSchema.parse({ repository: { provider: "gitlab", url: "https://git.example/repo.git" }, automation: {}, verification: {}, security: {} });
    const evidence = await verifyGates({ workspace: root, artifactRoot: artifacts, gates: materializeGates(config, plan), checkpoint: { baseBranch: "main", baseSha: "x", taskBranch: "task", headSha: "x", changedFiles: ["config.txt"], clean: false }, config });
    expect(evidence.find((entry) => entry.gateId === "secret-scan")).toMatchObject({ passed: false });
    expect(JSON.stringify(evidence)).not.toContain("abcdefghijklmnop");
    await expect(readFile(path.join(artifacts, "secret-scan.log"), "utf8")).rejects.toThrow();
  });
});
