"use strict";
/**
 * Simple structured logger for storage operations.
 * Outputs JSON-formatted log entries with timestamps.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageLogger = void 0;
function formatEntry(level, message, context, data) {
    return {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(context !== undefined && { context }),
        ...(data !== undefined && { data }),
    };
}
function serialize(entry) {
    return JSON.stringify(entry);
}
/**
 * Storage-specific logger with optional context label.
 */
class StorageLogger {
    context;
    constructor(context) {
        this.context = context;
    }
    info(message, data) {
        // eslint-disable-next-line no-console
        console.log(serialize(formatEntry('info', message, this.context, data)));
    }
    warn(message, data) {
        // eslint-disable-next-line no-console
        console.warn(serialize(formatEntry('warn', message, this.context, data)));
    }
    error(message, data) {
        // eslint-disable-next-line no-console
        console.error(serialize(formatEntry('error', message, this.context, data)));
    }
}
exports.StorageLogger = StorageLogger;
//# sourceMappingURL=logger.js.map