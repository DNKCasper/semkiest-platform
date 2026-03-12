import { S3Provider } from './s3-provider.js';
import { MinioProvider } from './minio-provider.js';
import type { StorageProviderConfig, StorageProviderType } from './types.js';
import type { IStorageProvider } from './storage-provider.js';

export type { IStorageProvider } from './storage-provider.js';
export type {
  StorageKey,
  StorageFile,
  StorageObject,
  StorageProviderConfig,
  StorageProviderType,
} from './types.js';

/**
 * Creates a storage provider instance.
 *
 * @param type - Provider type ('s3' or 'minio'). Defaults to the S3_PROVIDER env var or 's3'.
 * @param config - Provider configuration
 * @returns Configured storage provider
 *
 * @example
 * ```typescript
 * const storage = createStorageProvider('minio', {
 *   bucket: 'test-artifacts',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   endpoint: 'http://localhost:9000',
 * });
 * ```
 */
export function createStorageProvider(
  type: StorageProviderType | undefined,
  config: StorageProviderConfig,
): IStorageProvider {
  const resolvedType: StorageProviderType =
    type ?? (process.env['S3_PROVIDER'] as StorageProviderType | undefined) ?? 's3';

  switch (resolvedType) {
    case 'minio':
      return new MinioProvider(config);
    case 's3':
      return new S3Provider(config);
    default: {
      const exhaustive: never = resolvedType;
      throw new Error(`Unknown storage provider type: ${String(exhaustive)}`);
    }
  }
}

/**
 * Creates a storage provider from environment variables.
 * Reads: S3_PROVIDER, S3_BUCKET, AWS_REGION, S3_ENDPOINT,
 *        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *        MINIO_USE_SSL, MINIO_PORT
 *
 * @throws If required environment variables are missing
 */
export function createStorageProviderFromEnv(): IStorageProvider {
  const bucket = requireEnv('S3_BUCKET');
  const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');
  const providerType = (process.env['S3_PROVIDER'] as StorageProviderType | undefined) ?? 's3';

  const config: StorageProviderConfig = {
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env['AWS_REGION'],
    endpoint: process.env['S3_ENDPOINT'],
    useSSL: process.env['MINIO_USE_SSL'] !== 'false',
    port: process.env['MINIO_PORT'] !== undefined ? parseInt(process.env['MINIO_PORT'], 10) : undefined,
    forcePathStyle: process.env['S3_FORCE_PATH_STYLE'] === 'true',
  };

  return createStorageProvider(providerType, config);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Required environment variable "${name}" is not set`);
  }
  return value;
}

export { S3Provider } from './s3-provider.js';
export { MinioProvider } from './minio-provider.js';
