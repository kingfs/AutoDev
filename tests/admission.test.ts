import { describe, expect, it } from "vitest";
import { autoDevConfigSchema } from "../src/config/schema.js";
import type { WorkItem } from "../src/domain.js";
import { decideAdmission, idempotencyKey } from "../src/policies/admission.js";

const config = autoDevConfigSchema.parse({
  repository: { provider: "gitlab", url: "https://git.example/group/repo.git", allowlist: ["group/repo"] },
  automation: {}, verification: {}, security: {},
});
const item: WorkItem = {
  provider: "gitlab", deliveryId: "d", actor: "maintainer", action: "open", revision: "r",
  repository: { provider: "gitlab", id: "1", fullName: "group/repo", cloneUrl: "https://git.example/group/repo.git", webUrl: "https://git.example/group/repo", defaultBranch: "main" },
  issue: { id: "2", number: 1, title: "Task", body: "Body", labels: ["ai-ready"], author: "alice", url: "https://git.example/issues/1", updatedAt: "r" },
};

describe("admission", () => {
  it("accepts an allowlisted labeled issue", () => expect(decideAdmission(item, config).accepted).toBe(true));
  it("rejects a missing label", () => expect(decideAdmission({ ...item, issue: { ...item.issue, labels: [] } }, config).reason).toContain("missing required label"));
  it("builds a stable idempotency key", () => expect(idempotencyKey(item)).toBe("gitlab:1:2:open:r"));
  it("rejects an untrusted event actor", () => {
    const restricted = autoDevConfigSchema.parse({ ...config, security: { allowed_actors: ["maintainer"] } });
    expect(decideAdmission({ ...item, actor: "outsider" }, restricted).reason).toContain("event actor outsider");
  });
});
