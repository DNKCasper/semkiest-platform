import { parseWorkerEnv, workerEnvSchema } from './worker';

const validBase = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/semkiest?schema=public',
  REDIS_URL: 'redis://localhost:6379',
};

describe('workerEnvSchema', () => {
  it('parses valid env and applies defaults', () => {
    const result = workerEnvSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.LOG_LEVEL).toBe('info');
      expect(result.data.WORKER_CONCURRENCY).toBe(5);
      expect(result.data.WORKER_QUEUES).toBeUndefined();
    }
  });

  it('coerces WORKER_CONCURRENCY string to number', () => {
    const result = workerEnvSchema.safeParse({ ...validBase, WORKER_CONCURRENCY: '10' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.WORKER_CONCURRENCY).toBe(10);
  });

  it('rejects WORKER_CONCURRENCY above 100', () => {
    const result = workerEnvSchema.safeParse({
      ...validBase,
      WORKER_CONCURRENCY: '101',
    });
    expect(result.success).toBe(false);
  });

  it('rejects WORKER_CONCURRENCY of 0', () => {
    const result = workerEnvSchema.safeParse({ ...validBase, WORKER_CONCURRENCY: '0' });
    expect(result.success).toBe(false);
  });

  it('parses WORKER_QUEUES as an array', () => {
    const result = workerEnvSchema.safeParse({
      ...validBase,
      WORKER_QUEUES: 'email,notifications,exports',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.WORKER_QUEUES).toEqual(['email', 'notifications', 'exports']);
    }
  });

  it('rejects missing DATABASE_URL and REDIS_URL', () => {
    const result = workerEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('parseWorkerEnv', () => {
  it('returns typed env on success', () => {
    const env = parseWorkerEnv(validBase as NodeJS.ProcessEnv);
    expect(env.WORKER_CONCURRENCY).toBe(5);
    expect(env.DATABASE_URL).toBe(validBase.DATABASE_URL);
  });

  it('throws descriptive error listing all missing vars', () => {
    expect(() => parseWorkerEnv({} as NodeJS.ProcessEnv)).toThrow(
      /Invalid worker environment variables/,
    );
  });

  it('error message includes the offending variable names', () => {
    expect(() => parseWorkerEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
    expect(() => parseWorkerEnv({} as NodeJS.ProcessEnv)).toThrow(/REDIS_URL/);
  });
});
