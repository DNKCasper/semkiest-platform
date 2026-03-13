import { RedisClient } from './redis-client.js';

// Mock ioredis so tests don't need a real Redis instance
jest.mock('ioredis', () => {
  const mockRedis = jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn().mockReturnThis(),
    status: 'ready',
  }));
  return mockRedis;
});

const Redis = require('ioredis') as jest.Mock;

describe('RedisClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates a Redis instance with the provided URL', () => {
      new RedisClient({ url: 'redis://localhost:6379' });
      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({ lazyConnect: true }),
      );
    });

    it('passes password when provided', () => {
      new RedisClient({ url: 'redis://localhost:6379', password: 'secret' });
      expect(Redis).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ password: 'secret' }),
      );
    });

    it('sets tls option when tls is true', () => {
      new RedisClient({ url: 'redis://localhost:6379', tls: true });
      expect(Redis).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tls: {} }),
      );
    });

    it('does not set tls option when tls is false', () => {
      new RedisClient({ url: 'redis://localhost:6379', tls: false });
      const callArgs = Redis.mock.calls[0] as [string, Record<string, unknown>];
      expect(callArgs[1]).not.toHaveProperty('tls');
    });
  });

  describe('connect', () => {
    it('calls connect on the underlying client', async () => {
      const rc = new RedisClient({ url: 'redis://localhost:6379' });
      await rc.connect();
      const instance = Redis.mock.results[0]?.value as { connect: jest.Mock };
      expect(instance.connect).toHaveBeenCalled();
    });
  });

  describe('ping', () => {
    it('returns latency as a number', async () => {
      const rc = new RedisClient({ url: 'redis://localhost:6379' });
      const latency = await rc.ping();
      expect(typeof latency).toBe('number');
      expect(latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getHealth', () => {
    it('returns isAlive:true when ping succeeds', async () => {
      const rc = new RedisClient({ url: 'redis://localhost:6379' });
      const health = await rc.getHealth();
      expect(health.isAlive).toBe(true);
      expect(typeof health.latencyMs).toBe('number');
      expect(health.lastPingAt).not.toBeNull();
    });

    it('returns isAlive:false when ping throws', async () => {
      const instance = { connect: jest.fn(), ping: jest.fn().mockRejectedValue(new Error('fail')), on: jest.fn().mockReturnThis(), status: 'close', quit: jest.fn(), disconnect: jest.fn() };
      Redis.mockImplementationOnce(() => instance);
      const rc = new RedisClient({ url: 'redis://localhost:6379' });
      const health = await rc.getHealth();
      expect(health.isAlive).toBe(false);
      expect(health.latencyMs).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('calls quit on the underlying client', async () => {
      const rc = new RedisClient({ url: 'redis://localhost:6379' });
      await rc.disconnect();
      const instance = Redis.mock.results[0]?.value as { quit: jest.Mock };
      expect(instance.quit).toHaveBeenCalled();
    });
  });

  describe('forceDisconnect', () => {
    it('calls disconnect on the underlying client', () => {
      const rc = new RedisClient({ url: 'redis://localhost:6379' });
      rc.forceDisconnect();
      const instance = Redis.mock.results[0]?.value as { disconnect: jest.Mock };
      expect(instance.disconnect).toHaveBeenCalled();
    });
  });

  describe('native', () => {
    it('returns the underlying ioredis instance', () => {
      const rc = new RedisClient({ url: 'redis://localhost:6379' });
      const instance = Redis.mock.results[0]?.value;
      expect(rc.native).toBe(instance);
    });
  });
});

describe('getRedisClient', () => {
  it('exports getRedisClient as a function', () => {
    // Verify the export exists and is callable without needing a live Redis
    const mod = jest.requireActual('./redis-client.js') as typeof import('./redis-client.js');
    expect(typeof mod.getRedisClient).toBe('function');
  });

  it('throws when no client has been initialised', () => {
    jest.resetModules();
    // Fresh require so the singleton is undefined
    const { getRedisClient: freshGet } = jest.requireActual('./redis-client.js') as typeof import('./redis-client.js');
    expect(() => freshGet()).toThrow('[RedisClient] No client initialised');
  });
});
