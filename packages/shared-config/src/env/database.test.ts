import { parseDatabaseEnv, databaseEnvSchema } from './database';

const validBase = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/semkiest?schema=public',
};

describe('databaseEnvSchema', () => {
  it('parses valid env with only DATABASE_URL', () => {
    const result = databaseEnvSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_URL).toBe(validBase.DATABASE_URL);
      expect(result.data.DIRECT_URL).toBeUndefined();
    }
  });

  it('accepts optional DIRECT_URL', () => {
    const result = databaseEnvSchema.safeParse({
      ...validBase,
      DIRECT_URL: 'postgresql://user:pass@localhost:5432/semkiest',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing DATABASE_URL', () => {
    const result = databaseEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-postgresql DATABASE_URL protocol', () => {
    const result = databaseEnvSchema.safeParse({
      DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL format for DATABASE_URL', () => {
    const result = databaseEnvSchema.safeParse({
      DATABASE_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('parseDatabaseEnv', () => {
  it('returns typed env on success', () => {
    const env = parseDatabaseEnv(validBase as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(validBase.DATABASE_URL);
  });

  it('throws descriptive error listing all missing vars', () => {
    expect(() => parseDatabaseEnv({} as NodeJS.ProcessEnv)).toThrow(
      /Invalid database environment variables/,
    );
  });

  it('error message includes the offending variable name', () => {
    expect(() => parseDatabaseEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
