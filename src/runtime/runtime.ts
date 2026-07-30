import runtime from "@chaitin-ai/agent-compose-runtime-sdk";
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
    return this.#call(prompt, planSchema);
  }

  implement(prompt: string): Promise<AgentCall<ImplementationResult>> {
    return this.#call(prompt, implementationSchema);
  }

  review(prompt: string): Promise<AgentCall<ReviewResult>> {
    return this.#call(prompt, reviewSchema);
  }

  repair(prompt: string): Promise<AgentCall<ImplementationResult>> {
    return this.#call(prompt, implementationSchema);
  }

  async #call<T>(prompt: string, schema: { parse(value: unknown): T }): Promise<AgentCall<T>> {
    const saved = new Map<string, string>();
    for (const name of this.#redactedEnv) {
      const value = process.env[name];
      if (value !== undefined) saved.set(name, value);
      delete process.env[name];
    }
    let result;
    try {
      result = await runtime.agent<unknown>(prompt, {
        provider: this.#provider,
        workspace: this.#workspace,
        stateRoot: this.#stateRoot,
        timeoutMs: this.#timeoutMs,
        outputSchema: schema as never,
      });
    } finally {
      for (const [name, value] of saved) process.env[name] = value;
    }
    return { value: schema.parse(result.json), threadId: result.threadId, transcript: result.transcript };
  }
}
