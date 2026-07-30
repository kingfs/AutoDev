import { describe, expect, it, vi } from "vitest";
import type { WorkItem } from "../src/domain.js";
import { GitHubClient } from "../src/scm/github.js";
import { GitLabClient } from "../src/scm/gitlab.js";
import { requestJson } from "../src/scm/scm.js";

const item = {
  repository: { id: "group/repo" }, issue: { number: 7 },
} as WorkItem;

function response(body: unknown, status = 200): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SCM comments", () => {
  it("updates an existing GitLab AutoDev comment", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([{ id: 9, body: "<!-- autodev:run-1 --> old" }]))
      .mockResolvedValueOnce(response({ id: 9 }, 200));
    const client = new GitLabClient({ baseUrl: "https://gitlab.example", token: "secret", fetcher });
    await client.commentIssue(item, "<!-- autodev:run-1 --> new");
    expect(fetcher.mock.calls[1]?.[0]).toContain("/notes/9");
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PUT");
  });

  it("creates a GitHub comment when the run marker is absent", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: 4 }, 201));
    const client = new GitHubClient({ token: "secret", repository: "org/repo", fetcher });
    await client.commentIssue(item, "<!-- autodev:run-1 --> result");
    expect(fetcher.mock.calls[1]?.[0]).toContain("/issues/7/comments");
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("POST");
  });

  it("paginates GitHub comments before updating a run marker", async () => {
    const firstPage = Array.from({ length: 100 }, (_, id) => ({ id, body: "other" }));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response([{ id: 101, body: "<!-- autodev:run-1 --> old" }]))
      .mockResolvedValueOnce(response({ id: 101 }));
    const client = new GitHubClient({ token: "secret", repository: "org/repo", fetcher });
    await client.commentIssue(item, "<!-- autodev:run-1 --> new");
    expect(fetcher.mock.calls[1]?.[0]).toContain("page=2");
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe("PATCH");
  });

  it("retries a transient idempotent SCM request", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ error: "busy" }, 503)).mockResolvedValueOnce(response({ ok: true }));
    await expect(requestJson<{ ok: boolean }>(fetcher, "https://scm.example/value", {}, [200])).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
