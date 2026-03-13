/**
 * Executes an async operation with exponential-backoff retry logic.
 *
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds before first retry (default: 200)
 * @returns Result of the successful operation
 * @throws Last error if all attempts are exhausted
 */
export declare function withRetry<T>(fn: () => Promise<T>, maxAttempts?: number, initialDelayMs?: number): Promise<T>;
//# sourceMappingURL=retry.d.ts.map