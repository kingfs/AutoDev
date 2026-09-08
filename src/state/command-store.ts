import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CommandTargetState {
  targetKey: string;
  command: string;
  status: "running" | "completed" | "failed";
  actor: string;
  updatedAt: string;
  summary?: string;
}

export class CommandStateStore {
  readonly #root: string;
  constructor(root: string) { this.#root = path.resolve(root); }

  async claim(key: string): Promise<boolean> {
    const root = path.join(this.#root, "claims");
    await mkdir(root, { recursive: true });
    try {
      await writeFile(path.join(root, hash(key)), `${key}\n`, { flag: "wx", mode: 0o600 });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  }

  async loadTarget(targetKey: string): Promise<CommandTargetState | null> {
    try { return JSON.parse(await readFile(this.#targetFile(targetKey), "utf8")) as CommandTargetState; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  async saveTarget(state: CommandTargetState): Promise<void> {
    const root = path.join(this.#root, "targets");
    await mkdir(root, { recursive: true });
    const filename = this.#targetFile(state.targetKey);
    const temporary = `${filename}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, filename);
  }

  #targetFile(targetKey: string): string { return path.join(this.#root, "targets", `${hash(targetKey)}.json`); }
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
