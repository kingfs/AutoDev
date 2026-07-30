import type { JobFailure, Pipeline } from "../domain.js";
import type { SCMClient } from "../scm/scm.js";

export async function waitForPipeline(options: {
  scm: SCMClient;
  repositoryId: string;
  sha: string;
  timeoutMs: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}): Promise<{ pipeline: Pipeline; failures: JobFailure[] }> {
  const deadline = Date.now() + options.timeoutMs;
  const interval = options.pollIntervalMs ?? 15_000;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new Error("CI observation cancelled");
    const pipeline = await options.scm.findPipeline(options.repositoryId, options.sha);
    if (pipeline && pipeline.sha !== options.sha) throw new Error(`SCM returned pipeline for unexpected SHA ${pipeline.sha}`);
    if (pipeline && ["success", "failed", "cancelled", "skipped"].includes(pipeline.status)) {
      return { pipeline, failures: pipeline.status === "failed" ? await options.scm.failedJobs(options.repositoryId, pipeline) : [] };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`timed out waiting for CI pipeline for ${options.sha}`);
}
