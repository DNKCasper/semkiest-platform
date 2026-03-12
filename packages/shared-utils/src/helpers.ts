/**
 * Format a Date to an ISO 8601 string (UTC).
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Format a Date to a human-readable locale string.
 * @param date - The date to format
 * @param locale - BCP 47 locale tag (default: 'en-US')
 * @param options - Intl.DateTimeFormatOptions
 */
export function formatDateLocale(
  date: Date,
  locale: string = 'en-US',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Convert a string to a URL-safe slug.
 * Lowercases, trims, replaces non-alphanumeric characters with hyphens,
 * and collapses consecutive hyphens.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pause execution for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split an array into chunks of the given size.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new RangeError('chunk size must be greater than 0');
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merge source objects into a target object (deep merge).
 * Arrays are replaced, not concatenated.
 * Returns a new object; does not mutate inputs.
 */
export function deepMerge<T extends PlainObject>(target: T, ...sources: PlainObject[]): T {
  if (sources.length === 0) return target;

  const result = { ...target } as PlainObject;

  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const key of Object.keys(source)) {
      const srcVal = source[key as keyof typeof source];
      const tgtVal = result[key];
      if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
        result[key] = deepMerge(tgtVal, srcVal as PlainObject);
      } else if (srcVal !== undefined) {
        result[key] = srcVal;
      }
    }
  }

  return result as T;
}

/** HTML entities to escape */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escape HTML special characters to prevent XSS.
 * Replaces &, <, >, ", ', / with their HTML entity equivalents.
 */
export function sanitizeHtml(html: string): string {
  return html.replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}
