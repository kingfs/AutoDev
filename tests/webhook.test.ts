import { describe, expect, it } from "vitest";
import { normalizeWebhook } from "../src/scm/webhook.js";

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
