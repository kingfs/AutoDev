import type { PlanResult, WorkItem } from "../domain.js";
import { runChecked, runCommand } from "../git/command.js";
import type { SCMClient } from "../scm/scm.js";

export async function commitAndPublish(options: {
  workspace: string;
  item: WorkItem;
  plan: PlanResult;
  taskBranch: string;
  targetBranch: string;
  scm: SCMClient;
}): Promise<{ pushedSha: string; changeRequest: Awaited<ReturnType<SCMClient["createChangeRequest"]>> }> {
  await runChecked("git", ["add", "--all"], { cwd: options.workspace });
  const staged = await runChecked("git", ["diff", "--cached", "--name-only"], { cwd: options.workspace });
  if (staged.stdout.trim()) {
    await runChecked("git", ["commit", "-m", `feat: ${options.item.issue.title.slice(0, 72)}`], { cwd: options.workspace });
  }
  const pushedSha = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: options.workspace })).stdout.trim();
  const baseSha = (await runChecked("git", ["merge-base", options.targetBranch, pushedSha], { cwd: options.workspace })).stdout.trim();
  if (baseSha === pushedSha) throw new Error("refusing to publish an empty change");
  const remote = await runChecked("git", ["ls-remote", "--heads", "origin", `refs/heads/${options.taskBranch}`], { cwd: options.workspace });
  const remoteSha = remote.stdout.trim().split(/\s+/)[0] ?? "";
  if (remoteSha !== pushedSha) {
    const pushArgs = ["push", "--set-upstream"];
    if (remoteSha) {
      await runChecked("git", ["fetch", "origin", `${options.taskBranch}:refs/remotes/origin/${options.taskBranch}`], { cwd: options.workspace, timeoutMs: 120_000 });
      const ancestor = await runCommand("git", ["merge-base", "--is-ancestor", remoteSha, pushedSha], { cwd: options.workspace });
      if (ancestor.exitCode !== 0) throw new Error(`remote task branch moved unexpectedly to ${remoteSha}; refusing to overwrite it`);
      pushArgs.push(`--force-with-lease=refs/heads/${options.taskBranch}:${remoteSha}`);
    }
    pushArgs.push("origin", `${options.taskBranch}:${options.taskBranch}`);
    await runChecked("git", pushArgs, { cwd: options.workspace, timeoutMs: 180_000 });
  }
  const input = { repositoryId: options.item.repository.id, sourceBranch: options.taskBranch, targetBranch: options.targetBranch, title: options.plan.changeRequest.title, description: `${options.plan.changeRequest.description}\n\nCloses #${options.item.issue.number}`, draft: options.plan.changeRequest.draft, issueNumber: options.item.issue.number };
  const existing = await options.scm.findChangeRequest(input);
  const changeRequest = existing ? await options.scm.updateChangeRequest(existing, input) : await options.scm.createChangeRequest(input);
  return { pushedSha, changeRequest };
}
