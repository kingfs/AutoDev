import path from "node:path";
import type { AutoDevConfig } from "../config/schema.js";
import type { GitCheckpoint, WorkItem } from "../domain.js";
import { runChecked } from "./command.js";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "task";
}

export function taskBranch(item: WorkItem, config: AutoDevConfig): string {
  return `${config.repository.branch_prefix}${item.issue.number}-${slug(item.issue.title)}`;
}

export class GitWorkspace {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async prepare(item: WorkItem, config: AutoDevConfig): Promise<GitCheckpoint> {
    const status = await runChecked("git", ["status", "--porcelain"], { cwd: this.root });
    if (status.stdout.trim()) throw new Error("workspace must be clean before preparing a run");
    const remote = await runChecked("git", ["remote", "get-url", "origin"], { cwd: this.root });
    if (!sameRepository(remote.stdout.trim(), config.repository.url)) {
      throw new Error(`workspace origin ${remote.stdout.trim()} does not match configured repository`);
    }
    await runChecked("git", ["fetch", "--prune", "origin", config.repository.default_branch], { cwd: this.root, timeoutMs: 120_000 });
    await runChecked("git", ["checkout", "-B", config.repository.default_branch, `origin/${config.repository.default_branch}`], { cwd: this.root });
    const baseSha = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: this.root })).stdout.trim();
    const branch = taskBranch(item, config);
    await runChecked("git", ["checkout", "-B", branch, baseSha], { cwd: this.root });
    return { baseBranch: config.repository.default_branch, baseSha, taskBranch: branch, headSha: baseSha, changedFiles: [], clean: true };
  }

  async checkpoint(base: Pick<GitCheckpoint, "baseBranch" | "baseSha" | "taskBranch">): Promise<GitCheckpoint> {
    const branch = (await runChecked("git", ["branch", "--show-current"], { cwd: this.root })).stdout.trim();
    if (branch !== base.taskBranch) throw new Error(`workspace is on ${branch}, expected ${base.taskBranch}`);
    const headSha = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: this.root })).stdout.trim();
    const changed = await runChecked("git", ["diff", "--name-only", base.baseSha], { cwd: this.root });
    const status = await runChecked("git", ["status", "--porcelain"], { cwd: this.root });
    const tracked = changed.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const statusPaths = status.stdout.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean);
    return {
      ...base,
      headSha,
      changedFiles: [...new Set([...tracked, ...statusPaths])].sort(),
      clean: status.stdout.trim().length === 0,
    };
  }
}

function sameRepository(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replace(/^file:\/\//, "").replace(/\.git$/, "").replace(/^git@([^:]+):/, "https://$1/").replace(/\/$/, "");
  return normalize(left) === normalize(right);
}
