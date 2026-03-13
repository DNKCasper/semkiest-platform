import { randomUUID } from 'crypto';
import type { ILLMProvider } from './providers/base.provider.js';
import { ProviderFactory } from './providers/factory.js';
import type { ProviderFactoryOptions } from './providers/factory.js';
import { composeMiddleware } from './middleware/types.js';
import type { GatewayContext, MiddlewareFn } from './middleware/types.js';
import { createLoggingMiddleware } from './middleware/logging.middleware.js';
import type { LoggingMiddlewareOptions } from './middleware/logging.middleware.js';
import { createTokenTrackingMiddleware } from './middleware/token-tracking.middleware.js';
import type { TokenTrackingMiddlewareOptions } from './middleware/token-tracking.middleware.js';
import { createRateLimitingMiddleware } from './middleware/rate-limiting.middleware.js';
import type { RateLimitingMiddlewareOptions } from './middleware/rate-limiting.middleware.js';
import type { LLMRequest, LLMResponse, PricingTable } from './types/index.js';
import { DEFAULT_PRICING_TABLE } from './types/index.js';

/** Options for constructing a gateway with built-in middleware */
export interface GatewayOptions {
  /** Provider factory configuration */
  factory?: ProviderFactoryOptions;

  /** Logging middleware configuration (pass `false` to disable) */
  logging?: LoggingMiddlewareOptions | false;

  /** Token tracking middleware configuration (pass `false` to disable) */
  tokenTracking?: TokenTrackingMiddlewareOptions | false;

  /** Rate limiting middleware configuration (pass `false` to disable) */
  rateLimiting?: RateLimitingMiddlewareOptions | false;

  /**
   * Additional custom middleware to inject before the built-in middleware.
   * Middleware runs in the order provided.
   */
  middleware?: MiddlewareFn[];

  /** Custom pricing table for cost calculations */
  pricingTable?: PricingTable;
}

/**
 * LLM Gateway — the primary entry point for making LLM requests.
 *
 * The gateway composes a middleware pipeline around a provider factory,
 * providing logging, token tracking, rate limiting, and extensibility.
 *
 * ```ts
 * const gateway = new LLMGateway({
 *   logging: { logger: myLogger },
 *   tokenTracking: { db: myDbAdapter },
 *   rateLimiting: { redis: myRedis, getBudget: async (orgId) => ({ monthlyTokenLimit: 1_000_000 }) },
 * });
 *
 * gateway.registerProvider(claudeProvider);
 *
 * const response = await gateway.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   attribution: { organizationId: 'org_123', projectId: 'proj_456' },
 * });
 * ```
 */
export class LLMGateway {
  private readonly factory: ProviderFactory;
  private readonly pipeline: (ctx: GatewayContext) => Promise<void>;
  readonly pricingTable: PricingTable;

  constructor(options: GatewayOptions = {}) {
    this.factory = new ProviderFactory(options.factory);
    this.pricingTable = options.pricingTable ?? DEFAULT_PRICING_TABLE;

    const middlewares: MiddlewareFn[] = [];

    // 1. Custom middleware (outermost — runs first/last)
    if (options.middleware) {
      middlewares.push(...options.middleware);
    }

    // 2. Logging middleware
    if (options.logging !== false) {
      middlewares.push(createLoggingMiddleware(options.logging ?? {}));
    }

    // 3. Rate limiting middleware (before token tracking so over-budget requests fail fast)
    if (options.rateLimiting !== false && options.rateLimiting) {
      middlewares.push(createRateLimitingMiddleware(options.rateLimiting));
    }

    // 4. Token tracking middleware (innermost built-in — closest to provider call)
    if (options.tokenTracking !== false && options.tokenTracking) {
      middlewares.push(createTokenTrackingMiddleware(options.tokenTracking));
    }

    // Core handler: delegates to the provider factory
    const coreHandler = async (ctx: GatewayContext): Promise<void> => {
      ctx.response = await this.factory.complete(ctx.request);
    };

    this.pipeline = composeMiddleware(middlewares, coreHandler);
  }

  /**
   * Register an LLM provider with the gateway.
   *
   * @param provider - Provider implementation
   * @param priority - Lower values = higher priority in the fallback chain
   */
  registerProvider(provider: ILLMProvider, priority = 100): void {
    this.factory.register(provider, priority);
  }

  /**
   * Remove a provider (supports hot-swap without restart).
   */
  unregisterProvider(name: ILLMProvider['name']): void {
    this.factory.unregister(name);
  }

  /**
   * Return all currently registered provider names.
   */
  listProviders(): string[] {
    return this.factory.listProviders();
  }

  /**
   * Send a completion request through the full middleware pipeline.
   *
   * @param request - The request to send. `requestId` is auto-generated if omitted.
   * @returns The resolved LLM response with usage and cost information.
   * @throws {GatewayError} on provider failures
   * @throws {RateLimitError} when the org's monthly budget is exceeded
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const fullRequest: LLMRequest = {
      ...request,
      requestId: request.requestId ?? randomUUID(),
    };

    const ctx: GatewayContext = {
      request: fullRequest,
      meta: {},
    };

    await this.pipeline(ctx);

    if (!ctx.response) {
      throw new Error('Pipeline completed without a response (internal error)');
    }

    return ctx.response;
  }
}
