const COMMON_SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+\-=]{12,}/gi,
  /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
];

export function configuredSecrets(envNames: readonly string[]): string[] {
  return envNames.map((name) => process.env[name]).filter((value): value is string => Boolean(value && value.length >= 4));
}

export function redactText(value: string, secrets: readonly string[] = []): string {
  let result = value;
  for (const secret of [...secrets].sort((left, right) => right.length - left.length)) {
    result = result.split(secret).join("[REDACTED]");
  }
  for (const pattern of COMMON_SECRET_PATTERNS) result = result.replace(pattern, "[REDACTED]");
  return result;
}

export function containsSecret(value: string, configuredPatterns: readonly string[]): boolean {
  if (COMMON_SECRET_PATTERNS.some((pattern) => { pattern.lastIndex = 0; return pattern.test(value); })) return true;
  return configuredPatterns.some((pattern) => new RegExp(pattern, "i").test(value));
}
