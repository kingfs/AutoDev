import type { ChangeRequest, JobFailure, Pipeline, WorkItem } from "../domain.js";
import type { PublishChangeRequestInput, SCMClient } from "./scm.js";
import { requestJson } from "./scm.js";

interface GitLabMR { id: number; iid: number; web_url: string; source_branch: string; target_branch: string; state: string; draft?: boolean; work_in_progress?: boolean }
interface GitLabPipeline { id: number; sha: string; status: string; web_url: string }

export class GitLabClient implements SCMClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(options: { baseUrl: string; token: string; fetcher?: typeof fetch }) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#token = options.token;
    this.#fetch = options.fetcher ?? fetch;
  }

  async commentIssue(item: WorkItem, body: string): Promise<void> {
    await this.#request(`/projects/${encodeURIComponent(item.repository.id)}/issues/${item.issue.number}/notes`, { method: "POST", body: JSON.stringify({ body }) }, [201]);
  }

  async findChangeRequest(input: PublishChangeRequestInput): Promise<ChangeRequest | null> {
    const query = new URLSearchParams({ state: "opened", source_branch: input.sourceBranch, target_branch: input.targetBranch });
    const result = await this.#request<GitLabMR[]>(`/projects/${encodeURIComponent(input.repositoryId)}/merge_requests?${query}`, {}, [200]);
    return result[0] ? mapMR(result[0]) : null;
  }

  async createChangeRequest(input: PublishChangeRequestInput): Promise<ChangeRequest> {
    const title = input.draft && !/^draft:/i.test(input.title) ? `Draft: ${input.title}` : input.title;
    const result = await this.#request<GitLabMR>(`/projects/${encodeURIComponent(input.repositoryId)}/merge_requests`, {
      method: "POST", body: JSON.stringify({ source_branch: input.sourceBranch, target_branch: input.targetBranch, title, description: input.description, remove_source_branch: false }),
    }, [201]);
    return mapMR(result);
  }

  async updateChangeRequest(changeRequest: ChangeRequest, input: PublishChangeRequestInput): Promise<ChangeRequest> {
    const title = input.draft && !/^draft:/i.test(input.title) ? `Draft: ${input.title}` : input.title.replace(/^draft:\s*/i, "");
    const result = await this.#request<GitLabMR>(`/projects/${encodeURIComponent(input.repositoryId)}/merge_requests/${changeRequest.number}`, {
      method: "PUT", body: JSON.stringify({ title, description: input.description }),
    }, [200]);
    return mapMR(result);
  }

  async findPipeline(repositoryId: string, sha: string): Promise<Pipeline | null> {
    const query = new URLSearchParams({ sha, per_page: "1", order_by: "id", sort: "desc" });
    const result = await this.#request<GitLabPipeline[]>(`/projects/${encodeURIComponent(repositoryId)}/pipelines?${query}`, {}, [200]);
    return result[0] ? { id: String(result[0].id), sha: result[0].sha, status: normalizePipelineStatus(result[0].status), url: result[0].web_url } : null;
  }

  async failedJobs(repositoryId: string, pipeline: Pipeline): Promise<JobFailure[]> {
    const jobs = await this.#request<Array<{ id: number; name: string; web_url: string; status: string }>>(`/projects/${encodeURIComponent(repositoryId)}/pipelines/${pipeline.id}/jobs?scope[]=failed`, {}, [200]);
    return Promise.all(jobs.filter((job) => job.status === "failed").map(async (job) => {
      const response = await this.#fetch(`${this.#baseUrl}/api/v4/projects/${encodeURIComponent(repositoryId)}/jobs/${job.id}/trace`, { headers: this.#headers() });
      return { id: String(job.id), name: job.name, url: job.web_url, log: (await response.text()).slice(-200_000) };
    }));
  }

  #request<T>(path: string, init: RequestInit, expected: number[]): Promise<T> {
    return requestJson<T>(this.#fetch, `${this.#baseUrl}/api/v4${path}`, { ...init, headers: this.#headers(init.headers) }, expected);
  }

  #headers(existing?: HeadersInit): HeadersInit {
    return { "Content-Type": "application/json", "PRIVATE-TOKEN": this.#token, ...(existing as Record<string, string> | undefined) };
  }
}

function mapMR(value: GitLabMR): ChangeRequest {
  return { id: String(value.id), number: value.iid, url: value.web_url, sourceBranch: value.source_branch, targetBranch: value.target_branch, state: value.state === "merged" ? "merged" : value.state === "closed" ? "closed" : "open", draft: Boolean(value.draft ?? value.work_in_progress) };
}

function normalizePipelineStatus(value: string): Pipeline["status"] {
  if (value === "success") return "success";
  if (["failed"].includes(value)) return "failed";
  if (["canceled", "cancelled"].includes(value)) return "cancelled";
  if (["skipped"].includes(value)) return "skipped";
  if (["running"].includes(value)) return "running";
  return "pending";
}
