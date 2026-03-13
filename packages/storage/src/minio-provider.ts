import * as Minio from 'minio';
import { createChildLogger } from '@semkiest/shared-utils';

import type { IStorageProvider } from './storage-provider.js';
import type { StorageConfig, StorageKey, StorageObject, UploadFileInput } from './types.js';

const DEFAULT_EXPIRATION_SECONDS = 3600;

const log = createChildLogger({ service: 'storage', provider: 'minio' });

/**
 * Builds the storage key for a screenshot artifact.
 * Path: {projectId}/{testRunId}/screenshots/{testResultId}/{timestamp}.{ext}
 */
function buildScreenshotKey(
  projectId: string,
  testRunId: string,
  testResultId: string,
  contentType: string,
): string {
  const ext = contentType.split('/')[1] ?? 'png';
  return `${projectId}/${testRunId}/screenshots/${testResultId}/${Date.now()}.${ext}`;
}

/**
 * Builds the storage key for a baseline image.
 * Path: {projectId}/baselines/{name}
 */
function buildBaselineKey(projectId: string, name: string): string {
  return `${projectId}/baselines/${name}`;
}

/**
 * Builds the storage key for a report artifact.
 * Path: {testRunId}/reports/{format}/{timestamp}-report.{format}
 */
function buildReportKey(testRunId: string, format: string): string {
  return `${testRunId}/reports/${format}/${Date.now()}-report.${format}`;
}

/**
 * Parses a URL string into MinIO Client constructor options.
 */
function parseEndpoint(endpoint: string): { endPoint: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port ? parseInt(url.port, 10) : useSSL ? 443 : 80;
  return { endPoint: url.hostname, port, useSSL };
}

/**
 * MinIO implementation of IStorageProvider.
 *
 * Uses the official MinIO JavaScript SDK. Designed for local development
 * with a MinIO instance running via Docker Compose.
 */
export class MinioProvider implements IStorageProvider {
  private readonly client: Minio.Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;

    const endpointOptions = config.endpoint
      ? parseEndpoint(config.endpoint)
      : { endPoint: 's3.amazonaws.com', port: 443, useSSL: true };

    this.client = new Minio.Client({
      ...endpointOptions,
      accessKey: config.accessKeyId,
      secretKey: config.secretAccessKey,
    });

    log.info(
      { bucket: config.bucket, endPoint: endpointOptions.endPoint },
      'MinioProvider initialised',
    );
  }

  /** @inheritdoc */
  async uploadScreenshot(
    projectId: string,
    testRunId: string,
    testResultId: string,
    file: UploadFileInput,
  ): Promise<StorageKey> {
    const key = buildScreenshotKey(projectId, testRunId, testResultId, file.contentType);
    await this.upload(key, file);
    log.info({ key, projectId, testRunId, testResultId }, 'Screenshot uploaded');
    return key;
  }

  /** @inheritdoc */
  async uploadBaseline(
    projectId: string,
    name: string,
    file: UploadFileInput,
  ): Promise<StorageKey> {
    const key = buildBaselineKey(projectId, name);
    await this.upload(key, file);
    log.info({ key, projectId, name }, 'Baseline uploaded');
    return key;
  }

  /** @inheritdoc */
  async uploadReport(
    testRunId: string,
    format: string,
    content: Buffer | string,
  ): Promise<StorageKey> {
    const key = buildReportKey(testRunId, format);
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const file: UploadFileInput = {
      buffer,
      contentType: `application/${format === 'html' ? 'html' : format === 'json' ? 'json' : 'octet-stream'}`,
      size: buffer.byteLength,
    };
    await this.upload(key, file);
    log.info({ key, testRunId, format }, 'Report uploaded');
    return key;
  }

  /** @inheritdoc */
  async getSignedUrl(key: StorageKey, expirationSeconds = DEFAULT_EXPIRATION_SECONDS): Promise<string> {
    log.debug({ key, expirationSeconds }, 'Generating pre-signed URL');

    const url = await this.client.presignedGetObject(this.bucket, key, expirationSeconds);

    log.info({ key, expirationSeconds }, 'Pre-signed URL generated');
    return url;
  }

  /** @inheritdoc */
  async deleteObject(key: StorageKey): Promise<void> {
    log.debug({ key }, 'Deleting object');

    await this.client.removeObject(this.bucket, key);

    log.info({ key }, 'Object deleted');
  }

  /** @inheritdoc */
  async listObjects(prefix: string): Promise<StorageObject[]> {
    log.debug({ prefix }, 'Listing objects');

    const results: StorageObject[] = [];

    await new Promise<void>((resolve, reject) => {
      const stream = this.client.listObjects(this.bucket, prefix, true);

      stream.on('data', (obj: Minio.BucketItem) => {
        results.push({
          key: obj.name ?? '',
          size: obj.size ?? 0,
          lastModified: obj.lastModified ?? new Date(0),
          etag: obj.etag?.replace(/^"|"$/g, ''),
        });
      });

      stream.on('error', reject);
      stream.on('end', resolve);
    });

    log.info({ prefix, count: results.length }, 'Objects listed');
    return results;
  }

  /**
   * Internal helper: uploads a file buffer to MinIO.
   */
  private async upload(key: string, file: UploadFileInput): Promise<void> {
    log.debug({ key, contentType: file.contentType, size: file.size }, 'Uploading object');

    const metaData: Minio.ItemBucketMetadata = {
      'Content-Type': file.contentType,
      ...file.metadata,
    };

    await this.client.putObject(this.bucket, key, file.buffer, file.size, metaData);
  }
}
