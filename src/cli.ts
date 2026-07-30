import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { RunState } from "./state/model.js";

async function main(): Promise<void> {
  const [command = "list", argument] = process.argv.slice(2);
  const root = path.resolve(process.env.AUTODEV_STATE_ROOT ?? "/state", "runs");
  if (command === "list") {
    const files = await readdir(root).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
    const states = await Promise.all(files.filter((name) => name.endsWith(".json")).map((name) => readState(path.join(root, name))));
    const rows = states.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map((state) => ({ runId: state.runId, repository: state.workItem.repository.fullName, issue: state.workItem.issue.number, stage: state.currentStage, status: state.status, updatedAt: state.updatedAt }));
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (command === "show" && argument && /^[A-Za-z0-9._-]+$/.test(argument)) {
    console.log(JSON.stringify(await readState(path.join(root, `${argument}.json`)), null, 2));
    return;
  }
  throw new Error("usage: autodev-runs list | autodev-runs show <run-id>");
}

async function readState(filename: string): Promise<RunState> {
  return JSON.parse(await readFile(filename, "utf8")) as RunState;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
