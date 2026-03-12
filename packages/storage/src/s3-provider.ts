import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { IStorageProvider } from './storage-provider.js';
import type { StorageFile, StorageKey, StorageObject, StorageProviderConfig } from './types.js';
import { StorageLogger } from './utils/logger.js';
import { withRetry } from './utils/retry.js';
import { buildKey, extensionFromMimeType, generateUniqueId } from './utils/key.js';

const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * AWS S3 storage provider implementation.
 * Uses AWS SDK v3 with retry logic and structured logging.
 */
export class S3Provider implements IStorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly logger: StorageLogger;

  constructor(config: StorageProviderConfig) {
    this.bucket = config.bucket;
    this.logger = new StorageLogger('S3Provider');

    this.client = new S3Client({
      region: config.region ?? 'us-east-1',
      ...(config.endpoint !== undefined && {
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle ?? true,
      }),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
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
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimeType,
            ContentLength: file.size,
            Metadata: {
              projectId,
              testRunId,
              testResultId,
            },
          }),
        ),
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
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimeType,
            ContentLength: file.size,
            Metadata: { projectId },
          }),
        ),
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
    const mimeType = formatToMimeType(format);
    const key = buildKey('reports', testRunId, format, `report-${generateUniqueId()}.${format}`);

    this.logger.info('Uploading report', { key, format, size: body.length });

    await withRetry(
      () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: mimeType,
            ContentLength: body.length,
            Metadata: { testRunId, format },
          }),
        ),
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

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await awsGetSignedUrl(this.client, command, { expiresIn: expirationSeconds });

    this.logger.info('Presigned URL generated', { key });
    return url;
  }

  async deleteObject(key: StorageKey): Promise<void> {
    this.logger.info('Deleting object', { key });

    await withRetry(
      () =>
        this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
      MAX_RETRY_ATTEMPTS,
    );

    this.logger.info('Object deleted', { key });
  }

  async listObjects(prefix: string): Promise<StorageObject[]> {
    this.logger.info('Listing objects', { prefix });

    const objects: StorageObject[] = [];
    let continuationToken: string | undefined;

    do {
      const response: ListObjectsV2CommandOutput = await withRetry(
        () =>
          this.client.send(
            new ListObjectsV2Command({
              Bucket: this.bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }),
          ),
        MAX_RETRY_ATTEMPTS,
      );

      for (const item of response.Contents ?? []) {
        if (item.Key !== undefined) {
          objects.push({
            key: item.Key,
            size: item.Size ?? 0,
            lastModified: item.LastModified ?? new Date(0),
            etag: item.ETag,
          });
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken !== undefined);

    this.logger.info('Objects listed', { prefix, count: objects.length });
    return objects;
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
