/**
 * Circuit breaker pattern for external service calls.
 *
 * Prevents cascading failures by tracking error rates and temporarily blocking
 * calls to services that are repeatedly failing. Transitions through three states:
 *   - CLOSED: Normal operation; calls pass through.
 *   - OPEN:   Service failing; calls are rejected immediately without execution.
 *   - HALF_OPEN: Probe state; limited calls are allowed to test if service recovered.
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Consecutive successes in HALF_OPEN required to close the circuit. Default: 2 */
  successThreshold?: number;
  /** Milliseconds to wait in OPEN state before probing. Default: 60_000 */
  resetTimeout?: number;
  /** Human-readable name used in error messages and metrics. */
  name?: string;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastStateChange: number;
}

/** Thrown when a call is attempted while the circuit breaker is OPEN. */
export class CircuitBreakerOpenError extends Error {
  readonly circuitName: string;

  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN — request rejected to prevent cascading failure`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = name;
  }
}

/**
 * Circuit breaker that wraps async functions with failure detection and automatic recovery.
 *
 * @example
 * ```ts
 * const breaker = new CircuitBreaker({ name: 'llm-api', failureThreshold: 3 });
 * const result = await breaker.execute(() => callLlmApi(prompt));
 * ```
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange = Date.now();

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeout: number;

  readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.resetTimeout = options.resetTimeout ?? 60_000;
    this.name = options.name ?? 'unnamed';
  }

  /**
   * Execute a function protected by this circuit breaker.
   * Throws {@link CircuitBreakerOpenError} when the circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    this.maybeTransitionFromOpen();

    if (this.state === 'OPEN') {
      throw new CircuitBreakerOpenError(this.name);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  /** Current operational statistics. */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
    };
  }

  /** Force the circuit breaker back to CLOSED state and reset counters. */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.transitionTo('CLOSED');
  }

  private recordSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.successes = 0;
        this.transitionTo('CLOSED');
      }
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.successes = 0;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private maybeTransitionFromOpen(): void {
    if (this.state === 'OPEN' && Date.now() - this.lastStateChange >= this.resetTimeout) {
      this.transitionTo('HALF_OPEN');
    }
  }

  private transitionTo(next: CircuitBreakerState): void {
    this.state = next;
    this.lastStateChange = Date.now();
  }
}

/**
 * Global registry for named circuit breakers.
 * Allows shared breaker instances across different modules.
 *
 * Pre-configured breakers for known external services:
 *   - 'llm-api'   — LLM provider (OpenAI, Anthropic, etc.)
 *   - 'figma-api' — Figma REST API
 *   - 'jira-api'  — Jira REST API
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  /** Get an existing breaker or create a new one with the given options. */
  getOrCreate(name: string, options?: Omit<CircuitBreakerOptions, 'name'>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ ...options, name });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /** Stats for all registered circuit breakers (useful for health checks). */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /** Remove a named breaker from the registry. */
  remove(name: string): void {
    this.breakers.delete(name);
  }

  /** Remove all registered breakers. Primarily useful in tests. */
  clear(): void {
    this.breakers.clear();
  }
}

/** Global circuit breaker registry shared across the application. */
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
