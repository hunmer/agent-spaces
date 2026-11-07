export function assertRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool input must be an object.');
  }
  return input as Record<string, unknown>;
}

export function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
  return value;
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readStringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function normalizeSearchText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}
