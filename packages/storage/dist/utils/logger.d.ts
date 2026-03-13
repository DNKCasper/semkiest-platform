/**
 * Simple structured logger for storage operations.
 * Outputs JSON-formatted log entries with timestamps.
 */
/**
 * Storage-specific logger with optional context label.
 */
export declare class StorageLogger {
    private readonly context;
    constructor(context: string);
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
}
//# sourceMappingURL=logger.d.ts.map