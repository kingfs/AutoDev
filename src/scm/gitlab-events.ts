import { createHash } from "node:crypto";

export type AutoDevCommand = "help" | "status" | "analyze" | "run" | "retry";
export type GitLabTargetKind = "issue" | "merge_request";

export interface GitLabCommandEvent {
  deliveryId: string;
  eventKind: "note" | "merge_request";
  actor: { id: number; username: string };
  project: { id: string; fullName: string };
  target?: { kind: GitLabTargetKind; iid: number };
  noteId?: number;
  command?: AutoDevCommand;
}

export function normalizeGitLabCommandEvent(body: unknown, headers: Record<string, string | undefined>): GitLabCommandEvent | null {
  const payload = object(body);
  const project = object(payload.project);
  const actor = object(payload.user);
  const attributes = object(payload.object_attributes);
  const eventKind = String(payload.object_kind ?? payload.event_type).toLowerCase();
  if (!["note", "confidential_note", "merge_request"].includes(eventKind)) return null;
  const base = {
    deliveryId: headers["x-gitlab-event-uuid"] ?? digest(payload),
    actor: { id: Number(actor.id), username: String(actor.username ?? "") },
    project: { id: String(project.id ?? ""), fullName: String(project.path_with_namespace ?? "") },
  };
  if (!base.project.id || !base.project.fullName || !base.actor.id || !base.actor.username) throw new Error("GitLab event is missing project or actor identity");

  if (eventKind === "note" || eventKind === "confidential_note") {
    if (String(attributes.action ?? "create") !== "create") return null;
    const noteable = String(attributes.noteable_type ?? "").toLowerCase();
    const targetObject = noteable === "issue" ? object(payload.issue) : noteable === "mergerequest" ? object(payload.merge_request) : {};
    const kind = noteable === "issue" ? "issue" : noteable === "mergerequest" ? "merge_request" : null;
    if (!kind) return { ...base, eventKind: "note" };
    const iid = Number(targetObject.iid);
    const noteId = Number(attributes.id);
    if (!iid || !noteId) throw new Error("GitLab note is missing target or note identity");
    const command = parseAutoDevCommand(String(attributes.note ?? ""));
    return { ...base, eventKind: "note", target: { kind, iid }, noteId, ...(command ? { command } : {}) };
  }

  if (eventKind === "merge_request") {
    const iid = Number(attributes.iid);
    if (!iid) throw new Error("GitLab merge request event is missing iid");
    return { ...base, eventKind: "merge_request", target: { kind: "merge_request", iid } };
  }
  return null;
}

export function parseAutoDevCommand(note: string): AutoDevCommand | null {
  const match = /(?:^|\s)(?:@autodev|\/autodev)(?:\s+([a-z-]+))?(?=\s|$)/i.exec(note);
  if (!match) return null;
  const command = (match[1] ?? "help").toLowerCase();
  return ["help", "status", "analyze", "run", "retry"].includes(command) ? command as AutoDevCommand : "help";
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24); }
