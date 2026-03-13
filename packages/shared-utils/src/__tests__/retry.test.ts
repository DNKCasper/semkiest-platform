import { describe, it, expect, vi, afterEach } from 'vitest';
import { retry } from '../retry.js';

// Use real timers but spy on sleep to avoid actual delays
vi.mock('../helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers.js')>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('retry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn);
    expect(result).toEqual({ value: 'ok', attempts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retry(fn, { maxAttempts: 3 });
    expect(result).toEqual({ value: 'success', attempts: 3 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all attempts', async () => {
    const error = new Error('always fails');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retry(fn, { maxAttempts: 3 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('aborts immediately when shouldAbort returns true', async () => {
    const fatalError = new Error('fatal');
    const fn = vi.fn().mockRejectedValue(fatalError);

    await expect(
      retry(fn, {
        maxAttempts: 5,
        shouldAbort: (err) => err instanceof Error && err.message === 'fatal',
      }),
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not abort for non-matching errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('retriable'))
      .mockResolvedValue('done');

    const result = await retry(fn, {
      maxAttempts: 3,
      shouldAbort: (err) => err instanceof Error && err.message === 'fatal',
    });

    expect(result.value).toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws RangeError for maxAttempts < 1', async () => {
    await expect(retry(() => Promise.resolve('x'), { maxAttempts: 0 })).rejects.toThrow(RangeError);
  });

  it('reports correct attempt count on success after retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockResolvedValue('ok');

    const result = await retry(fn, { maxAttempts: 5 });
    expect(result.attempts).toBe(2);
  });

  it('uses default maxAttempts of 3', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(retry(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
