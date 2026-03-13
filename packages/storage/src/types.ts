/**
 * A storage key uniquely identifies an object within the bucket.
 * Format: {orgId}/{projectId}/{testRunId}/{type}/{filename}
 */
export type StorageKey = string;

/** Metadata about a stored object returned by listObjects. */
export interface StorageObject {
  /** Object key within the bucket. */
  key: string;
  /** Size in bytes. */
  size: number;
  /** Timestamp of last modification. */
  lastModified: Date;
  /** ETag (MD5 or multipart hash) assigned by the storage backend. */
  etag?: string;
}

/** Input payload for an upload operation. */
export interface UploadFileInput {
  /** Raw file content. */
  buffer: Buffer;
  /** MIME type (e.g. "image/png", "application/json"). */
  contentType: string;
  /** File size in bytes. */
  size: number;
  /** Optional custom metadata to attach to the stored object. */
  metadata?: Record<string, string>;
}

/** Runtime configuration for a storage provider instance. */
export interface StorageConfig {
  /** Bucket name to read/write objects in. */
  bucket: string;
  /** AWS region (or "us-east-1" dummy value for MinIO). */
  region: string;
  /** Access key ID. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
  /** Custom endpoint URL for MinIO or other S3-compatible backends. */
  endpoint?: string;
  /** When true, forces path-style URLs (required for MinIO). */
  forcePathStyle?: boolean;
}

/** Provider discriminator. Controlled by the S3_PROVIDER environment variable. */
export type StorageProviderType = 's3' | 'minio';
