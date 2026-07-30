import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutoDevConfig } from "../config/schema.js";
import type { GateEvidence, GitCheckpoint, QualityGate } from "../domain.js";
import { runCommand } from "../git/command.js";
import { globMatches } from "../policies/glob.js";
import { configuredSecrets, containsSecret, redactText } from "../security/redact.js";

export async function verifyGates(options: {
  workspace: string;
  artifactRoot: string;
  gates: QualityGate[];
  checkpoint: GitCheckpoint;
  config: AutoDevConfig;
}): Promise<GateEvidence[]> {
  await mkdir(options.artifactRoot, { recursive: true });
  const evidence: GateEvidence[] = [];
  const secrets = configuredSecrets(options.config.security.agent_redacted_env);
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
    if (gate.type === "security") {
      const result = await verifySecurityGate(gate.id, options);
      evidence.push({ gateId: gate.id, ...result });
      continue;
    }
    if (gate.type === "command" && gate.command) {
      const result = await runCommand("bash", ["-lc", gate.command], { cwd: path.resolve(options.workspace, gate.cwd ?? "."), timeoutMs: 30 * 60_000 });
      const artifact = path.join(options.artifactRoot, `${gate.id}.log`);
      await writeFile(artifact, redactText([`$ ${gate.command}`, result.stdout, result.stderr].join("\n"), secrets), { mode: 0o600 });
      evidence.push({ gateId: gate.id, passed: result.exitCode === 0, summary: result.exitCode === 0 ? "command passed" : `command failed with exit code ${result.exitCode}`, command: gate.command, exitCode: result.exitCode, durationMs: result.durationMs, artifact });
    }
  }
  return evidence;
}

async function verifySecurityGate(gateId: string, options: Parameters<typeof verifyGates>[0]): Promise<{ passed: boolean; summary: string }> {
  const files = options.checkpoint.changedFiles;
  if (gateId === "change-limits") {
    if (files.length > options.config.security.max_changed_files) return { passed: false, summary: `${files.length} changed files exceeds limit ${options.config.security.max_changed_files}` };
    let total = 0;
    for (const file of files) {
      const filename = path.resolve(options.workspace, file);
      const relative = path.relative(options.workspace, filename);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return { passed: false, summary: `changed path escapes workspace: ${file}` };
      let stat;
      try { stat = await lstat(filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      if (stat.isSymbolicLink()) return { passed: false, summary: `symbolic link changes require human review: ${file}` };
      if (stat.size > options.config.security.max_file_bytes) return { passed: false, summary: `${file} exceeds file size limit` };
      total += stat.size;
    }
    if (total > options.config.security.max_diff_bytes) return { passed: false, summary: `changed file bytes ${total} exceeds limit ${options.config.security.max_diff_bytes}` };
    return { passed: true, summary: "change-set limits passed" };
  }
  if (gateId === "secret-scan") {
    const matches: string[] = [];
    for (const file of files) {
      try {
        const content = await readFile(path.resolve(options.workspace, file));
        if (content.includes(0)) continue;
        if (containsSecret(content.toString("utf8"), options.config.security.secret_patterns)) matches.push(file);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    return matches.length ? { passed: false, summary: `possible credential material in: ${matches.join(", ")}` } : { passed: true, summary: "secret scan passed" };
  }
  return { passed: false, summary: `unknown security gate ${gateId}` };
}

export function requiredGatesPassed(gates: QualityGate[], evidence: GateEvidence[]): boolean {
  const byId = new Map(evidence.map((entry) => [entry.gateId, entry]));
  return gates.filter((gate) => gate.required).every((gate) => byId.get(gate.id)?.passed === true);
}
