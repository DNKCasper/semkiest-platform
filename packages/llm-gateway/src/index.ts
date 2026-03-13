// Gateway
export { LLMGateway } from './gateway.js';
export type { GatewayOptions } from './gateway.js';

// Provider interfaces
export type { ILLMProvider, ProviderHealthStatus, ProviderRegistration } from './providers/base.provider.js';
export { ProviderFactory } from './providers/factory.js';
export type { ProviderFactoryOptions } from './providers/factory.js';

// Middleware
export {
  createLoggingMiddleware,
  defaultLogger,
  createTokenTrackingMiddleware,
  createRateLimitingMiddleware,
  getMonthlyTokenUsage,
  composeMiddleware,
} from './middleware/index.js';
export type {
  Logger,
  LoggingMiddlewareOptions,
  DatabaseAdapter,
  TokenTrackingMiddlewareOptions,
  UsageRecord,
  OrgBudgetConfig,
  RateLimitingMiddlewareOptions,
  RedisClient,
  RedisPipeline,
  GatewayContext,
  MiddlewareFn,
  NextFunction,
} from './middleware/index.js';

// Templates
export { TemplateManager, TemplateError } from './templates/index.js';
export type {
  TemplateManagerOptions,
  PromptTemplate,
  RenderedTemplate,
  TemplateVariable,
  TemplateVariables,
} from './templates/index.js';

// Core types
export {
  GatewayError,
  RateLimitError,
  DEFAULT_PRICING_TABLE,
  calculateCost,
} from './types/index.js';
export type {
  ProviderName,
  MessageRole,
  Message,
  CostAttribution,
  TemplateRef,
  GenerationParams,
  LLMRequest,
  TokenUsage,
  CostBreakdown,
  FinishReason,
  LLMResponse,
  ModelPricing,
  PricingTable,
} from './types/index.js';
