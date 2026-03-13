import type { StorageProviderConfig, StorageProviderType } from './types.js';
import type { IStorageProvider } from './storage-provider.js';
export type { IStorageProvider } from './storage-provider.js';
export type { StorageKey, StorageFile, StorageObject, StorageProviderConfig, StorageProviderType, } from './types.js';
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
export declare function createStorageProvider(type: StorageProviderType | undefined, config: StorageProviderConfig): IStorageProvider;
/**
 * Creates a storage provider from environment variables.
 * Reads: S3_PROVIDER, S3_BUCKET, AWS_REGION, S3_ENDPOINT,
 *        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *        MINIO_USE_SSL, MINIO_PORT
 *
 * @throws If required environment variables are missing
 */
export declare function createStorageProviderFromEnv(): IStorageProvider;
export { S3Provider } from './s3-provider.js';
export { MinioProvider } from './minio-provider.js';
//# sourceMappingURL=index.d.ts.map