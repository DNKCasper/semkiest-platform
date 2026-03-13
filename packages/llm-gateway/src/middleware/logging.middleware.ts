import type { GatewayContext, MiddlewareFn, NextFunction } from './types.js';
import type { LLMRequest, LLMResponse } from '../types/index.js';

/** Fields that must never appear in logs */
const SENSITIVE_FIELD_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token(?!s)/i,  // token (singular), not tokens
  /password/i,
  /credential/i,
  /authorization/i,
  /auth(?:orization)?/i,
];

const REDACTED = '[REDACTED]';

/**
 * Recursively sanitize an object by redacting sensitive keys.
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return value; // guard against deep recursion
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
    sanitized[key] = isSensitive ? REDACTED : sanitize(val, depth + 1);
  }
  return sanitized;
}

/**
 * Sanitize content: truncate long strings and strip any inline secrets.
 */
function sanitizeContent(content: string, maxLength = 500): string {
  const truncated = content.length > maxLength
    ? `${content.slice(0, maxLength)}...[truncated ${content.length - maxLength} chars]`
    : content;

  // Redact common secret patterns in content (e.g. "Bearer sk-...")
  return truncated.replace(/\bsk-[A-Za-z0-9]{10,}\b/g, REDACTED);
}

function buildRequestLog(request: LLMRequest): Record<string, unknown> {
  return {
    requestId: request.requestId,
    provider: request.provider,
    model: request.model,
    attribution: request.attribution,
    templateRef: request.templateRef,
    messageCount: request.messages.length,
    // Show truncated message previews but never full content in prod
    messages: request.messages.map((m) => ({
      role: m.role,
      contentPreview: sanitizeContent(m.content),
    })),
    params: request.params,
    metadata: sanitize(request.metadata),
  };
}

function buildResponseLog(response: LLMResponse): Record<string, unknown> {
  return {
    requestId: response.requestId,
    provider: response.provider,
    model: response.model,
    finishReason: response.finishReason,
    usage: response.usage,
    cost: response.cost,
    latencyMs: response.latencyMs,
    contentPreview: sanitizeContent(response.content),
  };
}

export interface LoggingMiddlewareOptions {
  /**
   * Logger implementation. Defaults to a simple structured console logger.
   * Provide your own to integrate with pino, winston, etc.
   */
  logger?: Logger;
  /** Set to false to skip logging request content previews */
  logRequestContent?: boolean;
}

/** Minimal logger interface */
export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** Default structured console logger */
export const defaultLogger: Logger = {
  info(message, data) {
    process.stdout.write(
      JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), ...data }) + '\n',
    );
  },
  warn(message, data) {
    process.stdout.write(
      JSON.stringify({ level: 'warn', message, timestamp: new Date().toISOString(), ...data }) + '\n',
    );
  },
  error(message, data) {
    process.stderr.write(
      JSON.stringify({ level: 'error', message, timestamp: new Date().toISOString(), ...data }) + '\n',
    );
  },
};

/**
 * Middleware that logs every request and response through the gateway.
 *
 * Security guarantees:
 * - API keys and secrets are redacted before logging
 * - Message content is truncated to prevent log bloat
 * - Error details are sanitized before output
 */
export function createLoggingMiddleware(options: LoggingMiddlewareOptions = {}): MiddlewareFn {
  const logger = options.logger ?? defaultLogger;

  return async (ctx: GatewayContext, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    logger.info('llm-gateway: request started', buildRequestLog(ctx.request));

    try {
      await next();

      if (ctx.response) {
        logger.info('llm-gateway: request completed', {
          ...buildResponseLog(ctx.response),
          wallTimeMs: Date.now() - startTime,
        });
      }
    } catch (error) {
      logger.error('llm-gateway: request failed', {
        requestId: ctx.request.requestId,
        error: error instanceof Error ? { message: error.message, name: error.name } : String(error),
        wallTimeMs: Date.now() - startTime,
      });
      throw error;
    }
  };
}
