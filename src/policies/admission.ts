import type { AutoDevConfig } from "../config/schema.js";
import type { AdmissionDecision, WorkItem } from "../domain.js";

const ACTIONABLE = new Set(["open", "opened", "reopen", "reopened", "update", "updated", "labeled"]);

export function idempotencyKey(item: WorkItem): string {
  return [item.provider, item.repository.id, item.issue.id, item.action, item.revision].join(":");
}

export function decideAdmission(item: WorkItem, config: AutoDevConfig): AdmissionDecision {
  if (item.provider !== config.repository.provider) {
    return reject(`provider ${item.provider} does not match configured provider ${config.repository.provider}`, config);
  }
  if (!ACTIONABLE.has(item.action.toLowerCase())) {
    return reject(`issue action ${item.action} is not actionable`, config);
  }
  const allowlist = config.repository.allowlist;
  if (allowlist.length > 0 && !allowlist.includes(item.repository.fullName)) {
    return reject(`repository ${item.repository.fullName} is not allowlisted`, config);
  }
  if (!item.issue.labels.includes(config.repository.required_label)) {
    return reject(`missing required label ${config.repository.required_label}`, config);
  }
  const authors = config.security.allowed_authors;
  if (authors.length > 0 && !authors.includes(item.issue.author)) {
    return reject(`author ${item.issue.author} is not allowlisted`, config);
  }
  return { accepted: true, mode: config.automation.mode, reason: "admission policy passed" };
}

function reject(reason: string, config: AutoDevConfig): AdmissionDecision {
  return { accepted: false, mode: config.automation.mode, reason };
}
