import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileLeaseManager } from "../src/state/lease.js";

describe("repository lease", () => {
  it("allows one owner and supports owner-safe release", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-lease-"));
    const manager = new FileLeaseManager(root);
    const first = await manager.acquire("gitlab:1", "run-1", 60_000, new Date(0));
    expect(first).not.toBeNull();
    expect(await manager.acquire("gitlab:1", "run-2", 60_000, new Date(1))).toBeNull();
    await manager.release({ ...first!, owner: "wrong" });
    expect(await manager.read("gitlab:1")).not.toBeNull();
    await manager.release(first!);
    expect(await manager.read("gitlab:1")).toBeNull();
  });

  it("takes over an expired lease", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "autodev-lease-"));
    const manager = new FileLeaseManager(root);
    await manager.acquire("repo", "old", 10, new Date(0));
    expect((await manager.acquire("repo", "new", 10, new Date(20)))?.owner).toBe("new");
  });
});
