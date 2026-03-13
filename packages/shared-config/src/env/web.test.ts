import { parseWebEnv, webEnvSchema } from './web';

const validBase = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_API_URL: 'http://localhost:3001',
};

describe('webEnvSchema', () => {
  it('parses valid env and applies defaults', () => {
    const result = webEnvSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.NEXT_PUBLIC_DEBUG).toBe(false);
      expect(result.data.NEXTAUTH_SECRET).toBeUndefined();
      expect(result.data.NEXTAUTH_URL).toBeUndefined();
    }
  });

  it('rejects invalid NEXT_PUBLIC_APP_URL', () => {
    const result = webEnvSchema.safeParse({
      ...validBase,
      NEXT_PUBLIC_APP_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing NEXT_PUBLIC_APP_URL', () => {
    const result = webEnvSchema.safeParse({
      NEXT_PUBLIC_API_URL: 'http://localhost:3001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing NEXT_PUBLIC_API_URL', () => {
    const result = webEnvSchema.safeParse({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional NEXTAUTH vars', () => {
    const result = webEnvSchema.safeParse({
      ...validBase,
      NEXTAUTH_SECRET: 'a_very_long_secret_that_is_at_least_32_chars_long',
      NEXTAUTH_URL: 'http://localhost:3000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects NEXTAUTH_SECRET shorter than 32 characters', () => {
    const result = webEnvSchema.safeParse({
      ...validBase,
      NEXTAUTH_SECRET: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('coerces NEXT_PUBLIC_DEBUG string to boolean', () => {
    const result = webEnvSchema.safeParse({ ...validBase, NEXT_PUBLIC_DEBUG: 'true' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NEXT_PUBLIC_DEBUG).toBe(true);
  });
});

describe('parseWebEnv', () => {
  it('returns typed env on success', () => {
    const env = parseWebEnv(validBase as NodeJS.ProcessEnv);
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
    expect(env.NEXT_PUBLIC_DEBUG).toBe(false);
  });

  it('throws descriptive error listing all missing vars', () => {
    expect(() => parseWebEnv({} as NodeJS.ProcessEnv)).toThrow(
      /Invalid web dashboard environment variables/,
    );
  });

  it('error message includes the offending variable names', () => {
    expect(() => parseWebEnv({} as NodeJS.ProcessEnv)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
