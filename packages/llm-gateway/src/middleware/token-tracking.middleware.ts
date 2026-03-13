import type { GatewayContext, MiddlewareFn, NextFunction } from './types.js';
import type { TokenUsage, CostBreakdown, CostAttribution, ProviderName } from '../types/index.js';

/**
 * Data record persisted for each request.
 * Mirrors the `ai_credit_usage` table schema.
 */
export interface UsageRecord {
  requestId: string;
  organizationId: string;
  projectId?: string;
  agentType?: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  templateId?: string;
  templateVersion?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Database adapter interface.
 *
 * By accepting an interface rather than a concrete Prisma client, the middleware
 * remains testable with simple mock implementations and is decoupled from the
 * database package.
 */
export interface DatabaseAdapter {
  /**
   * Persist a usage record to the database.
   * Implementations should be idempotent on `requestId`.
   */
  createUsageRecord(record: UsageRecord): Promise<void>;

  /**
   * Return the total tokens consumed by an organization in the current calendar month.
   */
  getMonthlyTokenUsage(organizationId: string, month: Date): Promise<number>;
}

export interface TokenTrackingMiddlewareOptions {
  db: DatabaseAdapter;
  /**
   * Called after a record is successfully persisted.
   * Useful for emitting metrics or events.
   */
  onRecordPersisted?: (record: UsageRecord) => void;
  /**
   * Called when persistence fails.
   * By default, errors are logged to stderr but do NOT fail the request.
   */
  onPersistError?: (error: unknown, requestId: string) => void;
}

/**
 * Middleware that persists token usage to the database after each successful request.
 *
 * Design notes:
 * - Persistence failures are non-fatal by default (the LLM response is still returned)
 * - The record includes full cost attribution (org / project / agent)
 * - `requestId` is the deduplication key so retries do not double-count
 */
export function createTokenTrackingMiddleware(
  options: TokenTrackingMiddlewareOptions,
): MiddlewareFn {
  const { db, onRecordPersisted, onPersistError } = options;

  const defaultOnPersistError = (error: unknown, requestId: string) => {
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        message: 'llm-gateway: failed to persist token usage',
        requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }) + '\n',
    );
  };

  const handlePersistError = onPersistError ?? defaultOnPersistError;

  return async (ctx: GatewayContext, next: NextFunction): Promise<void> => {
    await next();

    // Only track successful responses
    if (!ctx.response) return;

    const { response, request } = ctx;
    const record = buildUsageRecord(request.attribution, response.provider, response.model, response.usage, response.cost, response.requestId, request.templateRef, request.metadata as Record<string, unknown> | undefined);

    try {
      await db.createUsageRecord(record);
      onRecordPersisted?.(record);
    } catch (error) {
      handlePersistError(error, record.requestId);
    }
  };
}

function buildUsageRecord(
  attribution: CostAttribution,
  provider: ProviderName,
  model: string,
  usage: TokenUsage,
  cost: CostBreakdown,
  requestId: string,
  templateRef?: { id: string; version: string },
  metadata?: Record<string, unknown>,
): UsageRecord {
  return {
    requestId,
    organizationId: attribution.organizationId,
    projectId: attribution.projectId,
    agentType: attribution.agentType,
    provider,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    costUsd: cost.totalCostUsd,
    templateId: templateRef?.id,
    templateVersion: templateRef?.version,
    metadata,
    createdAt: new Date(),
  };
}
