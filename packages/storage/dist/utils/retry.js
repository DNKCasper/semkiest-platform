"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
const logger_js_1 = require("./logger.js");
const retryLogger = new logger_js_1.StorageLogger('retry');
/**
 * Executes an async operation with exponential-backoff retry logic.
 *
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds before first retry (default: 200)
 * @returns Result of the successful operation
 * @throws Last error if all attempts are exhausted
 */
async function withRetry(fn, maxAttempts = 3, initialDelayMs = 200) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (attempt === maxAttempts)
                break;
            const delayMs = initialDelayMs * 2 ** (attempt - 1);
            retryLogger.warn('Operation failed, retrying', {
                attempt,
                maxAttempts,
                delayMs,
                error: err instanceof Error ? err.message : String(err),
            });
            await sleep(delayMs);
        }
    }
    throw lastError;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map