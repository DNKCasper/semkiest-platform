/**
 * @semkiest/shared-utils
 *
 * Shared utility functions used across the SemkiEst platform.
 */

/** Returns true if the value is not null or undefined. */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** Sleeps for the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calculates exponential backoff delay in milliseconds. */
export function exponentialBackoff(attempt: number, baseDelayMs: number): number {
  return Math.min(baseDelayMs * Math.pow(2, attempt - 1), 30_000);
}

/** Formats a date as an ISO-8601 string (UTC). */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/** Parses an ISO-8601 string or Date into a Date object. */
export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Clamps a number between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Chunks an array into sub-arrays of the specified size. */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
