import { createHash } from "node:crypto";
import type { WorkItem } from "../domain.js";

export function normalizeWebhook(provider: "gitlab" | "github", body: unknown, headers: Record<string, string | undefined>): WorkItem {
  return provider === "gitlab" ? normalizeGitLab(body as Record<string, unknown>, headers) : normalizeGitHub(body as Record<string, unknown>, headers);
}

function normalizeGitLab(payload: Record<string, unknown>, headers: Record<string, string | undefined>): WorkItem {
  const project = object(payload.project);
  const attributes = object(payload.object_attributes);
  const user = object(payload.user);
  const labels = array(attributes.labels).map((label) => String(object(label).title ?? object(label).name ?? "")).filter(Boolean);
  const updatedAt = String(attributes.updated_at ?? attributes.created_at ?? new Date(0).toISOString());
  const issueId = String(attributes.id ?? attributes.iid ?? "");
  const repositoryId = String(project.id ?? project.path_with_namespace ?? "");
  requireFields({ issueId, repositoryId });
  return {
    provider: "gitlab",
    deliveryId: headers["x-gitlab-event-uuid"] ?? digest(payload),
    actor: String(user.username ?? user.name ?? "unknown"),
    action: String(attributes.action ?? payload.event_type ?? "update"),
    revision: updatedAt,
    repository: { provider: "gitlab", id: repositoryId, fullName: String(project.path_with_namespace ?? project.name ?? repositoryId), cloneUrl: String(project.git_http_url ?? project.http_url ?? ""), webUrl: String(project.web_url ?? ""), defaultBranch: String(project.default_branch ?? "main") },
    issue: { id: issueId, number: Number(attributes.iid ?? attributes.id), title: String(attributes.title ?? ""), body: String(attributes.description ?? ""), labels, author: String(user.username ?? user.name ?? "unknown"), url: String(attributes.url ?? ""), updatedAt },
  };
}

function normalizeGitHub(payload: Record<string, unknown>, headers: Record<string, string | undefined>): WorkItem {
  const repository = object(payload.repository);
  const issue = object(payload.issue);
  const user = object(issue.user);
  const sender = object(payload.sender);
  const labels = array(issue.labels).map((label) => typeof label === "string" ? label : String(object(label).name ?? "")).filter(Boolean);
  const updatedAt = String(issue.updated_at ?? issue.created_at ?? new Date(0).toISOString());
  const issueId = String(issue.id ?? issue.number ?? "");
  const repositoryId = String(repository.id ?? repository.full_name ?? "");
  requireFields({ issueId, repositoryId });
  return {
    provider: "github",
    deliveryId: headers["x-github-delivery"] ?? digest(payload),
    actor: String(sender.login ?? "unknown"),
    action: String(payload.action ?? "update"),
    revision: updatedAt,
    repository: { provider: "github", id: repositoryId, fullName: String(repository.full_name ?? repository.name ?? repositoryId), cloneUrl: String(repository.clone_url ?? ""), webUrl: String(repository.html_url ?? ""), defaultBranch: String(repository.default_branch ?? "main") },
    issue: { id: issueId, number: Number(issue.number), title: String(issue.title ?? ""), body: String(issue.body ?? ""), labels, author: String(user.login ?? "unknown"), url: String(issue.html_url ?? ""), updatedAt },
  };
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24); }
function requireFields(fields: Record<string, string>): void { for (const [name, value] of Object.entries(fields)) if (!value) throw new Error(`webhook is missing ${name}`); }
