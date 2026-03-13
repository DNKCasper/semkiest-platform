import { nanoid as _nanoid } from 'nanoid';

/**
 * Generate a URL-safe unique ID.
 * @param size - Length of the generated ID (default: 21)
 */
export function generateId(size?: number): string {
  return _nanoid(size);
}

/**
 * Generate a short 10-character ID suitable for slugs and display names.
 */
export function generateShortId(): string {
  return _nanoid(10);
}
