import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { autoDevConfigSchema, type AutoDevConfig } from "./schema.js";

const ENV_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export async function loadConfig(filename: string, env: NodeJS.ProcessEnv = process.env): Promise<AutoDevConfig> {
  const absolute = path.resolve(filename);
  const source = await readFile(absolute, "utf8");
  const expanded = source.replace(ENV_PATTERN, (_, name: string) => {
    const value = env[name];
    if (value === undefined) {
      throw new Error(`missing environment variable ${name} required by ${absolute}`);
    }
    return value;
  });
  return autoDevConfigSchema.parse(YAML.parse(expanded));
}
