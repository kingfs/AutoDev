import type { ChangeRequest, JobFailure, Pipeline, WorkItem } from "../domain.js";
import type { PublishChangeRequestInput, SCMClient } from "./scm.js";
import { requestJson } from "./scm.js";

interface GitLabMR { id: number; iid: number; web_url: string; source_branch: string; target_branch: string; state: string; draft?: boolean; work_in_progress?: boolean }
interface GitLabPipeline { id: number; sha: string; status: string; web_url: string }
export interface GitLabTargetSnapshot {
  kind: "issue" | "merge_request";
  iid: number;
  title: string;
  description: string;
  state: string;
  webUrl: string;
  labels: string[];
  updatedAt?: string;
  author?: string;
  sourceBranch?: string;
  targetBranch?: string;
  headSha?: string;
  baseSha?: string;
  startSha?: string;
  diff?: string;
  commits?: Array<{ id: string; title: string; author: string }>;
  discussions?: Array<{ id: string; notes: Array<{ author: string; body: string; resolved?: boolean }> }>;
}

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
    const root = `/projects/${encodeURIComponent(item.repository.id)}/issues/${item.issue.number}/notes`;
    const marker = markerFrom(body);
    if (marker) {
      const notes = await this.#paginate<{ id: number; body: string }>(root, "&sort=desc");
      const existing = notes.find((note) => note.body.includes(marker));
      if (existing) {
        await this.#request(`${root}/${existing.id}`, { method: "PUT", body: JSON.stringify({ body }) }, [200]);
        return;
      }
    }
    await this.#request(root, { method: "POST", body: JSON.stringify({ body }) }, [201]);
  }

  async currentUser(): Promise<{ id: number; username: string; bot: boolean }> {
    return this.#request("/user", {}, [200]);
  }

  async project(fullName: string): Promise<{ id: number; path_with_namespace: string }> {
    return this.#request(`/projects/${encodeURIComponent(fullName)}`, {}, [200]);
  }

  async memberAccess(projectId: string, userId: number): Promise<number> {
    const member = await this.#request<{ access_level: number }>(`/projects/${encodeURIComponent(projectId)}/members/all/${userId}`, {}, [200]);
    return member.access_level;
  }

  async target(projectId: string, kind: "issue" | "merge_request", iid: number): Promise<GitLabTargetSnapshot> {
    if (kind === "issue") {
      const value = await this.#request<{ iid: number; title: string; description?: string; state: string; web_url: string; labels?: string[]; updated_at?: string; author?: { username?: string } }>(`/projects/${encodeURIComponent(projectId)}/issues/${iid}`, {}, [200]);
      return { kind, iid: value.iid, title: value.title, description: value.description ?? "", state: value.state, webUrl: value.web_url, labels: value.labels ?? [], ...(value.updated_at ? { updatedAt: value.updated_at } : {}), ...(value.author?.username ? { author: value.author.username } : {}) };
    }
    const value = await this.#request<{ iid: number; title: string; description?: string; state: string; web_url: string; labels?: string[]; source_branch: string; target_branch: string; sha?: string; diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string } }>(`/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}`, {}, [200]);
    const response = await this.#fetch(`${this.#baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}/raw_diffs`, { headers: this.#headers() });
    if (!response.ok) throw new Error(`GET GitLab MR raw diff failed: HTTP ${response.status}`);
    const commits = await this.#paginate<{ id: string; title: string; author_name: string }>(`/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}/commits`);
    const discussions = await this.#paginate<{ id: string; notes: Array<{ author?: { username?: string }; body: string; resolved?: boolean }> }>(`/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}/discussions`);
    const headSha = value.diff_refs?.head_sha ?? value.sha;
    return { kind, iid: value.iid, title: value.title, description: value.description ?? "", state: value.state, webUrl: value.web_url, labels: value.labels ?? [], sourceBranch: value.source_branch, targetBranch: value.target_branch, ...(headSha ? { headSha } : {}), ...(value.diff_refs?.base_sha ? { baseSha: value.diff_refs.base_sha } : {}), ...(value.diff_refs?.start_sha ? { startSha: value.diff_refs.start_sha } : {}), diff: (await response.text()).slice(0, 250_000), commits: commits.map((commit) => ({ id: commit.id, title: commit.title, author: commit.author_name })), discussions: discussions.map((discussion) => ({ id: discussion.id, notes: discussion.notes.map((note) => ({ author: note.author?.username ?? "unknown", body: note.body, ...(note.resolved === undefined ? {} : { resolved: note.resolved }) })) })) };
  }

  async upsertMergeRequestDiscussion(projectId: string, iid: number, body: string, position?: { baseSha: string; startSha: string; headSha: string; path: string; line: number }, createIfMissing = true): Promise<void> {
    const root = `/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}/discussions`;
    const marker = markerFrom(body);
    if (!marker) throw new Error("AutoDev discussion requires an idempotency marker");
    const discussions = await this.#paginate<{ id: string; notes: Array<{ id: number; body: string }> }>(root);
    for (const discussion of discussions) {
      const note = discussion.notes.find((entry) => entry.body.includes(marker));
      if (note) { await this.#request(`${root}/${encodeURIComponent(discussion.id)}/notes/${note.id}`, { method: "PUT", body: JSON.stringify({ body }) }, [200]); return; }
    }
    if (!createIfMissing) return;
    const payload = position ? { body, position: { position_type: "text", base_sha: position.baseSha, start_sha: position.startSha, head_sha: position.headSha, new_path: position.path, new_line: position.line } } : { body };
    await this.#request(root, { method: "POST", body: JSON.stringify(payload) }, [201]);
  }

  async commentTarget(projectId: string, kind: "issue" | "merge_request", iid: number, body: string): Promise<void> {
    const collection = kind === "issue" ? "issues" : "merge_requests";
    const root = `/projects/${encodeURIComponent(projectId)}/${collection}/${iid}/notes`;
    const marker = markerFrom(body);
    if (marker) {
      const notes = await this.#paginate<{ id: number; body: string }>(root, "&sort=desc");
      const existing = notes.find((note) => note.body.includes(marker));
      if (existing) { await this.#request(`${root}/${existing.id}`, { method: "PUT", body: JSON.stringify({ body }) }, [200]); return; }
    }
    await this.#request(root, { method: "POST", body: JSON.stringify({ body }) }, [201]);
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
    const jobs = await this.#paginate<{ id: number; name: string; web_url: string; status: string }>(`/projects/${encodeURIComponent(repositoryId)}/pipelines/${pipeline.id}/jobs`, "&scope[]=failed");
    return Promise.all(jobs.filter((job) => job.status === "failed").map(async (job) => {
      const response = await this.#fetch(`${this.#baseUrl}/api/v4/projects/${encodeURIComponent(repositoryId)}/jobs/${job.id}/trace`, { headers: this.#headers() });
      return { id: String(job.id), name: job.name, url: job.web_url, log: (await response.text()).slice(-200_000) };
    }));
  }

  async #paginate<T>(root: string, suffix = ""): Promise<T[]> {
    const values: T[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const separator = root.includes("?") ? "&" : "?";
      const entries = await this.#request<T[]>(`${root}${separator}per_page=100&page=${page}${suffix}`, {}, [200]);
      values.push(...entries);
      if (entries.length < 100) return values;
    }
    throw new Error(`GitLab pagination exceeded 100 pages for ${root}`);
  }

  #request<T>(path: string, init: RequestInit, expected: number[]): Promise<T> {
    return requestJson<T>(this.#fetch, `${this.#baseUrl}/api/v4${path}`, { ...init, headers: this.#headers(init.headers) }, expected);
  }

  #headers(existing?: HeadersInit): HeadersInit {
    return { "Content-Type": "application/json", "PRIVATE-TOKEN": this.#token, ...(existing as Record<string, string> | undefined) };
  }
}

function markerFrom(body: string): string | null { return body.match(/<!-- autodev[^:>]*:[^>]+ -->/)?.[0] ?? null; }

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
