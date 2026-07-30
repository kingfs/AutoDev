import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunState } from "./model.js";

export interface RunStateStore {
  load(runId: string): Promise<RunState | null>;
  save(state: RunState): Promise<void>;
  findByIdempotencyKey(key: string): Promise<RunState | null>;
  claim(key: string, runId: string): Promise<{ claimed: boolean; runId: string }>;
}

function safeRunId(runId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(`unsafe run id ${JSON.stringify(runId)}`);
  }
  return runId;
}

export class FileRunStateStore implements RunStateStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  async load(runId: string): Promise<RunState | null> {
    try {
      return JSON.parse(await readFile(this.#filename(runId), "utf8")) as RunState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(state: RunState): Promise<void> {
    await mkdir(this.#root, { recursive: true });
    const filename = this.#filename(state.runId);
    const temporary = `${filename}.${process.pid}.tmp`;
    state.updatedAt = new Date().toISOString();
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, filename);
  }

  async findByIdempotencyKey(key: string): Promise<RunState | null> {
    const indexName = path.join(this.#root, "idempotency", encodeURIComponent(key));
    try {
      const runId = (await readFile(indexName, "utf8")).trim();
      return this.load(runId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async claim(key: string, runId: string): Promise<{ claimed: boolean; runId: string }> {
    const indexRoot = path.join(this.#root, "idempotency");
    await mkdir(indexRoot, { recursive: true });
    const filename = path.join(indexRoot, encodeURIComponent(key));
    try {
      await writeFile(filename, `${runId}\n`, { flag: "wx", mode: 0o600 });
      return { claimed: true, runId };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return { claimed: false, runId: (await readFile(filename, "utf8")).trim() };
    }
  }

  #filename(runId: string): string {
    return path.join(this.#root, `${safeRunId(runId)}.json`);
  }
}
