import { parseS3Env, s3EnvSchema } from './s3';

const validBase = {
  S3_BUCKET: 'semkiest-uploads',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
};

describe('s3EnvSchema', () => {
  it('parses valid minimal env', () => {
    const result = s3EnvSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(false);
      expect(result.data.S3_ENDPOINT).toBeUndefined();
      expect(result.data.S3_PUBLIC_URL).toBeUndefined();
    }
  });

  it('accepts optional MinIO endpoint and sets S3_FORCE_PATH_STYLE=true', () => {
    const result = s3EnvSchema.safeParse({
      ...validBase,
      S3_ENDPOINT: 'http://localhost:9000',
      S3_FORCE_PATH_STYLE: 'true',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(true);
    }
  });

  it('rejects S3_BUCKET shorter than 3 characters', () => {
    const result = s3EnvSchema.safeParse({ ...validBase, S3_BUCKET: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects S3_BUCKET longer than 63 characters', () => {
    const result = s3EnvSchema.safeParse({ ...validBase, S3_BUCKET: 'a'.repeat(64) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid S3_ENDPOINT URL', () => {
    const result = s3EnvSchema.safeParse({ ...validBase, S3_ENDPOINT: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = s3EnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('parseS3Env', () => {
  it('returns typed env on success', () => {
    const env = parseS3Env(validBase as NodeJS.ProcessEnv);
    expect(env.S3_BUCKET).toBe('semkiest-uploads');
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('throws descriptive error listing all missing vars', () => {
    expect(() => parseS3Env({} as NodeJS.ProcessEnv)).toThrow(
      /Invalid S3 environment variables/,
    );
  });

  it('error message includes offending variable names', () => {
    expect(() => parseS3Env({} as NodeJS.ProcessEnv)).toThrow(/S3_BUCKET/);
  });
});
