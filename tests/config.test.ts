import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/load.js";
import { parseDuration } from "../src/util/duration.js";

describe("configuration", () => {
  it("loads defaults and expands environment variables", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "autodev-config-"));
    const filename = path.join(dir, "config.yml");
    await writeFile(filename, [
      "repository:",
      "  provider: gitlab",
      "  url: ${REPOSITORY_URL}",
      "automation: {}",
      "verification: {}",
      "security: {}",
    ].join("\n"));

    const config = await loadConfig(filename, { REPOSITORY_URL: "https://gitlab.example.com/group/project.git" });
    expect(config.repository.default_branch).toBe("main");
    expect(config.repository.required_label).toBe("ai-ready");
    expect(config.automation.local_repair_limit).toBe(2);
  });

  it("rejects missing environment variables", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "autodev-config-"));
    const filename = path.join(dir, "config.yml");
    await writeFile(filename, "repository:\n  provider: gitlab\n  url: ${MISSING}\n");
    await expect(loadConfig(filename, {})).rejects.toThrow("missing environment variable MISSING");
  });
});

describe("parseDuration", () => {
  it.each([["250ms", 250], ["30s", 30_000], ["5m", 300_000], ["3h", 10_800_000]])(
    "parses %s",
    (input, expected) => expect(parseDuration(input)).toBe(expected),
  );

  it("rejects an ambiguous duration", () => {
    expect(() => parseDuration("3 hours")).toThrow("invalid duration");
  });
});
