import path from "node:path";
import { loadConfig } from "./config/load.js";
import { executeWorkflow } from "./controller/workflow.js";
import { idempotencyKey } from "./policies/admission.js";
import { AgentComposeRuntime } from "./runtime/runtime.js";
import { createSCMClient } from "./scm/factory.js";
import { normalizeWebhook } from "./scm/webhook.js";
import { FileRunStateStore } from "./state/store.js";
import { FileLeaseManager } from "./state/lease.js";
import { parseDuration } from "./util/duration.js";

async function main(): Promise<void> {
  const config = await loadConfig(process.env.AUTODEV_CONFIG ?? "/etc/autodev/config.yml");
  const workspace = path.resolve(process.env.AUTODEV_WORKSPACE ?? "/workspace");
  const stateRoot = path.resolve(process.env.AUTODEV_STATE_ROOT ?? "/state");
  const rawEvent = JSON.parse(process.env.AUTODEV_WEBHOOK_EVENT ?? "{}") as { payload?: { body?: unknown; headers?: Record<string, string> } };
  const item = normalizeWebhook(config.repository.provider, rawEvent.payload?.body ?? rawEvent, lowerHeaders(rawEvent.payload?.headers ?? {}));
  const key = idempotencyKey(item);
  const runId = `run-${item.issue.number}-${keyHash(key)}`;
  const store = new FileRunStateStore(path.join(stateRoot, "runs"));
  const leases = new FileLeaseManager(path.join(stateRoot, "leases"));
  const lease = await leases.acquire(`${item.provider}:${item.repository.id}`, runId, parseDuration(config.automation.run_timeout) + 300_000);
  if (!lease) throw new Error(`repository ${item.repository.fullName} already has an active AutoDev run`);
  let state;
  try {
    state = await executeWorkflow(item, runId, key, {
      config, workspace, artifactRoot: path.join(stateRoot, "artifacts", runId), store,
      runtime: new AgentComposeRuntime({ provider: config.automation.agent_provider, workspace, stateRoot: path.join(stateRoot, "agent"), timeoutMs: parseDuration(config.automation.run_timeout), redactedEnv: config.security.agent_redacted_env }),
      scm: createSCMClient(config),
    });
  } finally {
    await leases.release(lease);
  }
  console.log(`__AUTODEV_RESULT__${JSON.stringify({ runId, status: state.status, reason: state.terminalReason, report: state.report })}`);
  if (["failed", "budget_exhausted"].includes(state.status)) process.exitCode = 1;
}

function lowerHeaders(headers: Record<string, string>): Record<string, string> { return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])); }
function keyHash(value: string): string { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }

main().catch((error) => { console.error(error); process.exitCode = 1; });
