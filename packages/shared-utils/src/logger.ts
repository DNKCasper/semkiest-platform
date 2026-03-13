import pino, { type Logger, type LoggerOptions } from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Determine the active log level from LOG_LEVEL env var,
 * falling back to 'debug' in development and 'info' elsewhere.
 */
function resolveLogLevel(): LogLevel {
  const envLevel = process.env['LOG_LEVEL'] as LogLevel | undefined;
  if (envLevel) return envLevel;
  return process.env['NODE_ENV'] === 'development' ? 'debug' : 'info';
}

const baseOptions: LoggerOptions = {
  level: resolveLogLevel(),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
};

/** Root structured logger */
export const logger: Logger = pino(baseOptions);

/**
 * Create a child logger bound to a specific correlation ID.
 * All log records emitted by the child will include `correlationId`.
 */
export function createCorrelatedLogger(correlationId: string): Logger {
  return logger.child({ correlationId });
}

/**
 * Create a child logger with arbitrary bound context fields.
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
