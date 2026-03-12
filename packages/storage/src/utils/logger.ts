/**
 * Simple structured logger for storage operations.
 * Outputs JSON-formatted log entries with timestamps.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
}

function formatEntry(
  level: LogLevel,
  message: string,
  context?: string,
  data?: Record<string, unknown>,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context !== undefined && { context }),
    ...(data !== undefined && { data }),
  };
}

function serialize(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Storage-specific logger with optional context label.
 */
export class StorageLogger {
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.log(serialize(formatEntry('info', message, this.context, data)));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(serialize(formatEntry('warn', message, this.context, data)));
  }

  error(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error(serialize(formatEntry('error', message, this.context, data)));
  }
}
