import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createChildLogger } from '@semkiest/shared-utils';
import { retry } from '@semkiest/shared-utils';

import type { IStorageProvider } from './storage-provider.js';
import type { StorageConfig, StorageKey, StorageObject, UploadFileInput } from './types.js';

const DEFAULT_EXPIRATION_SECONDS = 3600;
const MAX_RETRY_ATTEMPTS = 3;

const log = createChildLogger({ service: 'storage', provider: 's3' });

/**
 * Builds the storage key for a screenshot artifact.
 * Path: {projectId}/{testRunId}/screenshots/{testResultId}/{timestamp}.png
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
 * AWS S3 implementation of IStorageProvider.
 *
 * Uses AWS SDK v3 with exponential-backoff retry logic for transient failures.
 * Compatible with any S3-compatible backend (including MinIO when endpoint is set).
 */
export class S3Provider implements IStorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? false,
    });

    log.info({ bucket: config.bucket, region: config.region }, 'S3Provider initialised');
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

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await awsGetSignedUrl(this.client, command, { expiresIn: expirationSeconds });

    log.info({ key, expirationSeconds }, 'Pre-signed URL generated');
    return url;
  }

  /** @inheritdoc */
  async deleteObject(key: StorageKey): Promise<void> {
    log.debug({ key }, 'Deleting object');

    await retry(
      () => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
      { maxAttempts: MAX_RETRY_ATTEMPTS },
    );

    log.info({ key }, 'Object deleted');
  }

  /** @inheritdoc */
  async listObjects(prefix: string): Promise<StorageObject[]> {
    log.debug({ prefix }, 'Listing objects');

    const results: StorageObject[] = [];
    let continuationToken: string | undefined;

    do {
      const { value: response } = await retry(
        () =>
          this.client.send(
            new ListObjectsV2Command({
              Bucket: this.bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }),
          ),
        { maxAttempts: MAX_RETRY_ATTEMPTS },
      );

      for (const obj of response.Contents ?? []) {
        results.push(mapS3Object(obj));
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken !== undefined);

    log.info({ prefix, count: results.length }, 'Objects listed');
    return results;
  }

  /**
   * Internal helper: uploads a file buffer to S3 with retry logic.
   */
  private async upload(key: string, file: UploadFileInput): Promise<void> {
    log.debug({ key, contentType: file.contentType, size: file.size }, 'Uploading object');

    await retry(
      () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.contentType,
            ContentLength: file.size,
            Metadata: file.metadata,
          }),
        ),
      { maxAttempts: MAX_RETRY_ATTEMPTS },
    );
  }
}

function mapS3Object(obj: _Object): StorageObject {
  return {
    key: obj.Key ?? '',
    size: obj.Size ?? 0,
    lastModified: obj.LastModified ?? new Date(0),
    etag: obj.ETag?.replace(/^"|"$/g, ''),
  };
}
