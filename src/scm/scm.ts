import type { ChangeRequest, JobFailure, Pipeline, WorkItem } from "../domain.js";

export interface PublishChangeRequestInput {
  repositoryId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  draft: boolean;
  issueNumber: number;
}

export interface SCMClient {
  commentIssue(item: WorkItem, body: string): Promise<void>;
  findChangeRequest(input: PublishChangeRequestInput): Promise<ChangeRequest | null>;
  createChangeRequest(input: PublishChangeRequestInput): Promise<ChangeRequest>;
  updateChangeRequest(changeRequest: ChangeRequest, input: PublishChangeRequestInput): Promise<ChangeRequest>;
  findPipeline(repositoryId: string, sha: string): Promise<Pipeline | null>;
  failedJobs(repositoryId: string, pipeline: Pipeline): Promise<JobFailure[]>;
}

export class SCMRequestError extends Error {
  constructor(readonly status: number, readonly response: string, message: string) {
    super(`${message}: HTTP ${status}: ${response}`);
  }
}

export async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  expected: number[],
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const retryableMethod = ["GET", "HEAD", "PUT", "PATCH", "DELETE"].includes(method);
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const timeout = AbortSignal.timeout(30_000);
      response = await fetcher(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
      if (!retryableMethod || ![429, 502, 503, 504].includes(response.status) || attempt === 2) break;
      await response.arrayBuffer();
      await delay(retryDelayMs(response, attempt));
    } catch (error) {
      lastError = error;
      if (!retryableMethod || attempt === 2) throw error;
      await delay(100 * 2 ** attempt);
    }
  }
  if (!response) throw lastError ?? new Error(`${method} ${url} returned no response`);
  const body = await response.text();
  if (!expected.includes(response.status)) throw new SCMRequestError(response.status, body, `${init.method ?? "GET"} ${url}`);
  return body ? JSON.parse(body) as T : {} as T;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1_000, 5_000);
  }
  return 100 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
