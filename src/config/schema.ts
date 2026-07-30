import { z } from "zod";

const commandSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.string().optional(),
});

export const autoDevConfigSchema = z.object({
  repository: z.object({
    provider: z.enum(["gitlab", "github"]),
    url: z.string().url(),
    default_branch: z.string().min(1).default("main"),
    required_label: z.string().min(1).default("ai-ready"),
    branch_prefix: z.string().min(1).default("ai/issue-"),
    allowlist: z.array(z.string().min(1)).default([]),
  }),
  automation: z.object({
    mode: z.enum(["plan-only", "draft", "no-push"]).default("draft"),
    repository_concurrency: z.number().int().positive().default(1),
    local_repair_limit: z.number().int().nonnegative().default(2),
    ci_repair_limit: z.number().int().nonnegative().default(2),
    run_timeout: z.string().default("3h"),
    agent_provider: z.string().default("codex"),
    ci_watch: z.boolean().default(true),
    ci_timeout: z.string().default("1h"),
  }),
  verification: z.object({
    commands: z.array(commandSchema).default([]),
    path_rules: z.array(z.object({
      pattern: z.string().min(1),
      commands: z.array(commandSchema),
    })).default([]),
  }),
  security: z.object({
    denied_paths: z.array(z.string()).default([]),
    require_human_review: z.array(z.string()).default([]),
    allowed_authors: z.array(z.string()).default([]),
    agent_redacted_env: z.array(z.string()).default(["SCM_API_TOKEN", "GITLAB_TOKEN", "GITHUB_TOKEN"]),
  }),
});

export type AutoDevConfig = z.infer<typeof autoDevConfigSchema>;
