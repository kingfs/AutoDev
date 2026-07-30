import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Lease {
  key: string;
  owner: string;
  acquiredAt: string;
  expiresAt: string;
}

export class FileLeaseManager {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  async acquire(key: string, owner: string, ttlMs: number, now = new Date()): Promise<Lease | null> {
    await mkdir(this.#root, { recursive: true });
    const filename = this.#filename(key);
    const lease = { key, owner, acquiredAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
    try {
      await writeFile(filename, `${JSON.stringify(lease)}\n`, { flag: "wx", mode: 0o600 });
      return lease;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const current = await this.read(key);
    if (!current || Date.parse(current.expiresAt) <= now.getTime()) {
      await rm(filename, { force: true });
      try {
        await writeFile(filename, `${JSON.stringify(lease)}\n`, { flag: "wx", mode: 0o600 });
        return lease;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
        throw error;
      }
    }
    return null;
  }

  async release(lease: Lease): Promise<void> {
    const current = await this.read(lease.key);
    if (current?.owner === lease.owner) await rm(this.#filename(lease.key), { force: true });
  }

  async read(key: string): Promise<Lease | null> {
    try {
      return JSON.parse(await readFile(this.#filename(key), "utf8")) as Lease;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  #filename(key: string): string {
    const safe = Buffer.from(key).toString("base64url");
    return path.join(this.#root, `${safe}.lease`);
  }
}
