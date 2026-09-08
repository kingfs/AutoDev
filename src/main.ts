import path from "node:path";
import { loadConfig } from "./config/load.js";
import { executeWorkflow } from "./controller/workflow.js";
import { idempotencyKey, taskKey } from "./policies/admission.js";
import { AgentComposeRuntime } from "./runtime/runtime.js";
import { createSCMClient } from "./scm/factory.js";
import { normalizeWebhook } from "./scm/webhook.js";
import { FileRunStateStore } from "./state/store.js";
import { FileLeaseManager } from "./state/lease.js";
import { parseDuration } from "./util/duration.js";
import { normalizeGitLabCommandEvent } from "./scm/gitlab-events.js";
import { GitLabClient } from "./scm/gitlab.js";
import { CommandStateStore } from "./state/command-store.js";
import { executeGitLabCommand } from "./controller/command.js";
import type { AutoDevConfig } from "./config/schema.js";
import type { WorkItem } from "./domain.js";

async function main(): Promise<void> {
  const config = await loadConfig(process.env.AUTODEV_CONFIG ?? "/etc/autodev/config.yml");
  const workspace = path.resolve(process.env.AUTODEV_WORKSPACE ?? "/workspace");
  const stateRoot = path.resolve(process.env.AUTODEV_STATE_ROOT ?? "/state");
  const rawEvent = JSON.parse(process.env.AUTODEV_WEBHOOK_EVENT ?? "{}") as { payload?: { body?: unknown; headers?: Record<string, string> } };
  const body = rawEvent.payload?.body ?? rawEvent;
  const headers = lowerHeaders(rawEvent.payload?.headers ?? {});
  if (config.repository.provider === "gitlab") {
    const commandEvent = normalizeGitLabCommandEvent(body, headers);
    if (commandEvent) {
      const scm = createSCMClient(config);
      if (!(scm instanceof GitLabClient)) throw new Error("GitLab command requires GitLab SCM client");
      const result = await executeGitLabCommand(commandEvent, {
        config,
        scm,
        store: new CommandStateStore(path.join(stateRoot, "commands")),
        runtime: new AgentComposeRuntime({ provider: config.automation.agent_provider, workspace, stateRoot: path.join(stateRoot, "agent"), timeoutMs: parseDuration(config.automation.run_timeout), redactedEnv: config.security.agent_redacted_env }),
        runIssue: (item, retry) => runIssueWorkflow(item, config, workspace, stateRoot, retry),
      });
      console.log(`__AUTODEV_COMMAND_RESULT__${JSON.stringify(result)}`);
      return;
    }
  }
  const item = normalizeWebhook(config.repository.provider, body, headers);
  const state = await runIssueWorkflow(item, config, workspace, stateRoot, false);
  console.log(`__AUTODEV_RESULT__${JSON.stringify(state)}`);
  if (["failed", "budget_exhausted", "cancelled"].includes(state.status)) process.exitCode = 1;
}

async function runIssueWorkflow(item: WorkItem, config: AutoDevConfig, workspace: string, stateRoot: string, forceRetry: boolean): Promise<{ runId: string; status: string; reason?: string; report?: unknown }> {
  const key = idempotencyKey(item);
  const store = new FileRunStateStore(path.join(stateRoot, "runs"));
  const proposedRunId = `run-${item.issue.number}-${keyHash(taskKey(item))}`;
  const claim = await store.claim(key, proposedRunId);
  const runId = claim.runId;
  const leases = new FileLeaseManager(path.join(stateRoot, "leases"));
  const lease = await leases.acquire(`${item.provider}:${item.repository.id}`, runId, parseDuration(config.automation.run_timeout) + 300_000);
  if (!lease) throw new Error(`repository ${item.repository.fullName} already has an active AutoDev run`);
  let state;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new Error(`AutoDev run exceeded ${config.automation.run_timeout}`)), parseDuration(config.automation.run_timeout));
  const terminate = (): void => controller.abort(new Error("AutoDev run cancelled by runtime"));
  process.once("SIGTERM", terminate);
  process.once("SIGINT", terminate);
  try {
    state = await executeWorkflow(item, runId, key, {
      config, workspace, artifactRoot: path.join(stateRoot, "artifacts", runId), store,
      runtime: new AgentComposeRuntime({ provider: config.automation.agent_provider, workspace, stateRoot: path.join(stateRoot, "agent"), timeoutMs: parseDuration(config.automation.run_timeout), redactedEnv: config.security.agent_redacted_env }),
      scm: createSCMClient(config),
      signal: controller.signal,
      forceRetry,
    });
  } finally {
    clearTimeout(deadline);
    process.off("SIGTERM", terminate);
    process.off("SIGINT", terminate);
    await leases.release(lease);
  }
  return { runId, status: state.status, ...(state.terminalReason ? { reason: state.terminalReason } : {}), ...(state.report ? { report: state.report } : {}) };
}

function lowerHeaders(headers: Record<string, string>): Record<string, string> { return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])); }
function keyHash(value: string): string { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }

main().catch((error) => { console.error(error); process.exitCode = 1; });
