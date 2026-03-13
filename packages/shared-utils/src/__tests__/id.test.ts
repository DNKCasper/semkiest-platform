import { describe, it, expect } from 'vitest';
import { generateId, generateShortId } from '../id.js';

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns a 21-character ID by default', () => {
    expect(generateId()).toHaveLength(21);
  });

  it('returns an ID of the specified size', () => {
    expect(generateId(10)).toHaveLength(10);
    expect(generateId(32)).toHaveLength(32);
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('uses URL-safe characters only', () => {
    const id = generateId(100);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('generateShortId', () => {
  it('returns a 10-character string', () => {
    expect(generateShortId()).toHaveLength(10);
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateShortId()));
    expect(ids.size).toBe(100);
  });

  it('uses URL-safe characters only', () => {
    expect(generateShortId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
