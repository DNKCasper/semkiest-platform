import { parseApiEnv, apiEnvSchema } from './api';

const validBase = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/semkiest?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a_very_long_secret_that_is_at_least_32_chars_long',
  CORS_ORIGINS: 'http://localhost:3000',
};

describe('apiEnvSchema', () => {
  it('parses valid env and applies defaults', () => {
    const result = apiEnvSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.PORT).toBe(3001);
      expect(result.data.HOST).toBe('0.0.0.0');
      expect(result.data.JWT_EXPIRES_IN).toBe('7d');
      expect(result.data.LOG_LEVEL).toBe('info');
    }
  });

  it('parses CORS_ORIGINS as an array', () => {
    const result = apiEnvSchema.safeParse({
      ...validBase,
      CORS_ORIGINS: 'http://localhost:3000,https://app.semkiest.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.CORS_ORIGINS).toEqual([
        'http://localhost:3000',
        'https://app.semkiest.com',
      ]);
    }
  });

  it('coerces PORT string to number', () => {
    const result = apiEnvSchema.safeParse({ ...validBase, PORT: '4000' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(4000);
  });

  it('rejects PORT out of valid range', () => {
    const result = apiEnvSchema.safeParse({ ...validBase, PORT: '99999' });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric PORT', () => {
    const result = apiEnvSchema.safeParse({ ...validBase, PORT: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects JWT_SECRET shorter than 32 characters', () => {
    const result = apiEnvSchema.safeParse({ ...validBase, JWT_SECRET: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = apiEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid NODE_ENV value', () => {
    const result = apiEnvSchema.safeParse({ ...validBase, NODE_ENV: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('parseApiEnv', () => {
  it('returns typed env on success', () => {
    const env = parseApiEnv(validBase as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3001);
    expect(env.JWT_SECRET).toBe(validBase.JWT_SECRET);
  });

  it('throws descriptive error listing all missing vars', () => {
    expect(() => parseApiEnv({} as NodeJS.ProcessEnv)).toThrow(
      /Invalid API server environment variables/,
    );
  });

  it('error message includes the offending variable names', () => {
    expect(() => parseApiEnv({} as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
    expect(() => parseApiEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
