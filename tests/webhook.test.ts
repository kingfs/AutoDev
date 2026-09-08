import { describe, expect, it } from "vitest";
import { normalizeWebhook } from "../src/scm/webhook.js";
import { normalizeGitLabCommandEvent, parseAutoDevCommand } from "../src/scm/gitlab-events.js";

describe("webhook normalization", () => {
  it("normalizes a GitLab issue hook", () => {
    const item = normalizeWebhook("gitlab", {
      event_type: "issue", user: { username: "alice" },
      project: { id: 1, path_with_namespace: "group/repo", git_http_url: "https://git/repo.git", web_url: "https://git/repo", default_branch: "main" },
      object_attributes: { id: 2, iid: 3, action: "open", title: "Fix", description: "Body", updated_at: "2026-01-01T00:00:00Z", url: "https://git/issues/3", labels: [{ title: "ai-ready" }] },
    }, { "x-gitlab-event-uuid": "delivery" });
    expect(item.repository.fullName).toBe("group/repo");
    expect(item.issue.labels).toEqual(["ai-ready"]);
    expect(item.deliveryId).toBe("delivery");
    expect(item.actor).toBe("alice");
  });

  it("normalizes a GitHub issue hook", () => {
    const item = normalizeWebhook("github", {
      action: "opened",
      repository: { id: 1, full_name: "org/repo", clone_url: "https://github/repo.git", html_url: "https://github/repo", default_branch: "main" },
      issue: { id: 2, number: 4, title: "Feature", body: "Body", updated_at: "2026-01-01T00:00:00Z", html_url: "https://github/issues/4", user: { login: "bob" }, labels: [{ name: "ai-ready" }] },
      sender: { login: "maintainer" },
    }, { "x-github-delivery": "delivery" });
    expect(item.provider).toBe("github");
    expect(item.issue.author).toBe("bob");
    expect(item.actor).toBe("maintainer");
  });
});

describe("GitLab command events", () => {
  it("parses an AutoDev command from an issue note", () => {
    const event = normalizeGitLabCommandEvent({
      object_kind: "note",
      user: { id: 7, username: "alice" },
      project: { id: 1, path_with_namespace: "group/repo" },
      object_attributes: { id: 9, action: "create", noteable_type: "Issue", note: "please @autodev analyze" },
      issue: { iid: 3 },
    }, { "x-gitlab-event-uuid": "delivery" });
    expect(event).toMatchObject({ deliveryId: "delivery", command: "analyze", target: { kind: "issue", iid: 3 }, noteId: 9 });
  });

  it("supports slash commands and makes a bare mention safe help", () => {
    expect(parseAutoDevCommand("/autodev status")).toBe("status");
    expect(parseAutoDevCommand("@autodev run")).toBe("run");
    expect(parseAutoDevCommand("@autodev retry")).toBe("retry");
    expect(parseAutoDevCommand("@autodev review")).toBe("review");
    expect(parseAutoDevCommand("@autodev")).toBe("help");
    expect(parseAutoDevCommand("ordinary comment")).toBeNull();
  });

  it("recognizes MR events without turning them into issue work", () => {
    expect(normalizeGitLabCommandEvent({
      object_kind: "merge_request", user: { id: 7, username: "alice" },
      project: { id: 1, path_with_namespace: "group/repo" }, object_attributes: { iid: 4 },
    }, {})).toMatchObject({ eventKind: "merge_request", target: { kind: "merge_request", iid: 4 } });
  });
});
