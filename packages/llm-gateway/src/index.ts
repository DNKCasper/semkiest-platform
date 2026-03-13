/**
 * @semkiest/llm-gateway
 *
 * Multi-provider LLM gateway with automatic fallback, health checking,
 * circuit breaker, and token usage tracking.
 *
 * Quick start:
 * ```typescript
 * import { LLMGateway, LLMProvider } from '@semkiest/llm-gateway';
 *
 * const gateway = new LLMGateway({
 *   providers: {
 *     [LLMProvider.OPENAI]: {
 *       provider: LLMProvider.OPENAI,
 *       apiKey: process.env.OPENAI_API_KEY!,
 *       defaultModel: 'gpt-4o',
 *     },
 *     [LLMProvider.ANTHROPIC]: {
 *       provider: LLMProvider.ANTHROPIC,
 *       apiKey: process.env.ANTHROPIC_API_KEY!,
 *       defaultModel: 'claude-3-5-sonnet-20241022',
 *     },
 *   },
 *   defaultProvider: LLMProvider.OPENAI,
 * });
 *
 * const response = await gateway.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */

// Core gateway
export { LLMGateway } from './gateway';

// Providers
export { BaseProvider } from './providers/base';
export { AnthropicProvider, ANTHROPIC_MODELS } from './providers/anthropic';
export { OpenAIProvider, OPENAI_MODELS } from './providers/openai';
export { ProviderFactory } from './providers/factory';
export { HealthChecker, CircuitBreaker, CircuitState } from './providers/health';
export type { HealthCheckerOptions } from './providers/health';

// Types
export {
  LLMProvider,
} from './types';
export type {
  AgentModelConfig,
  AnthropicModel,
  CircuitBreakerConfig,
  GatewayConfig,
  HealthStatus,
  LLMMessage,
  LLMModel,
  LLMRequest,
  LLMResponse,
  MessageRole,
  OpenAIModel,
  ProviderConfig,
  RequestMetadata,
  TokenUsage,
  UsageRecord,
} from './types';
