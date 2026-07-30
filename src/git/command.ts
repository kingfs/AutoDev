import { spawn } from "node:child_process";

export interface CommandResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxOutputBytes?: number },
): Promise<CommandResult> {
  const started = Date.now();
  const maxOutputBytes = options.maxOutputBytes ?? 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      return Buffer.byteLength(next) <= maxOutputBytes ? next : next.slice(-maxOutputBytes);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", reject);
    const timeout = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs) : undefined;
    child.once("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      if (timedOut) stderr += `\ncommand timed out after ${options.timeoutMs}ms`;
      if (signal && !timedOut) stderr += `\ncommand terminated by ${signal}`;
      resolve({ command, args, cwd: options.cwd, exitCode: code ?? (timedOut ? 124 : 1), stdout, stderr, durationMs: Date.now() - started });
    });
  });
}

export async function runChecked(command: string, args: string[], options: Parameters<typeof runCommand>[2]): Promise<CommandResult> {
  const result = await runCommand(command, args, options);
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.exitCode}): ${result.stderr || result.stdout}`);
  }
  return result;
}
