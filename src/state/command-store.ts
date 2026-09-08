import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CommandTargetState {
  targetKey: string;
  updatedAt: string;
  invocations: CommandInvocation[];
}

export interface CommandInvocation { id: string; command: string; actor: string; createdAt: string; revision?: string; attempts: CommandAttempt[] }
export interface CommandAttempt { number: number; status: "running" | "completed" | "failed"; startedAt: string; finishedAt?: string; summary?: string }

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

  async startInvocation(targetKey: string, invocationId: string, command: string, actor: string, revision?: string): Promise<CommandTargetState> {
    const now = new Date().toISOString();
    const state = await this.loadTarget(targetKey) ?? { targetKey, updatedAt: now, invocations: [] };
    state.invocations.push({ id: invocationId, command, actor, createdAt: now, ...(revision ? { revision } : {}), attempts: [{ number: 1, status: "running", startedAt: now }] });
    state.updatedAt = now;
    await this.saveTarget(state);
    return state;
  }

  async finishInvocation(targetKey: string, invocationId: string, status: "completed" | "failed", summary: string): Promise<void> {
    const state = await this.loadTarget(targetKey);
    const invocation = state?.invocations.find((entry) => entry.id === invocationId);
    const attempt = invocation?.attempts.at(-1);
    if (!state || !attempt) throw new Error(`command invocation ${invocationId} is unavailable`);
    attempt.status = status;
    attempt.summary = summary;
    attempt.finishedAt = new Date().toISOString();
    state.updatedAt = attempt.finishedAt;
    await this.saveTarget(state);
  }

  #targetFile(targetKey: string): string { return path.join(this.#root, "targets", `${hash(targetKey)}.json`); }
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
