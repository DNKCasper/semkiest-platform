import { sleep } from './helpers.js';

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in milliseconds. Default: 100 */
  initialDelayMs?: number;
  /** Multiplier applied to delay after each failure. Default: 2 */
  backoffMultiplier?: number;
  /** Maximum delay cap in milliseconds. Default: 30_000 */
  maxDelayMs?: number;
  /**
   * Predicate called with each error. Return true to abort retrying
   * immediately (e.g. for non-retriable errors). Default: always retry.
   */
  shouldAbort?: (error: unknown) => boolean;
}

export interface RetryResult<T> {
  value: T;
  attempts: number;
}

/**
 * Execute `fn` with exponential backoff retry logic.
 *
 * @throws The last error thrown by `fn` if all attempts are exhausted,
 *         or the first error if `shouldAbort` returns true.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    backoffMultiplier = 2,
    maxDelayMs = 30_000,
    shouldAbort = () => false,
  } = options;

  if (maxAttempts < 1) throw new RangeError('maxAttempts must be at least 1');

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (err) {
      lastError = err;

      if (shouldAbort(err)) {
        throw err;
      }

      if (attempt < maxAttempts) {
        await sleep(Math.min(delayMs, maxDelayMs));
        delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError;
}
