import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { autoDevConfigSchema } from "../src/config/schema.js";
import { runChecked } from "../src/git/command.js";
import { GitWorkspace } from "../src/git/workspace.js";

describe("workspace recovery", () => {
  it("restores a published task branch in a fresh workspace", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-restore-"));
    const bare = path.join(root, "origin.git");
    const first = path.join(root, "first");
    const fresh = path.join(root, "fresh");
    await runChecked("git", ["init", "--bare", "-b", "main", bare], { cwd: root });
    await runChecked("git", ["clone", bare, first], { cwd: root });
    await runChecked("git", ["config", "user.name", "AutoDev Test"], { cwd: first });
    await runChecked("git", ["config", "user.email", "autodev@example.test"], { cwd: first });
    await runChecked("bash", ["-lc", "echo base > README.md"], { cwd: first });
    await runChecked("git", ["add", "."], { cwd: first });
    await runChecked("git", ["commit", "-m", "base"], { cwd: first });
    await runChecked("git", ["push", "origin", "main"], { cwd: first });
    const baseSha = (await runChecked("git", ["rev-parse", "HEAD"], { cwd: first })).stdout.trim();
    await runChecked("git", ["checkout", "-b", "ai/issue-1"], { cwd: first });
    await runChecked("bash", ["-lc", "echo feature > feature.txt"], { cwd: first });
    await runChecked("git", ["add", "."], { cwd: first });
    await runChecked("git", ["commit", "-m", "feature"], { cwd: first });
    await runChecked("git", ["push", "origin", "ai/issue-1"], { cwd: first });
    await runChecked("git", ["clone", bare, fresh], { cwd: root });

    const config = autoDevConfigSchema.parse({ repository: { provider: "gitlab", url: `file://${bare}` }, automation: {}, verification: {}, security: {} });
    const restored = await new GitWorkspace(fresh).restore({ baseBranch: "main", baseSha, taskBranch: "ai/issue-1", headSha: baseSha, changedFiles: [], clean: true }, config);
    expect(restored.implementationLost).toBe(false);
    expect(restored.checkpoint.changedFiles).toContain("feature.txt");
  });
});
