import { describe, expect, it, vi } from "vitest";
import type { SCMClient } from "../src/scm/scm.js";
import { waitForPipeline } from "../src/stages/ci.js";

describe("CI observation", () => {
  it("binds success to the requested SHA", async () => {
    const scm = { findPipeline: vi.fn().mockResolvedValue({ id: "1", sha: "abc", status: "success", url: "u" }), failedJobs: vi.fn() } as unknown as SCMClient;
    const result = await waitForPipeline({ scm, repositoryId: "r", sha: "abc", timeoutMs: 100, pollIntervalMs: 1 });
    expect(result.pipeline.status).toBe("success");
  });

  it("rejects a stale SHA", async () => {
    const scm = { findPipeline: vi.fn().mockResolvedValue({ id: "1", sha: "old", status: "success", url: "u" }) } as unknown as SCMClient;
    await expect(waitForPipeline({ scm, repositoryId: "r", sha: "new", timeoutMs: 100, pollIntervalMs: 1 })).rejects.toThrow("unexpected SHA");
  });

  it("honors cancellation from the platform run", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const scm = { findPipeline: vi.fn() } as unknown as SCMClient;
    await expect(waitForPipeline({ scm, repositoryId: "r", sha: "new", timeoutMs: 100, pollIntervalMs: 1, signal: controller.signal })).rejects.toThrow("cancelled");
    expect(scm.findPipeline).not.toHaveBeenCalled();
  });
});
