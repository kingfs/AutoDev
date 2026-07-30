import type { AutoDevConfig } from "../config/schema.js";
import type { PlanResult, QualityGate } from "../domain.js";
import { globMatches } from "./glob.js";

export function materializeGates(config: AutoDevConfig, plan: PlanResult): QualityGate[] {
  const gates: QualityGate[] = [
    { id: "git-changes", type: "git", description: "The task produces a non-empty scoped change.", required: true, source: "global" },
    { id: "denied-paths", type: "path", description: "No denied path is changed.", required: true, source: "global" },
  ];
  for (const check of config.verification.commands) {
    gates.push({ id: check.id, type: "command", description: `Run ${check.command}`, required: true, command: check.command, ...(check.cwd ? { cwd: check.cwd } : {}), source: "repository" });
  }
  const expected = new Set(plan.expectedChangedPaths.flatMap((name) => name ? [name] : []));
  for (const rule of config.verification.path_rules) {
    if (![...expected].some((filename) => globMatches(rule.pattern, filename))) continue;
    for (const check of rule.commands) {
      if (gates.some((gate) => gate.id === check.id)) continue;
      gates.push({ id: check.id, type: "command", description: `Run ${check.command}`, required: true, command: check.command, ...(check.cwd ? { cwd: check.cwd } : {}), source: "plan" });
    }
  }
  return gates;
}

export function addChangedPathGates(gates: QualityGate[], config: AutoDevConfig, changedFiles: string[]): QualityGate[] {
  const result = [...gates];
  for (const rule of config.verification.path_rules) {
    if (!changedFiles.some((filename) => globMatches(rule.pattern, filename))) continue;
    for (const check of rule.commands) {
      if (result.some((gate) => gate.id === check.id)) continue;
      result.push({ id: check.id, type: "command", description: `Run ${check.command}`, required: true, command: check.command, ...(check.cwd ? { cwd: check.cwd } : {}), source: "changed-path" });
    }
  }
  return result;
}
