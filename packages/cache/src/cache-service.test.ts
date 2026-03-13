import { CacheService } from './cache-service.js';

function makeRedis(overrides: Record<string, jest.Mock> = {}): jest.Mocked<{
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  exists: jest.Mock;
  mget: jest.Mock;
  pipeline: jest.Mock;
  scan: jest.Mock;
}> {
  const pipelineMock = {
    set: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    mget: jest.fn(),
    pipeline: jest.fn().mockReturnValue(pipelineMock),
    scan: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ReturnType<typeof makeRedis>>;
}

describe('CacheService', () => {
  describe('get', () => {
    it('returns null when key does not exist', async () => {
      const redis = makeRedis({ get: jest.fn().mockResolvedValue(null) });
      const svc = new CacheService(redis as never);
      expect(await svc.get('missing')).toBeNull();
    });

    it('deserialises stored JSON value', async () => {
      const redis = makeRedis({ get: jest.fn().mockResolvedValue('{"x":1}') });
      const svc = new CacheService(redis as never);
      expect(await svc.get<{ x: number }>('key')).toEqual({ x: 1 });
    });
  });

  describe('set', () => {
    it('calls SET without options', async () => {
      const setMock = jest.fn().mockResolvedValue('OK');
      const redis = makeRedis({ set: setMock });
      const svc = new CacheService(redis as never);
      await svc.set('k', { v: 1 });
      expect(setMock).toHaveBeenCalledWith('k', JSON.stringify({ v: 1 }));
    });

    it('calls SET EX with ttlSeconds', async () => {
      const setMock = jest.fn().mockResolvedValue('OK');
      const redis = makeRedis({ set: setMock });
      const svc = new CacheService(redis as never);
      await svc.set('k', 42, { ttlSeconds: 60 });
      expect(setMock).toHaveBeenCalledWith('k', '42', 'EX', 60);
    });

    it('calls SET NX without ttl when onlyIfNotExists', async () => {
      const setMock = jest.fn().mockResolvedValue('OK');
      const redis = makeRedis({ set: setMock });
      const svc = new CacheService(redis as never);
      await svc.set('k', 'v', { onlyIfNotExists: true });
      expect(setMock).toHaveBeenCalledWith('k', '"v"', 'NX');
    });

    it('calls SET EX NX with ttl and onlyIfNotExists', async () => {
      const setMock = jest.fn().mockResolvedValue('OK');
      const redis = makeRedis({ set: setMock });
      const svc = new CacheService(redis as never);
      await svc.set('k', 'v', { ttlSeconds: 10, onlyIfNotExists: true });
      expect(setMock).toHaveBeenCalledWith('k', '"v"', 'EX', 10, 'NX');
    });
  });

  describe('setWithTTL', () => {
    it('delegates to set with ttlSeconds option', async () => {
      const setMock = jest.fn().mockResolvedValue('OK');
      const redis = makeRedis({ set: setMock });
      const svc = new CacheService(redis as never);
      await svc.setWithTTL('k', 'v', 30);
      expect(setMock).toHaveBeenCalledWith('k', '"v"', 'EX', 30);
    });
  });

  describe('del', () => {
    it('returns 0 for empty array', async () => {
      const redis = makeRedis();
      const svc = new CacheService(redis as never);
      expect(await svc.del([])).toBe(0);
    });

    it('deletes a single key string', async () => {
      const delMock = jest.fn().mockResolvedValue(1);
      const redis = makeRedis({ del: delMock });
      const svc = new CacheService(redis as never);
      expect(await svc.del('k')).toBe(1);
      expect(delMock).toHaveBeenCalledWith('k');
    });

    it('deletes multiple keys', async () => {
      const delMock = jest.fn().mockResolvedValue(2);
      const redis = makeRedis({ del: delMock });
      const svc = new CacheService(redis as never);
      expect(await svc.del(['a', 'b'])).toBe(2);
      expect(delMock).toHaveBeenCalledWith('a', 'b');
    });
  });

  describe('exists', () => {
    it('returns true when key exists', async () => {
      const redis = makeRedis({ exists: jest.fn().mockResolvedValue(1) });
      const svc = new CacheService(redis as never);
      expect(await svc.exists('k')).toBe(true);
    });

    it('returns false when key does not exist', async () => {
      const redis = makeRedis({ exists: jest.fn().mockResolvedValue(0) });
      const svc = new CacheService(redis as never);
      expect(await svc.exists('k')).toBe(false);
    });
  });

  describe('mget', () => {
    it('returns empty array for empty keys', async () => {
      const redis = makeRedis();
      const svc = new CacheService(redis as never);
      expect(await svc.mget([])).toEqual([]);
    });

    it('deserialises results and preserves nulls', async () => {
      const redis = makeRedis({
        mget: jest.fn().mockResolvedValue(['{"a":1}', null, '"hello"']),
      });
      const svc = new CacheService(redis as never);
      expect(await svc.mget(['k1', 'k2', 'k3'])).toEqual([{ a: 1 }, null, 'hello']);
    });
  });

  describe('mset', () => {
    it('does nothing for empty array', async () => {
      const pipelineMock = { set: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
      const redis = makeRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const svc = new CacheService(redis as never);
      await svc.mset([]);
      expect(pipelineMock.exec).not.toHaveBeenCalled();
    });

    it('pipelines SET commands, using EX for entries with ttl', async () => {
      const pipelineMock = { set: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
      const redis = makeRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const svc = new CacheService(redis as never);
      await svc.mset([
        { key: 'a', value: 1 },
        { key: 'b', value: 2, ttlSeconds: 60 },
      ]);
      expect(pipelineMock.set).toHaveBeenCalledWith('a', '1');
      expect(pipelineMock.set).toHaveBeenCalledWith('b', '2', 'EX', 60);
      expect(pipelineMock.exec).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidatePattern', () => {
    it('deletes all matching keys using cursor-based SCAN', async () => {
      const scanMock = jest.fn()
        .mockResolvedValueOnce(['1', ['key:1', 'key:2']])
        .mockResolvedValueOnce(['0', ['key:3']]);
      const delMock = jest.fn().mockResolvedValue(2);
      const redis = makeRedis({ scan: scanMock, del: delMock });
      const svc = new CacheService(redis as never);
      const deleted = await svc.invalidatePattern('key:*');
      expect(deleted).toBe(4); // 2 + 2 (del called twice returning 2 each)
    });

    it('returns 0 when no keys match', async () => {
      const scanMock = jest.fn().mockResolvedValue(['0', []]);
      const redis = makeRedis({ scan: scanMock });
      const svc = new CacheService(redis as never);
      expect(await svc.invalidatePattern('nope:*')).toBe(0);
    });
  });
});
