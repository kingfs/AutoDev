import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutoDevConfig } from "../config/schema.js";
import type { GateEvidence, GitCheckpoint, QualityGate } from "../domain.js";
import { runCommand } from "../git/command.js";
import { globMatches } from "../policies/glob.js";

export async function verifyGates(options: {
  workspace: string;
  artifactRoot: string;
  gates: QualityGate[];
  checkpoint: GitCheckpoint;
  config: AutoDevConfig;
}): Promise<GateEvidence[]> {
  await mkdir(options.artifactRoot, { recursive: true });
  const evidence: GateEvidence[] = [];
  for (const gate of options.gates) {
    if (gate.type === "git") {
      const passed = options.checkpoint.changedFiles.length > 0;
      evidence.push({ gateId: gate.id, passed, summary: passed ? `${options.checkpoint.changedFiles.length} changed files` : "no changed files" });
      continue;
    }
    if (gate.type === "path") {
      const denied = options.checkpoint.changedFiles.filter((file) => options.config.security.denied_paths.some((pattern) => globMatches(pattern, file)));
      evidence.push({ gateId: gate.id, passed: denied.length === 0, summary: denied.length ? `denied paths changed: ${denied.join(", ")}` : "no denied paths changed" });
      continue;
    }
    if (gate.type === "command" && gate.command) {
      const result = await runCommand("bash", ["-lc", gate.command], { cwd: path.resolve(options.workspace, gate.cwd ?? "."), timeoutMs: 30 * 60_000 });
      const artifact = path.join(options.artifactRoot, `${gate.id}.log`);
      await writeFile(artifact, [`$ ${gate.command}`, result.stdout, result.stderr].join("\n"), { mode: 0o600 });
      evidence.push({ gateId: gate.id, passed: result.exitCode === 0, summary: result.exitCode === 0 ? "command passed" : `command failed with exit code ${result.exitCode}`, command: gate.command, exitCode: result.exitCode, durationMs: result.durationMs, artifact });
    }
  }
  return evidence;
}

export function requiredGatesPassed(gates: QualityGate[], evidence: GateEvidence[]): boolean {
  const byId = new Map(evidence.map((entry) => [entry.gateId, entry]));
  return gates.filter((gate) => gate.required).every((gate) => byId.get(gate.id)?.passed === true);
}
