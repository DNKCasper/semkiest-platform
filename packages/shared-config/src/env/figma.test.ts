import { figmaEnvSchema, parseFigmaEnv } from './figma';

const validBase = {
  FIGMA_ACCESS_TOKEN: 'figd_personal_access_token_example',
};

const validEncrypted = {
  FIGMA_ACCESS_TOKEN_ENCRYPTED: '{"iv":"aabbcc","authTag":"ddeeff","ciphertext":"112233"}',
  FIGMA_ENCRYPTION_KEY: 'a'.repeat(64),
};

describe('figmaEnvSchema', () => {
  it('accepts a plain-text token with defaults applied', () => {
    const result = figmaEnvSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.FIGMA_API_BASE_URL).toBe('https://api.figma.com/v1');
      expect(result.data.FIGMA_API_TIMEOUT_MS).toBe(30_000);
      expect(result.data.FIGMA_API_MAX_RETRIES).toBe(3);
    }
  });

  it('accepts an encrypted token with a valid encryption key', () => {
    const result = figmaEnvSchema.safeParse(validEncrypted);
    expect(result.success).toBe(true);
  });

  it('rejects when neither token nor encrypted token is set', () => {
    const result = figmaEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects encrypted token without encryption key', () => {
    const result = figmaEnvSchema.safeParse({
      FIGMA_ACCESS_TOKEN_ENCRYPTED: 'some_encrypted_blob',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid FIGMA_ENCRYPTION_KEY (wrong length)', () => {
    const result = figmaEnvSchema.safeParse({
      ...validEncrypted,
      FIGMA_ENCRYPTION_KEY: 'tooshort',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid FIGMA_API_BASE_URL', () => {
    const result = figmaEnvSchema.safeParse({
      ...validBase,
      FIGMA_API_BASE_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a custom FIGMA_API_TIMEOUT_MS', () => {
    const result = figmaEnvSchema.safeParse({
      ...validBase,
      FIGMA_API_TIMEOUT_MS: '60000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.FIGMA_API_TIMEOUT_MS).toBe(60_000);
    }
  });

  it('rejects FIGMA_API_TIMEOUT_MS below minimum (1000)', () => {
    const result = figmaEnvSchema.safeParse({ ...validBase, FIGMA_API_TIMEOUT_MS: '500' });
    expect(result.success).toBe(false);
  });

  it('accepts FIGMA_API_MAX_RETRIES of 0', () => {
    const result = figmaEnvSchema.safeParse({ ...validBase, FIGMA_API_MAX_RETRIES: '0' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.FIGMA_API_MAX_RETRIES).toBe(0);
    }
  });
});

describe('parseFigmaEnv', () => {
  it('returns typed env on success', () => {
    const env = parseFigmaEnv(validBase as NodeJS.ProcessEnv);
    expect(env.FIGMA_ACCESS_TOKEN).toBe('figd_personal_access_token_example');
    expect(env.FIGMA_API_MAX_RETRIES).toBe(3);
  });

  it('throws a descriptive error when required vars are missing', () => {
    expect(() => parseFigmaEnv({} as NodeJS.ProcessEnv)).toThrow(
      /Invalid Figma environment variables/,
    );
  });

  it('error mentions FIGMA_ACCESS_TOKEN when it is missing', () => {
    expect(() => parseFigmaEnv({} as NodeJS.ProcessEnv)).toThrow(/FIGMA_ACCESS_TOKEN/);
  });
});
