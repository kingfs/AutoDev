import type { AutoDevConfig } from "../config/schema.js";
import { GitHubClient } from "./github.js";
import { GitLabClient } from "./gitlab.js";
import type { SCMClient } from "./scm.js";

export function createSCMClient(config: AutoDevConfig, env: NodeJS.ProcessEnv = process.env): SCMClient {
  const token = env.SCM_API_TOKEN;
  if (!token) throw new Error("SCM_API_TOKEN is required");
  if (config.repository.provider === "gitlab") {
    return new GitLabClient({ baseUrl: env.SCM_API_BASE_URL ?? "https://gitlab.com", token });
  }
  const repository = config.repository.allowlist[0];
  if (!repository) throw new Error("GitHub requires repository.allowlist with the owner/name repository");
  return new GitHubClient({ ...(env.SCM_API_BASE_URL ? { baseUrl: env.SCM_API_BASE_URL } : {}), token, repository });
}
