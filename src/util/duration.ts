const UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

export function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value.trim());
  if (!match) {
    throw new Error(`invalid duration ${JSON.stringify(value)}`);
  }
  const amount = Number(match[1]);
  const multiplier = UNITS[match[2] ?? ""];
  if (!Number.isSafeInteger(amount) || multiplier === undefined) {
    throw new Error(`invalid duration ${JSON.stringify(value)}`);
  }
  return amount * multiplier;
}
