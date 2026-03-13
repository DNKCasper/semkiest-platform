import {
  AgentModelConfig,
  GatewayConfig,
  HealthStatus,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  UsageRecord,
} from './types';
import { BaseProvider } from './providers/base';
import { ProviderFactory } from './providers/factory';
import { HealthChecker } from './providers/health';

/**
 * Central LLM Gateway that coordinates multiple providers with:
 * - Per-agent model configuration
 * - Automatic fallback when the primary provider fails
 * - Token usage tracking and cost attribution
 * - Circuit breaker protection via HealthChecker
 * - Provider health monitoring
 */
export class LLMGateway {
  private readonly providers: Map<LLMProvider, BaseProvider>;
  private readonly agentConfigs: Map<string, AgentModelConfig>;
  private readonly defaultProvider: LLMProvider;
  private readonly defaultModel: string | undefined;
  private readonly healthChecker: HealthChecker;
  private readonly usageLog: UsageRecord[] = [];

  constructor(private readonly config: GatewayConfig) {
    // Build provider instances from config
    this.providers = ProviderFactory.createAll(config.providers);

    if (this.providers.size === 0) {
      throw new Error('[LLMGateway] At least one provider must be configured.');
    }

    // Index per-agent model configs by agentType
    this.agentConfigs = new Map(
      (config.agentConfigs ?? []).map((ac) => [ac.agentType, ac]),
    );

    // Choose a sensible default provider
    this.defaultProvider =
      config.defaultProvider ?? (this.providers.keys().next().value as LLMProvider);

    this.defaultModel = config.defaultModel;

    // Wire up health checker
    this.healthChecker = new HealthChecker(this.providers, {
      intervalMs: config.healthCheckIntervalMs ?? 60_000,
      circuitBreakerConfig: config.circuitBreaker,
    });
  }

  /**
   * Starts the background health-check loop.
   * Call this after construction if you want automatic health monitoring.
   */
  startHealthChecks(): void {
    this.healthChecker.start();
  }

  /** Stops the background health-check loop. */
  stopHealthChecks(): void {
    this.healthChecker.stop();
  }

  /**
   * Sends a completion request.
   *
   * If `metadata.agentType` matches a registered AgentModelConfig the
   * configured primary (and fallback) provider+model combination is used.
   * Otherwise the gateway-level defaults apply.
   *
   * The fallback provider is tried automatically when:
   * - The circuit breaker for the primary provider is open, or
   * - The primary provider throws an error.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const agentType = request.metadata?.agentType;
    const agentCfg = agentType ? this.agentConfigs.get(agentType) : undefined;

    // Build an ordered list of (provider, model) pairs to try
    const candidates = this.buildCandidates(request, agentCfg);

    let lastError: Error | undefined;

    for (const { providerKey, model } of candidates) {
      // Check circuit breaker
      if (!this.healthChecker.isProviderAllowed(providerKey)) {
        lastError = new Error(
          `[LLMGateway] Circuit breaker is OPEN for provider "${providerKey}". Skipping.`,
        );
        continue;
      }

      const provider = this.providers.get(providerKey);
      if (!provider) {
        lastError = new Error(
          `[LLMGateway] Provider "${providerKey}" is configured in agent config but not available.`,
        );
        continue;
      }

      const resolvedRequest: LLMRequest = { ...request, model };

      try {
        const response = await provider.complete(resolvedRequest);
        this.healthChecker.recordOutcome(providerKey, true);
        this.recordUsage(response);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.healthChecker.recordOutcome(providerKey, false);
        lastError = error;
        // Continue to next candidate
      }
    }

    throw lastError ?? new Error('[LLMGateway] No providers available to serve the request.');
  }

  /** Returns the current health status of all providers. */
  getHealthStatuses(): HealthStatus[] {
    return this.healthChecker.getAllStatuses();
  }

  /** Triggers an immediate health check for all providers. */
  async checkHealth(): Promise<HealthStatus[]> {
    await this.healthChecker.checkAll();
    return this.getHealthStatuses();
  }

  /**
   * Returns a copy of all usage records accumulated since the gateway started
   * (or since the last call to `clearUsageLog`).
   */
  getUsageLog(): UsageRecord[] {
    return [...this.usageLog];
  }

  /**
   * Returns aggregated token usage grouped by the provided dimension.
   * Useful for cost attribution by project, agent, or run.
   */
  getAggregatedUsage(
    groupBy: 'projectId' | 'agentId' | 'agentType' | 'provider',
  ): Map<string, { inputTokens: number; outputTokens: number; estimatedCostUsd: number }> {
    const result = new Map<
      string,
      { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
    >();

    for (const record of this.usageLog) {
      const key = groupBy === 'provider' ? record.provider : (record[groupBy] ?? 'unknown');
      const existing = result.get(key) ?? { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
      result.set(key, {
        inputTokens: existing.inputTokens + record.inputTokens,
        outputTokens: existing.outputTokens + record.outputTokens,
        estimatedCostUsd: existing.estimatedCostUsd + record.estimatedCostUsd,
      });
    }

    return result;
  }

  /** Clears the in-memory usage log. */
  clearUsageLog(): void {
    this.usageLog.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildCandidates(
    request: LLMRequest,
    agentCfg: AgentModelConfig | undefined,
  ): Array<{ providerKey: LLMProvider; model: string | undefined }> {
    if (agentCfg) {
      const candidates: Array<{ providerKey: LLMProvider; model: string | undefined }> = [
        { providerKey: agentCfg.primaryProvider, model: agentCfg.primaryModel },
      ];
      if (agentCfg.fallbackProvider) {
        candidates.push({
          providerKey: agentCfg.fallbackProvider,
          model: agentCfg.fallbackModel,
        });
      }
      return candidates;
    }

    // No agent config — use the request model / gateway default
    const model = request.model ?? this.defaultModel;

    // Primary: gateway default provider
    const primary = { providerKey: this.defaultProvider, model };
    const candidates: Array<{ providerKey: LLMProvider; model: string | undefined }> = [primary];

    // Include any other configured providers as fallbacks
    for (const key of this.providers.keys()) {
      if (key !== this.defaultProvider) {
        candidates.push({ providerKey: key, model: undefined });
      }
    }

    return candidates;
  }

  private recordUsage(response: LLMResponse): void {
    this.usageLog.push({
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      estimatedCostUsd: response.usage.estimatedCostUsd ?? 0,
      projectId: response.metadata?.projectId,
      agentId: response.metadata?.agentId,
      agentType: response.metadata?.agentType,
      runId: response.metadata?.runId,
      timestamp: new Date(),
    });
  }
}
