/**
 * Null-safe JSON.parse helper.
 * Returns null for null/undefined input; returns the raw value if parsing fails.
 */
export function tryJsonParse(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
