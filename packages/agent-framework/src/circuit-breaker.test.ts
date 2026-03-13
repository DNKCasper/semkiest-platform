import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
  circuitBreakerRegistry,
} from './circuit-breaker';

const ok = <T>(value: T) => () => Promise.resolve(value);
const fail = (msg = 'boom') => () => Promise.reject(new Error(msg));

describe('CircuitBreaker', () => {
  describe('CLOSED state', () => {
    it('passes through successful calls', async () => {
      const cb = new CircuitBreaker({ name: 'test' });
      const result = await cb.execute(ok(42));
      expect(result).toBe(42);
    });

    it('propagates errors without opening below threshold', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
      await expect(cb.execute(fail())).rejects.toThrow('boom');
      expect(cb.getStats().state).toBe('CLOSED');
    });

    it('opens after reaching failureThreshold', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
      await expect(cb.execute(fail())).rejects.toThrow();
      await expect(cb.execute(fail())).rejects.toThrow();
      expect(cb.getStats().state).toBe('OPEN');
    });
  });

  describe('OPEN state', () => {
    it('throws CircuitBreakerOpenError without calling fn', async () => {
      const cb = new CircuitBreaker({ name: 'svc', failureThreshold: 1 });
      await expect(cb.execute(fail())).rejects.toThrow();

      const spy = jest.fn(ok(1));
      await expect(cb.execute(spy)).rejects.toThrow(CircuitBreakerOpenError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('transitions to HALF_OPEN after resetTimeout', async () => {
      const cb = new CircuitBreaker({ name: 'svc', failureThreshold: 1, resetTimeout: 50 });
      await expect(cb.execute(fail())).rejects.toThrow();
      expect(cb.getStats().state).toBe('OPEN');

      await new Promise((r) => setTimeout(r, 60));
      // Next call should probe (HALF_OPEN) rather than reject immediately
      await cb.execute(ok('probe'));
      expect(cb.getStats().state).toBe('CLOSED');
    });
  });

  describe('HALF_OPEN state', () => {
    it('closes after successThreshold successes', async () => {
      const cb = new CircuitBreaker({
        name: 'svc',
        failureThreshold: 1,
        resetTimeout: 50,
        successThreshold: 2,
      });
      await expect(cb.execute(fail())).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 60));

      await cb.execute(ok(1));
      expect(cb.getStats().state).toBe('HALF_OPEN');
      await cb.execute(ok(2));
      expect(cb.getStats().state).toBe('CLOSED');
    });

    it('reopens on failure during HALF_OPEN', async () => {
      const cb = new CircuitBreaker({ name: 'svc', failureThreshold: 1, resetTimeout: 50 });
      await expect(cb.execute(fail())).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 60));

      await expect(cb.execute(fail())).rejects.toThrow();
      expect(cb.getStats().state).toBe('OPEN');
    });
  });

  describe('reset()', () => {
    it('forces circuit back to CLOSED', async () => {
      const cb = new CircuitBreaker({ name: 'svc', failureThreshold: 1 });
      await expect(cb.execute(fail())).rejects.toThrow();
      expect(cb.getStats().state).toBe('OPEN');

      cb.reset();
      expect(cb.getStats().state).toBe('CLOSED');
      const result = await cb.execute(ok('after-reset'));
      expect(result).toBe('after-reset');
    });
  });

  describe('getStats()', () => {
    it('tracks totalRequests across calls', async () => {
      const cb = new CircuitBreaker({ name: 'svc' });
      await cb.execute(ok(1));
      await expect(cb.execute(fail())).rejects.toThrow();
      expect(cb.getStats().totalRequests).toBe(2);
    });

    it('records lastFailureTime on failure', async () => {
      const cb = new CircuitBreaker({ name: 'svc' });
      const before = Date.now();
      await expect(cb.execute(fail())).rejects.toThrow();
      expect(cb.getStats().lastFailureTime).toBeGreaterThanOrEqual(before);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it('creates a new breaker on first access', () => {
    const cb = registry.getOrCreate('svc');
    expect(cb.name).toBe('svc');
  });

  it('returns the same instance on subsequent calls', () => {
    const a = registry.getOrCreate('svc');
    const b = registry.getOrCreate('svc');
    expect(a).toBe(b);
  });

  it('getAllStats returns stats for all registered breakers', () => {
    registry.getOrCreate('a');
    registry.getOrCreate('b');
    const stats = registry.getAllStats();
    expect(Object.keys(stats)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('clear() removes all breakers', () => {
    registry.getOrCreate('a');
    registry.clear();
    expect(registry.getAllStats()).toEqual({});
  });
});

describe('global circuitBreakerRegistry', () => {
  afterEach(() => {
    circuitBreakerRegistry.clear();
  });

  it('is a CircuitBreakerRegistry instance', () => {
    expect(circuitBreakerRegistry).toBeInstanceOf(CircuitBreakerRegistry);
  });
});
