import type { GitCheckpoint } from "../domain.js";
import type { GitLabTargetSnapshot } from "../scm/gitlab.js";
import { runChecked } from "./command.js";

export async function prepareMergeRequestWorkspace(workspace: string, mr: GitLabTargetSnapshot): Promise<GitCheckpoint> {
  if (mr.kind !== "merge_request" || !mr.headSha || !mr.targetBranch) throw new Error("merge request is missing exact head SHA or target branch");
  const status = await runChecked("git", ["status", "--porcelain"], { cwd: workspace });
  if (status.stdout.trim()) throw new Error("workspace must be clean before merge request review");
  const reviewRef = `refs/autodev/merge-requests/${mr.iid}/head`;
  await runChecked("git", ["fetch", "--prune", "origin", `refs/heads/${mr.targetBranch}:refs/remotes/origin/${mr.targetBranch}`, `refs/merge-requests/${mr.iid}/head:${reviewRef}`], { cwd: workspace, timeoutMs: 120_000 });
  const fetchedHead = (await runChecked("git", ["rev-parse", reviewRef], { cwd: workspace })).stdout.trim();
  if (fetchedHead !== mr.headSha) throw new Error(`merge request head moved from ${mr.headSha} to ${fetchedHead}`);
  const baseSha = (await runChecked("git", ["rev-parse", `origin/${mr.targetBranch}`], { cwd: workspace })).stdout.trim();
  await runChecked("git", ["checkout", "--detach", mr.headSha], { cwd: workspace });
  const changed = (await runChecked("git", ["diff", "--name-only", `${baseSha}...${mr.headSha}`], { cwd: workspace })).stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { baseBranch: mr.targetBranch, baseSha, taskBranch: `mr-${mr.iid}`, headSha: mr.headSha, changedFiles: [...new Set(changed)].sort(), clean: true };
}
