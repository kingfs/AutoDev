import runtime from "@chaitin-ai/agent-compose-runtime-sdk";
import { rm } from "node:fs/promises";
import path from "node:path";
import { toJSONSchema, type ZodType } from "zod";
import type { ImplementationResult, PlanResult, ReviewResult } from "../domain.js";
import { implementationSchema, planSchema, reviewSchema } from "./schemas.js";

export interface AgentCall<T> {
  value: T;
  threadId: string;
  transcript: string;
}

export interface DevelopmentRuntime {
  plan(prompt: string): Promise<AgentCall<PlanResult>>;
  implement(prompt: string): Promise<AgentCall<ImplementationResult>>;
  review(prompt: string): Promise<AgentCall<ReviewResult>>;
  repair(prompt: string): Promise<AgentCall<ImplementationResult>>;
}

type AgentProvider = "codex" | "claude" | "gemini" | "opencode";

const INVALID_STRUCTURED_OUTPUT = "agent finalText is not valid JSON for outputSchema";

function isInvalidStructuredOutput(error: unknown): boolean {
  return error instanceof Error && error.message === INVALID_STRUCTURED_OUTPUT;
}

function parseExplicitJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

function structuredPrompt(prompt: string, schema: ZodType, retry: boolean, workspaceTools: boolean): string {
  const lines = [
    prompt,
    "",
    retry ? "Your previous response was not valid structured output." : "Return a structured result.",
    "Return exactly one JSON value matching this JSON Schema.",
    "Do not include analysis, commentary, or any text outside the JSON value. A single ```json fenced block is also accepted.",
    JSON.stringify(toJSONSchema(schema)),
  ];
  if (workspaceTools) {
    lines.push(
      "Your first action MUST be an actual call to the bash tool. Inspect and modify the workspace with bash before returning the final JSON.",
      "Do not print a proposed tool call or claim the tool is unavailable without first making the real bash tool call.",
    );
  }
  return lines.join("\n");
}

export class AgentComposeRuntime implements DevelopmentRuntime {
  readonly #provider: AgentProvider;
  readonly #workspace: string;
  readonly #stateRoot: string;
  readonly #timeoutMs: number;
  readonly #redactedEnv: string[];

  constructor(options: { provider: string; workspace: string; stateRoot: string; timeoutMs: number; redactedEnv?: string[] }) {
    if (!["codex", "claude", "gemini", "opencode"].includes(options.provider)) {
      throw new Error(`unsupported agent provider ${options.provider}`);
    }
    this.#provider = options.provider as AgentProvider;
    this.#workspace = options.workspace;
    this.#stateRoot = options.stateRoot;
    this.#timeoutMs = options.timeoutMs;
    this.#redactedEnv = options.redactedEnv ?? [];
  }

  plan(prompt: string): Promise<AgentCall<PlanResult>> {
    return this.#call(prompt, planSchema, false);
  }

  implement(prompt: string): Promise<AgentCall<ImplementationResult>> {
    return this.#call(prompt, implementationSchema, true);
  }

  review(prompt: string): Promise<AgentCall<ReviewResult>> {
    return this.#call(prompt, reviewSchema, false);
  }

  repair(prompt: string): Promise<AgentCall<ImplementationResult>> {
    return this.#call(prompt, implementationSchema, true);
  }

  async #call<T>(prompt: string, schema: ZodType<T>, workspaceTools: boolean): Promise<AgentCall<T>> {
    const saved = new Map<string, string>();
    for (const name of this.#redactedEnv) {
      const value = process.env[name];
      if (value !== undefined) saved.set(name, value);
      delete process.env[name];
    }
    let result;
    try {
      // Sandboxes do not persist the provider's local rollout store. A persisted
      // runtime thread pointer therefore cannot safely be resumed after replay.
      // Each workflow stage is self-contained, so start it with a fresh thread;
      // an in-stage structured-output retry may still resume the newly created one.
      await rm(path.join(this.#stateRoot, "agents", "providers", `${this.#provider}.json`), { force: true });
      const options = {
        provider: this.#provider,
        workspace: this.#workspace,
        stateRoot: this.#stateRoot,
        timeoutMs: this.#timeoutMs,
      } as const;
      if (this.#provider === "opencode") {
        if (workspaceTools) {
          let toolReady = false;
          for (let attempt = 0; attempt < 3 && !toolReady; attempt += 1) {
            const probe = await runtime.agent(
              "Call the bash tool now to run pwd and git status --short in the workspace. Do not answer without the actual bash tool call.",
              options,
            );
            toolReady = probe.transcript.includes("[tool:");
          }
          if (!toolReady) {
            throw new Error("opencode did not execute the required bash tool bootstrap");
          }
          const execution = await runtime.agent([
            prompt,
            "",
            "Your first action MUST be an actual call to the bash tool.",
            "Use bash to inspect and modify the workspace now. Do not simulate tool calls or return structured JSON yet.",
          ].join("\n"), options);
          if (!execution.transcript.includes("[tool:")) {
            throw new Error("opencode did not execute bash during workspace implementation");
          }
          result = await runtime.agent(structuredPrompt(
            "Report the implementation work you just completed in the workspace.",
            schema,
            false,
            false,
          ), options);
        } else {
          result = await runtime.agent(structuredPrompt(prompt, schema, false, false), options);
        }
      } else try {
        result = await runtime.agent(prompt, { ...options, outputSchema: schema });
      } catch (error) {
        if (!isInvalidStructuredOutput(error)) throw error;
        result = await runtime.agent(structuredPrompt(prompt, schema, true, workspaceTools), options);
      }
    } finally {
      for (const [name, value] of saved) process.env[name] = value;
    }
    const value = result.json === null ? parseExplicitJson(result.finalText) : result.json;
    return { value: schema.parse(value), threadId: result.threadId, transcript: result.transcript };
  }
}
