/**
 * @semkiest/storage
 *
 * Unified object-storage service for the SemkiEst platform.
 *
 * Abstracts both MinIO (local development) and AWS S3 (production) behind a
 * single provider-agnostic interface. The active backend is selected at runtime
 * via the S3_PROVIDER environment variable (default: "minio").
 *
 * Usage:
 *   import { createStorageProvider } from '@semkiest/storage';
 *   const storage = createStorageProvider();
 *   const key = await storage.uploadScreenshot(projectId, runId, resultId, file);
 *   const url = await storage.getSignedUrl(key);
 */

import { parseS3Env } from '@semkiest/shared-config/env/s3';
import { createChildLogger } from '@semkiest/shared-utils';

import { MinioProvider } from './minio-provider.js';
import { S3Provider } from './s3-provider.js';
import type { IStorageProvider } from './storage-provider.js';
import type { StorageConfig, StorageProviderType } from './types.js';

export type { IStorageProvider } from './storage-provider.js';
export type {
  StorageConfig,
  StorageKey,
  StorageObject,
  StorageProviderType,
  UploadFileInput,
} from './types.js';

const log = createChildLogger({ service: 'storage' });

/**
 * Reads the S3_PROVIDER env var and returns the selected provider type.
 * Falls back to "minio" for local development safety.
 */
function resolveProviderType(): StorageProviderType {
  const raw = process.env['S3_PROVIDER'];
  if (raw === 's3') return 's3';
  if (raw === 'minio') return 'minio';
  return 'minio';
}

/**
 * Builds a StorageConfig from validated environment variables.
 */
function buildConfig(): StorageConfig {
  const env = parseS3Env();
  return {
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}

/**
 * Factory function that instantiates and returns the appropriate storage
 * provider based on the S3_PROVIDER environment variable.
 *
 * @param overrideType Optional provider type override (useful in tests).
 * @returns            A configured IStorageProvider instance.
 */
export function createStorageProvider(overrideType?: StorageProviderType): IStorageProvider {
  const type = overrideType ?? resolveProviderType();
  const config = buildConfig();

  log.info({ provider: type }, 'Creating storage provider');

  if (type === 's3') {
    return new S3Provider(config);
  }

  return new MinioProvider(config);
}

export { MinioProvider } from './minio-provider.js';
export { S3Provider } from './s3-provider.js';
