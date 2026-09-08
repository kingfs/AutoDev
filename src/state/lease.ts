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
    const legacyOrphan = current && Date.parse(current.expiresAt) - Date.parse(current.acquiredAt) > 10 * 60_000 && now.getTime() - Date.parse(current.acquiredAt) > 10 * 60_000;
    if (!current || Date.parse(current.expiresAt) <= now.getTime() || legacyOrphan) {
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

  async renew(lease: Lease, ttlMs: number, now = new Date()): Promise<Lease | null> {
    const current = await this.read(lease.key);
    if (current?.owner !== lease.owner) return null;
    const renewed = { ...current, expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
    await writeFile(this.#filename(lease.key), `${JSON.stringify(renewed)}\n`, { mode: 0o600 });
    return renewed;
  }

  keepAlive(lease: Lease, ttlMs = 120_000, intervalMs = 30_000): () => void {
    const timer = setInterval(() => { void this.renew(lease, ttlMs); }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  async acquireWithRetry(key: string, owner: string, ttlMs: number, options: { waitMs: number; pollMs: number } = { waitMs: 120_000, pollMs: 2_000 }): Promise<Lease> {
    const deadline = Date.now() + options.waitMs;
    let last: Lease | null = null;
    do {
      const lease = await this.acquire(key, owner, ttlMs);
      if (lease) return lease;
      last = await this.read(key);
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(options.pollMs, Math.max(1, deadline - Date.now()))));
    } while (Date.now() < deadline);
    const detail = last ? ` (owner=${last.owner}, acquiredAt=${last.acquiredAt}, expiresAt=${last.expiresAt})` : "";
    throw new Error(`repository lease is busy after ${options.waitMs}ms${detail}`);
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
