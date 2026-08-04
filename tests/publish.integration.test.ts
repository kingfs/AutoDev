import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PlanResult, WorkItem } from "../src/domain.js";
import { runChecked } from "../src/git/command.js";
import type { SCMClient } from "../src/scm/scm.js";
import { commitAndPublish } from "../src/stages/publish.js";

describe("trusted publication", () => {
  it("commits, pushes, and creates one change request", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-publish-"));
    const bare = path.join(root, "origin.git");
    const workspace = path.join(root, "workspace");
    await runChecked("git", ["init", "--bare", "-b", "main", bare], { cwd: root });
    await runChecked("git", ["clone", bare, workspace], { cwd: root });
    await runChecked("git", ["config", "user.name", "AutoDev Test"], { cwd: workspace });
    await runChecked("git", ["config", "user.email", "autodev@example.test"], { cwd: workspace });
    await runChecked("bash", ["-lc", "echo base > README.md"], { cwd: workspace });
    await runChecked("git", ["add", "."], { cwd: workspace });
    await runChecked("git", ["commit", "-m", "base"], { cwd: workspace });
    await runChecked("git", ["push", "origin", "main"], { cwd: workspace });
    await runChecked("git", ["checkout", "-b", "ai/issue-1"], { cwd: workspace });
    await runChecked("bash", ["-lc", "echo change > feature.txt"], { cwd: workspace });
    const item = { repository: { id: "1" }, issue: { number: 1, title: "Feature" } } as WorkItem;
    const plan = { changeRequest: { title: "Feature", description: "Description", draft: false } } as PlanResult;
    const created = { id: "1", number: 2, url: "https://git/mr/2", sourceBranch: "ai/issue-1", targetBranch: "main", state: "open", draft: true } as const;
    const scm = {
      findChangeRequest: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created),
      createChangeRequest: vi.fn().mockResolvedValue(created),
      updateChangeRequest: vi.fn().mockResolvedValue(created),
    } as unknown as SCMClient;
    const result = await commitAndPublish({ workspace, item, plan, draft: true, taskBranch: "ai/issue-1", targetBranch: "main", scm });
    expect(result.changeRequest.url).toBe("https://git/mr/2");
    expect((await runChecked("git", ["ls-remote", "--heads", "origin", "ai/issue-1"], { cwd: workspace })).stdout).toContain(result.pushedSha);
    expect(scm.createChangeRequest).toHaveBeenCalledOnce();
    expect(scm.createChangeRequest).toHaveBeenCalledWith(expect.objectContaining({ draft: true }));

    const resumed = await commitAndPublish({ workspace, item, plan, draft: true, taskBranch: "ai/issue-1", targetBranch: "main", scm });
    expect(resumed.pushedSha).toBe(result.pushedSha);
    expect(scm.createChangeRequest).toHaveBeenCalledOnce();
    expect(scm.updateChangeRequest).toHaveBeenCalledOnce();
  });
});
