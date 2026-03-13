/** Supported log levels in severity order */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
  silent: -1,
};

/** Structured log entry */
interface LogEntry {
  level: LogLevel;
  time: string;
  msg: string;
  [key: string]: unknown;
}

/**
 * Minimal structured logger that emits newline-delimited JSON to stdout/stderr.
 * Swap this for pino or winston without changing call sites.
 */
export class Logger {
  private readonly minLevel: number;
  private readonly context: Record<string, unknown>;

  constructor(level: LogLevel = 'info', context: Record<string, unknown> = {}) {
    this.minLevel = LEVEL_RANK[level] ?? LEVEL_RANK.info;
    this.context = context;
  }

  /** Create a child logger that inherits this logger's level and merges extra context */
  child(extra: Record<string, unknown>): Logger {
    const childLogger = new Logger('info', { ...this.context, ...extra });
    // Copy the resolved numeric level rather than a string to keep them in sync
    (childLogger as { minLevel: number }).minLevel = this.minLevel;
    return childLogger;
  }

  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    const rank = LEVEL_RANK[level];
    if (rank < 0 || rank > this.minLevel) return;

    const entry: LogEntry = {
      level,
      time: new Date().toISOString(),
      ...this.context,
      ...meta,
      msg,
    };

    const line = JSON.stringify(entry);
    if (level === 'fatal' || level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  fatal(msg: string, meta?: Record<string, unknown>): void {
    this.write('fatal', msg, meta);
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    this.write('error', msg, meta);
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.write('warn', msg, meta);
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.write('info', msg, meta);
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.write('debug', msg, meta);
  }

  trace(msg: string, meta?: Record<string, unknown>): void {
    this.write('trace', msg, meta);
  }
}
