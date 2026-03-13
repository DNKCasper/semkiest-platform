import { CircuitBreakerConfig, HealthStatus, LLMProvider } from '../types';
import { BaseProvider } from './base';

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

/** Possible states of a circuit breaker. */
export enum CircuitState {
  /** Circuit is healthy; requests pass through normally. */
  CLOSED = 'CLOSED',
  /** Circuit is open due to too many failures; requests are rejected immediately. */
  OPEN = 'OPEN',
  /**
   * Circuit is in a trial state after the reset timeout; a single request
   * is allowed through to test if the provider has recovered.
   */
  HALF_OPEN = 'HALF_OPEN',
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  successThreshold: 2,
};

/**
 * Circuit breaker implementation for LLM provider calls.
 *
 * States:
 * - CLOSED: All requests pass through. Failures are counted.
 * - OPEN:   Requests are rejected immediately. After `resetTimeoutMs` the
 *           circuit moves to HALF_OPEN.
 * - HALF_OPEN: One probe request is allowed. Success closes the circuit;
 *              failure reopens it.
 */
export class CircuitBreaker {
  private readonly cfg: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private openedAt: number | null = null;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  /** Current circuit state. */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Returns true when the circuit allows a request to proceed.
   * - CLOSED: always true
   * - OPEN: false until reset timeout elapses, then transitions to HALF_OPEN
   * - HALF_OPEN: true (one probe allowed)
   */
  isAllowed(): boolean {
    if (this.state === CircuitState.CLOSED) return true;

    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.cfg.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN — allow the probe through
    return true;
  }

  /**
   * Records a successful call.
   * - CLOSED: resets failure counter
   * - HALF_OPEN: increments success counter; closes circuit when threshold met
   */
  recordSuccess(): void {
    if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
      return;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount += 1;
      if (this.successCount >= this.cfg.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Records a failed call.
   * - CLOSED: increments failure counter; opens circuit when threshold met
   * - HALF_OPEN: immediately reopens the circuit
   * - OPEN: no-op
   */
  recordFailure(): void {
    if (this.state === CircuitState.OPEN) return;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    this.failureCount += 1;
    if (this.failureCount >= this.cfg.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(next: CircuitState): void {
    this.state = next;
    if (next === CircuitState.OPEN) {
      this.openedAt = Date.now();
      this.successCount = 0;
    } else if (next === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.openedAt = null;
    } else if (next === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Health Checker
// ---------------------------------------------------------------------------

/** Options for the HealthChecker. */
export interface HealthCheckerOptions {
  /** Polling interval in milliseconds. Default: 60 000. */
  intervalMs?: number;
  /** Circuit breaker configuration applied to each provider. */
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
}

/**
 * Periodically checks the health of all registered providers and maintains
 * a circuit breaker per provider to prevent cascading failures.
 */
export class HealthChecker {
  private readonly providers: Map<LLMProvider, BaseProvider>;
  private readonly breakers: Map<LLMProvider, CircuitBreaker>;
  private readonly latestStatus: Map<LLMProvider, HealthStatus>;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    providers: Map<LLMProvider, BaseProvider>,
    options: HealthCheckerOptions = {},
  ) {
    this.providers = providers;
    this.intervalMs = options.intervalMs ?? 60_000;
    this.breakers = new Map();
    this.latestStatus = new Map();

    for (const key of providers.keys()) {
      this.breakers.set(key, new CircuitBreaker(options.circuitBreakerConfig));
    }
  }

  /**
   * Starts the background health-check polling loop.
   * Performs an initial check immediately.
   */
  start(): void {
    void this.checkAll();
    this.timer = setInterval(() => void this.checkAll(), this.intervalMs);
  }

  /** Stops the polling loop. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Returns the most recent health status for a provider.
   * Returns undefined if the provider has never been checked.
   */
  getStatus(provider: LLMProvider): HealthStatus | undefined {
    return this.latestStatus.get(provider);
  }

  /** Returns all latest health statuses as an array. */
  getAllStatuses(): HealthStatus[] {
    return Array.from(this.latestStatus.values());
  }

  /**
   * Returns true if the circuit breaker for the given provider allows requests.
   * Consult this before calling a provider to respect the circuit state.
   */
  isProviderAllowed(provider: LLMProvider): boolean {
    return this.breakers.get(provider)?.isAllowed() ?? true;
  }

  /** Returns the current circuit state for a provider. */
  getCircuitState(provider: LLMProvider): CircuitState {
    return this.breakers.get(provider)?.getState() ?? CircuitState.CLOSED;
  }

  /**
   * Records the outcome of a provider call, updating the circuit breaker.
   * Call this after every provider interaction.
   */
  recordOutcome(provider: LLMProvider, success: boolean): void {
    const breaker = this.breakers.get(provider);
    if (!breaker) return;
    if (success) {
      breaker.recordSuccess();
    } else {
      breaker.recordFailure();
    }
  }

  /** Checks all registered providers and updates stored statuses. */
  async checkAll(): Promise<void> {
    const checks = Array.from(this.providers.entries()).map(async ([key, provider]) => {
      try {
        const status = await provider.checkHealth();
        this.latestStatus.set(key, status);
      } catch (err) {
        this.latestStatus.set(key, {
          provider: key,
          healthy: false,
          error: err instanceof Error ? err.message : String(err),
          checkedAt: new Date(),
        });
      }
    });
    await Promise.all(checks);
  }

  /** Checks a single provider and updates its stored status. */
  async checkProvider(provider: LLMProvider): Promise<HealthStatus> {
    const instance = this.providers.get(provider);
    if (!instance) {
      const status: HealthStatus = {
        provider,
        healthy: false,
        error: `Provider "${provider}" is not registered.`,
        checkedAt: new Date(),
      };
      return status;
    }

    try {
      const status = await instance.checkHealth();
      this.latestStatus.set(provider, status);
      return status;
    } catch (err) {
      const status: HealthStatus = {
        provider,
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date(),
      };
      this.latestStatus.set(provider, status);
      return status;
    }
  }
}
