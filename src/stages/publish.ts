import type { PlanResult, WorkItem } from "../domain.js";
import { runChecked } from "../git/command.js";
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
  if (!staged.stdout.trim()) throw new Error("refusing to publish an empty change");
  await runChecked("git", ["commit", "-m", `feat: ${options.item.issue.title.slice(0, 72)}`], { cwd: options.workspace });
  const pushedSha = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: options.workspace })).stdout.trim();
  await runChecked("git", ["push", "--set-upstream", "origin", `${options.taskBranch}:${options.taskBranch}`], { cwd: options.workspace, timeoutMs: 180_000 });
  const input = { repositoryId: options.item.repository.id, sourceBranch: options.taskBranch, targetBranch: options.targetBranch, title: options.plan.changeRequest.title, description: `${options.plan.changeRequest.description}\n\nCloses #${options.item.issue.number}`, draft: options.plan.changeRequest.draft, issueNumber: options.item.issue.number };
  const existing = await options.scm.findChangeRequest(input);
  const changeRequest = existing ? await options.scm.updateChangeRequest(existing, input) : await options.scm.createChangeRequest(input);
  return { pushedSha, changeRequest };
}
