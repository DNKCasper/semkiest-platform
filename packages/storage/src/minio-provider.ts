import * as Minio from 'minio';

import type { IStorageProvider } from './storage-provider.js';
import type { StorageFile, StorageKey, StorageObject, StorageProviderConfig } from './types.js';
import { StorageLogger } from './utils/logger.js';
import { withRetry } from './utils/retry.js';
import { buildKey, extensionFromMimeType, generateUniqueId } from './utils/key.js';

const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * MinIO storage provider implementation.
 * Designed for local development with Docker.
 */
export class MinioProvider implements IStorageProvider {
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly logger: StorageLogger;

  constructor(config: StorageProviderConfig) {
    this.bucket = config.bucket;
    this.logger = new StorageLogger('MinioProvider');

    const endpointUrl = config.endpoint !== undefined ? new URL(config.endpoint) : undefined;

    this.client = new Minio.Client({
      endPoint: endpointUrl?.hostname ?? 'localhost',
      port: config.port ?? (endpointUrl?.port !== '' ? parseInt(endpointUrl?.port ?? '9000', 10) : 9000),
      useSSL: config.useSSL ?? false,
      accessKey: config.accessKeyId,
      secretKey: config.secretAccessKey,
    });
  }

  async uploadScreenshot(
    projectId: string,
    testRunId: string,
    testResultId: string,
    file: StorageFile,
  ): Promise<StorageKey> {
    const ext = extensionFromMimeType(file.mimeType);
    const filename = file.originalName ?? `${generateUniqueId()}.${ext}`;
    const key = buildKey(projectId, testRunId, testResultId, 'screenshots', filename);

    this.logger.info('Uploading screenshot', { key, size: file.size, mimeType: file.mimeType });

    await withRetry(
      () =>
        this.client.putObject(this.bucket, key, file.buffer, file.size, {
          'Content-Type': file.mimeType,
          'x-amz-meta-project-id': projectId,
          'x-amz-meta-test-run-id': testRunId,
          'x-amz-meta-test-result-id': testResultId,
        }),
      MAX_RETRY_ATTEMPTS,
    );

    this.logger.info('Screenshot uploaded', { key });
    return key;
  }

  async uploadBaseline(projectId: string, name: string, file: StorageFile): Promise<StorageKey> {
    const key = buildKey(projectId, 'baselines', name);

    this.logger.info('Uploading baseline', { key, size: file.size, mimeType: file.mimeType });

    await withRetry(
      () =>
        this.client.putObject(this.bucket, key, file.buffer, file.size, {
          'Content-Type': file.mimeType,
          'x-amz-meta-project-id': projectId,
        }),
      MAX_RETRY_ATTEMPTS,
    );

    this.logger.info('Baseline uploaded', { key });
    return key;
  }

  async uploadReport(
    testRunId: string,
    format: string,
    content: Buffer | string,
  ): Promise<StorageKey> {
    const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const key = buildKey('reports', testRunId, format, `report-${generateUniqueId()}.${format}`);

    this.logger.info('Uploading report', { key, format, size: body.length });

    await withRetry(
      () =>
        this.client.putObject(this.bucket, key, body, body.length, {
          'Content-Type': formatToMimeType(format),
          'x-amz-meta-test-run-id': testRunId,
          'x-amz-meta-format': format,
        }),
      MAX_RETRY_ATTEMPTS,
    );

    this.logger.info('Report uploaded', { key });
    return key;
  }

  async getSignedUrl(
    key: StorageKey,
    expirationSeconds = DEFAULT_PRESIGNED_EXPIRY_SECONDS,
  ): Promise<string> {
    this.logger.info('Generating presigned URL', { key, expirationSeconds });

    const url = await this.client.presignedGetObject(this.bucket, key, expirationSeconds);

    this.logger.info('Presigned URL generated', { key });
    return url;
  }

  async deleteObject(key: StorageKey): Promise<void> {
    this.logger.info('Deleting object', { key });

    await withRetry(
      () => this.client.removeObject(this.bucket, key),
      MAX_RETRY_ATTEMPTS,
    );

    this.logger.info('Object deleted', { key });
  }

  async listObjects(prefix: string): Promise<StorageObject[]> {
    this.logger.info('Listing objects', { prefix });

    return new Promise<StorageObject[]>((resolve, reject) => {
      const objects: StorageObject[] = [];
      const stream = this.client.listObjects(this.bucket, prefix, true);

      stream.on('data', (item) => {
        if (item.name !== undefined) {
          objects.push({
            key: item.name,
            size: item.size ?? 0,
            lastModified: item.lastModified ?? new Date(0),
            etag: item.etag,
          });
        }
      });

      stream.on('error', (err) => {
        this.logger.error('Error listing objects', {
          prefix,
          error: err.message,
        });
        reject(err);
      });

      stream.on('end', () => {
        this.logger.info('Objects listed', { prefix, count: objects.length });
        resolve(objects);
      });
    });
  }
}

function formatToMimeType(format: string): string {
  const map: Record<string, string> = {
    html: 'text/html',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    pdf: 'application/pdf',
  };
  return map[format] ?? 'application/octet-stream';
}
