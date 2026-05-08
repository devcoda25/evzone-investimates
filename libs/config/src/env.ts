export function optionalString(
  value: string | undefined,
  fallback: string,
): string {
  return value && value.trim().length > 0 ? value : fallback;
}

export function optionalNumber(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function optionalBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value === "") return fallback;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}
