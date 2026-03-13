import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import type {
  Baseline,
  BaselineKey,
  BaselineStatus,
  BaselineVersion,
  S3Config,
} from './types.js';

/**
 * JSON-serializable metadata stored alongside each baseline image in S3.
 */
interface BaselineMetadata {
  key: BaselineKey;
  status: BaselineStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  checksum: string;
}

/**
 * Manages baseline images for visual regression testing.
 *
 * Storage layout in S3/MinIO:
 * ```
 * {bucket}/
 *   {project}/{page}/{viewport}.png          ← current baseline
 *   {project}/{page}/{viewport}.json         ← current metadata
 *   {project}/{page}/{viewport}/history/
 *     {version}.png                          ← archived version
 *     {version}.json                         ← archived metadata
 *   {project}/{page}/{viewport}/{element}.png
 *   {project}/{page}/{viewport}/{element}.json
 *   {project}/{page}/{viewport}/{element}/history/
 *     {version}.png
 *     {version}.json
 * ```
 *
 * @example
 * ```ts
 * const manager = new BaselineManager(s3Config);
 * const baseline = await manager.createBaseline(
 *   { project: 'semkiest', page: 'dashboard', viewport: 'desktop' },
 *   screenshotBuffer,
 * );
 * ```
 */
export class BaselineManager {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string | undefined;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
    this.s3 = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle === true ? { forcePathStyle: true } : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  /**
   * Creates a new baseline. Throws if a baseline already exists for the key.
   *
   * @param key - Composite key identifying project/page/viewport/element.
   * @param screenshot - Raw PNG bytes.
   * @returns The newly created Baseline record.
   */
  async createBaseline(key: BaselineKey, screenshot: Buffer): Promise<Baseline> {
    const existing = await this.getBaseline(key);
    if (existing !== null) {
      throw new Error(
        `Baseline already exists for key: ${this.describeKey(key)}. ` +
          'Use updateBaseline() to overwrite.',
      );
    }

    const checksum = this.computeChecksum(screenshot);
    const now = new Date();
    const metadata: BaselineMetadata = {
      key,
      status: 'pending',
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      checksum,
    };

    await this.uploadImage(this.imageKey(key), screenshot);
    await this.uploadMetadata(this.metaKey(key), metadata);

    return this.toBaseline(metadata);
  }

  /**
   * Retrieves the current baseline for a key, or null if none exists.
   */
  async getBaseline(key: BaselineKey): Promise<Baseline | null> {
    try {
      const metadata = await this.downloadMetadata(this.metaKey(key));
      return this.toBaseline(metadata);
    } catch {
      return null;
    }
  }

  /**
   * Downloads the raw PNG bytes of the current baseline.
   *
   * @param key - Composite key.
   * @returns PNG bytes, or null if no baseline exists.
   */
  async getBaselineImage(key: BaselineKey): Promise<Buffer | null> {
    try {
      return await this.downloadImage(this.imageKey(key));
    } catch {
      return null;
    }
  }

  /**
   * Upserts a baseline. Archives the current version before overwriting.
   * Sets the new baseline status to 'pending'.
   *
   * @param key - Composite key.
   * @param screenshot - New PNG bytes.
   * @returns Updated Baseline record.
   */
  async updateBaseline(key: BaselineKey, screenshot: Buffer): Promise<Baseline> {
    const existing = await this.getBaseline(key);
    const now = new Date();
    const checksum = this.computeChecksum(screenshot);

    if (existing !== null) {
      // Archive the current version before overwriting
      await this.archiveVersion(key, existing);
    }

    const version = existing !== null ? existing.version + 1 : 1;
    const metadata: BaselineMetadata = {
      key,
      status: 'pending',
      version,
      createdAt: existing !== null ? existing.createdAt.toISOString() : now.toISOString(),
      updatedAt: now.toISOString(),
      checksum,
    };

    await this.uploadImage(this.imageKey(key), screenshot);
    await this.uploadMetadata(this.metaKey(key), metadata);

    return this.toBaseline(metadata);
  }

  /**
   * Approves a baseline, changing its status from 'pending' to 'approved'.
   *
   * @param key - Composite key.
   * @returns Updated Baseline record.
   */
  async approveBaseline(key: BaselineKey): Promise<Baseline> {
    return this.transitionStatus(key, 'approved');
  }

  /**
   * Rejects a baseline, changing its status to 'rejected'.
   * The image bytes are retained so the history is preserved.
   *
   * @param key - Composite key.
   * @returns Updated Baseline record.
   */
  async rejectBaseline(key: BaselineKey): Promise<Baseline> {
    return this.transitionStatus(key, 'rejected');
  }

  /**
   * Deletes a baseline and all its history versions.
   *
   * @param key - Composite key.
   */
  async deleteBaseline(key: BaselineKey): Promise<void> {
    const prefix = this.keyPrefix(key);
    await this.deleteObjectsWithPrefix(prefix);
  }

  /**
   * Lists all current baselines for a project.
   *
   * @param project - Project slug.
   * @returns Array of Baseline records (current versions only).
   */
  async listBaselines(project: string): Promise<Baseline[]> {
    const prefix = `${project}/`;
    const keys = await this.listObjectKeys(prefix);

    const metaKeys = keys.filter((k) => k.endsWith('.json') && !k.includes('/history/'));
    const baselines: Baseline[] = [];

    for (const metaKey of metaKeys) {
      try {
        const metadata = await this.downloadMetadata(metaKey);
        baselines.push(this.toBaseline(metadata));
      } catch {
        // Skip corrupted metadata entries
      }
    }

    return baselines;
  }

  /**
   * Retrieves the version history for a baseline.
   *
   * @param key - Composite key.
   * @returns Version history sorted ascending by version number.
   */
  async getBaselineHistory(key: BaselineKey): Promise<BaselineVersion[]> {
    const historyPrefix = `${this.keyPrefix(key)}/history/`;
    const keys = await this.listObjectKeys(historyPrefix);
    const metaKeys = keys.filter((k) => k.endsWith('.json'));

    const versions: BaselineVersion[] = [];
    for (const metaKey of metaKeys) {
      try {
        const metadata = await this.downloadMetadata(metaKey);
        versions.push({
          version: metadata.version,
          s3Key: metaKey.replace('.json', '.png'),
          createdAt: new Date(metadata.createdAt),
          checksum: metadata.checksum,
        });
      } catch {
        // Skip corrupted history entries
      }
    }

    return versions.sort((a, b) => a.version - b.version);
  }

  // ---------------------------------------------------------------------------
  // S3 key helpers
  // ---------------------------------------------------------------------------

  private keyPrefix(key: BaselineKey): string {
    const base = `${key.project}/${key.page}/${key.viewport}`;
    return key.element !== undefined ? `${base}/${this.sanitizeSelector(key.element)}` : base;
  }

  private imageKey(key: BaselineKey): string {
    return `${this.keyPrefix(key)}.png`;
  }

  private metaKey(key: BaselineKey): string {
    return `${this.keyPrefix(key)}.json`;
  }

  private historyImageKey(key: BaselineKey, version: number): string {
    return `${this.keyPrefix(key)}/history/${version}.png`;
  }

  private historyMetaKey(key: BaselineKey, version: number): string {
    return `${this.keyPrefix(key)}/history/${version}.json`;
  }

  /** Sanitizes a CSS selector for use as an S3 key segment. */
  private sanitizeSelector(selector: string): string {
    return selector.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private describeKey(key: BaselineKey): string {
    return `${key.project}/${key.page}/${key.viewport}${key.element !== undefined ? `/${key.element}` : ''}`;
  }

  // ---------------------------------------------------------------------------
  // S3 operations
  // ---------------------------------------------------------------------------

  private async uploadImage(s3Key: string, data: Buffer): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: data,
        ContentType: 'image/png',
      }),
    );
  }

  private async uploadMetadata(s3Key: string, metadata: BaselineMetadata): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: 'application/json',
      }),
    );
  }

  private async downloadImage(s3Key: string): Promise<Buffer> {
    const response: GetObjectCommandOutput = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );

    if (response.Body === undefined) {
      throw new Error(`Empty body for S3 key: ${s3Key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  private async downloadMetadata(s3Key: string): Promise<BaselineMetadata> {
    const response: GetObjectCommandOutput = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );

    if (response.Body === undefined) {
      throw new Error(`Empty body for S3 metadata key: ${s3Key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as BaselineMetadata;
  }

  private async listObjectKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (obj.Key !== undefined) {
          keys.push(obj.Key);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken !== undefined);

    return keys;
  }

  private async deleteObjectsWithPrefix(prefix: string): Promise<void> {
    const keys = await this.listObjectKeys(prefix);
    for (const key of keys) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async transitionStatus(key: BaselineKey, newStatus: BaselineStatus): Promise<Baseline> {
    const metaS3Key = this.metaKey(key);
    const metadata = await this.downloadMetadata(metaS3Key);
    metadata.status = newStatus;
    metadata.updatedAt = new Date().toISOString();
    await this.uploadMetadata(metaS3Key, metadata);
    return this.toBaseline(metadata);
  }

  private async archiveVersion(key: BaselineKey, baseline: Baseline): Promise<void> {
    const currentImage = await this.downloadImage(this.imageKey(key));
    await this.uploadImage(this.historyImageKey(key, baseline.version), currentImage);

    const currentMeta = await this.downloadMetadata(this.metaKey(key));
    await this.uploadMetadata(this.historyMetaKey(key, baseline.version), currentMeta);
  }

  private computeChecksum(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private toBaseline(metadata: BaselineMetadata): Baseline {
    return {
      key: metadata.key,
      s3Key: this.imageKey(metadata.key),
      s3Bucket: this.bucket,
      status: metadata.status,
      version: metadata.version,
      createdAt: new Date(metadata.createdAt),
      updatedAt: new Date(metadata.updatedAt),
      checksum: metadata.checksum,
    };
  }
}
