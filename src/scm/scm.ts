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
  const response = await fetcher(url, init);
  const body = await response.text();
  if (!expected.includes(response.status)) throw new SCMRequestError(response.status, body, `${init.method ?? "GET"} ${url}`);
  return body ? JSON.parse(body) as T : {} as T;
}
