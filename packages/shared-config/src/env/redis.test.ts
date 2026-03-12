import { parseRedisEnv, redisEnvSchema } from './redis';

const validBase = {
  REDIS_URL: 'redis://localhost:6379',
};

describe('redisEnvSchema', () => {
  it('parses valid env with defaults', () => {
    const result = redisEnvSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.REDIS_URL).toBe(validBase.REDIS_URL);
      expect(result.data.REDIS_KEY_PREFIX).toBe('semkiest');
      expect(result.data.REDIS_MAX_RETRIES).toBe(3);
    }
  });

  it('accepts rediss:// (TLS) protocol', () => {
    const result = redisEnvSchema.safeParse({
      REDIS_URL: 'rediss://user:pass@redis.example.com:6380',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing REDIS_URL', () => {
    const result = redisEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-redis protocol', () => {
    const result = redisEnvSchema.safeParse({
      REDIS_URL: 'http://localhost:6379',
    });
    expect(result.success).toBe(false);
  });

  it('coerces REDIS_MAX_RETRIES string to number', () => {
    const result = redisEnvSchema.safeParse({ ...validBase, REDIS_MAX_RETRIES: '5' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.REDIS_MAX_RETRIES).toBe(5);
  });

  it('rejects non-numeric REDIS_MAX_RETRIES', () => {
    const result = redisEnvSchema.safeParse({ ...validBase, REDIS_MAX_RETRIES: 'abc' });
    expect(result.success).toBe(false);
  });
});

describe('parseRedisEnv', () => {
  it('returns typed env on success', () => {
    const env = parseRedisEnv(validBase as NodeJS.ProcessEnv);
    expect(env.REDIS_URL).toBe(validBase.REDIS_URL);
  });

  it('throws descriptive error on missing REDIS_URL', () => {
    expect(() => parseRedisEnv({} as NodeJS.ProcessEnv)).toThrow(
      /Invalid Redis environment variables/,
    );
    expect(() => parseRedisEnv({} as NodeJS.ProcessEnv)).toThrow(/REDIS_URL/);
  });
});
