import type { ChangeRequest, JobFailure, Pipeline, WorkItem } from "../domain.js";
import type { PublishChangeRequestInput, SCMClient } from "./scm.js";
import { requestJson } from "./scm.js";

interface GitHubPR { id: number; number: number; html_url: string; head: { ref: string }; base: { ref: string }; state: string; draft?: boolean; merged_at?: string | null }

export class GitHubClient implements SCMClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #repository: string;
  readonly #fetch: typeof fetch;

  constructor(options: { baseUrl?: string; token: string; repository: string; fetcher?: typeof fetch }) {
    this.#baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.#token = options.token;
    this.#repository = options.repository;
    this.#fetch = options.fetcher ?? fetch;
  }

  async commentIssue(item: WorkItem, body: string): Promise<void> {
    const root = `/repos/${this.#repository}/issues/${item.issue.number}/comments`;
    const marker = body.match(/<!-- autodev:[^>]+ -->/)?.[0];
    if (marker) {
      const comments = await this.#paginate<{ id: number; body: string }>(root);
      const existing = comments.find((comment) => comment.body.includes(marker));
      if (existing) {
        await this.#request(`/repos/${this.#repository}/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) }, [200]);
        return;
      }
    }
    await this.#request(root, { method: "POST", body: JSON.stringify({ body }) }, [201]);
  }

  async findChangeRequest(input: PublishChangeRequestInput): Promise<ChangeRequest | null> {
    const owner = this.#repository.split("/")[0] ?? "";
    const query = new URLSearchParams({ state: "open", head: `${owner}:${input.sourceBranch}`, base: input.targetBranch });
    const prs = await this.#request<GitHubPR[]>(`/repos/${this.#repository}/pulls?${query}`, {}, [200]);
    return prs[0] ? mapPR(prs[0]) : null;
  }

  async createChangeRequest(input: PublishChangeRequestInput): Promise<ChangeRequest> {
    const result = await this.#request<GitHubPR>(`/repos/${this.#repository}/pulls`, { method: "POST", body: JSON.stringify({ title: input.title, body: input.description, head: input.sourceBranch, base: input.targetBranch, draft: input.draft }) }, [201]);
    return mapPR(result);
  }

  async updateChangeRequest(changeRequest: ChangeRequest, input: PublishChangeRequestInput): Promise<ChangeRequest> {
    const result = await this.#request<GitHubPR>(`/repos/${this.#repository}/pulls/${changeRequest.number}`, { method: "PATCH", body: JSON.stringify({ title: input.title, body: input.description, base: input.targetBranch }) }, [200]);
    return mapPR(result);
  }

  async findPipeline(_repositoryId: string, sha: string): Promise<Pipeline | null> {
    const runs = await this.#request<{ workflow_runs: Array<{ id: number; head_sha: string; status: string; conclusion: string | null; html_url: string }> }>(`/repos/${this.#repository}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=1`, {}, [200]);
    const run = runs.workflow_runs[0];
    if (!run) return null;
    const status = run.status !== "completed" ? "running" : run.conclusion === "success" ? "success" : run.conclusion === "cancelled" ? "cancelled" : run.conclusion === "skipped" ? "skipped" : "failed";
    return { id: String(run.id), sha: run.head_sha, status, url: run.html_url };
  }

  async failedJobs(_repositoryId: string, pipeline: Pipeline): Promise<JobFailure[]> {
    const jobs = await this.#paginate<{ id: number; name: string; html_url: string; conclusion: string | null; steps?: Array<{ name: string; conclusion: string | null }> }>(`/repos/${this.#repository}/actions/runs/${pipeline.id}/jobs`, "jobs", "&filter=latest");
    return Promise.all(jobs.filter((job) => job.conclusion === "failure").map(async (job) => {
      const steps = (job.steps ?? []).filter((step) => step.conclusion === "failure").map((step) => `failed step: ${step.name}`).join("\n");
      let log = steps;
      try { log = await this.#requestText(`/repos/${this.#repository}/actions/jobs/${job.id}/logs`); } catch { /* Step evidence remains available when logs are unavailable. */ }
      return { id: String(job.id), name: job.name, url: job.html_url, log: log.slice(-200_000) };
    }));
  }

  async #paginate<T>(root: string, field?: string, suffix = ""): Promise<T[]> {
    const values: T[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const separator = root.includes("?") ? "&" : "?";
      const result = await this.#request<T[] | Record<string, unknown>>(`${root}${separator}per_page=100&page=${page}${suffix}`, {}, [200]);
      const entries = (field ? (result as Record<string, unknown>)[field] : result) as T[];
      values.push(...entries);
      if (entries.length < 100) return values;
    }
    throw new Error(`GitHub pagination exceeded 100 pages for ${root}`);
  }

  async #requestText(path: string): Promise<string> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { headers: this.#headers(), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GET ${path} failed with HTTP ${response.status}`);
    return response.text();
  }

  #request<T>(path: string, init: RequestInit, expected: number[]): Promise<T> {
    return requestJson<T>(this.#fetch, `${this.#baseUrl}${path}`, { ...init, headers: this.#headers() }, expected);
  }

  #headers(): HeadersInit { return { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${this.#token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }; }
}

function mapPR(value: GitHubPR): ChangeRequest {
  return { id: String(value.id), number: value.number, url: value.html_url, sourceBranch: value.head.ref, targetBranch: value.base.ref, state: value.merged_at ? "merged" : value.state === "closed" ? "closed" : "open", draft: Boolean(value.draft) };
}
