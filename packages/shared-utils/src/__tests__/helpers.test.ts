import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatDate,
  formatDateLocale,
  slugify,
  sleep,
  chunkArray,
  deepMerge,
  sanitizeHtml,
} from '../helpers.js';

describe('formatDate', () => {
  it('returns an ISO 8601 string', () => {
    const date = new Date('2024-01-15T12:00:00.000Z');
    expect(formatDate(date)).toBe('2024-01-15T12:00:00.000Z');
  });

  it('includes milliseconds', () => {
    const date = new Date('2024-06-01T00:00:00.500Z');
    expect(formatDate(date)).toMatch(/\.500Z$/);
  });
});

describe('formatDateLocale', () => {
  it('returns a formatted locale string', () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    const result = formatDateLocale(date, 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(result).toContain('2024');
  });

  it('uses en-US and default options when not specified', () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    const result = formatDateLocale(date);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('foo bar baz')).toBe('foo-bar-baz');
  });

  it('collapses multiple spaces/hyphens', () => {
    expect(slugify('foo   bar--baz')).toBe('foo-bar-baz');
  });

  it('removes leading and trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('handles underscores as separators', () => {
    expect(slugify('foo_bar')).toBe('foo-bar');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('handles already-valid slugs', () => {
    expect(slugify('valid-slug-123')).toBe('valid-slug-123');
  });
});

describe('sleep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified delay', async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('does not resolve before the delay', async () => {
    vi.useFakeTimers();
    let resolved = false;
    sleep(500).then(() => { resolved = true; });
    vi.advanceTimersByTime(499);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});

describe('chunkArray', () => {
  it('splits array into equal chunks', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('handles remainder chunk', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single chunk when size >= array length', () => {
    expect(chunkArray([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunkArray([], 3)).toEqual([]);
  });

  it('throws RangeError for size <= 0', () => {
    expect(() => chunkArray([1, 2], 0)).toThrow(RangeError);
    expect(() => chunkArray([1, 2], -1)).toThrow(RangeError);
  });

  it('works with chunk size of 1', () => {
    expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

describe('deepMerge', () => {
  it('merges flat objects', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('recursively merges nested objects', () => {
    const result = deepMerge(
      { a: { x: 1, y: 2 } },
      { a: { y: 99, z: 3 } },
    );
    expect(result).toEqual({ a: { x: 1, y: 99, z: 3 } });
  });

  it('does not mutate the target', () => {
    const target = { a: 1 };
    const result = deepMerge(target, { b: 2 });
    expect(target).toEqual({ a: 1 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('replaces arrays (does not concatenate)', () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [3, 4, 5] });
    expect(result).toEqual({ arr: [3, 4, 5] });
  });

  it('returns target when no sources provided', () => {
    const target = { a: 1 };
    expect(deepMerge(target)).toEqual({ a: 1 });
  });

  it('merges multiple sources left-to-right', () => {
    const result = deepMerge({ a: 1 }, { b: 2 }, { c: 3 });
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('sanitizeHtml', () => {
  it('escapes ampersands', () => {
    expect(sanitizeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than and greater-than', () => {
    expect(sanitizeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(sanitizeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(sanitizeHtml("it's")).toBe("it&#x27;s");
  });

  it('escapes forward slashes', () => {
    expect(sanitizeHtml('</script>')).toBe('&lt;&#x2F;script&gt;');
  });

  it('returns unchanged string when no special chars', () => {
    expect(sanitizeHtml('hello world 123')).toBe('hello world 123');
  });

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('sanitizes a full XSS payload', () => {
    const input = '<img src="x" onerror="alert(\'xss\')">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
  });
});
