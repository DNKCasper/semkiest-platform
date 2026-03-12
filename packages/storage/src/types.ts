/**
 * A unique key identifying an object in storage.
 * Format: {projectId}/{testRunId}/{testResultId}/{type}/{filename}
 */
export type StorageKey = string;

/**
 * Represents a file to be uploaded to storage.
 */
export interface StorageFile {
  /** Raw file content */
  buffer: Buffer;
  /** MIME type of the file (e.g., 'image/png', 'text/html') */
  mimeType: string;
  /** Size in bytes */
  size: number;
  /** Optional original filename */
  originalName?: string;
}

/**
 * Metadata for an object returned from listing storage.
 */
export interface StorageObject {
  /** Storage key of the object */
  key: StorageKey;
  /** Size in bytes */
  size: number;
  /** Last modification date */
  lastModified: Date;
  /** ETag for integrity checking */
  etag?: string;
}

/**
 * Configuration for a storage provider.
 */
export interface StorageProviderConfig {
  /** S3 bucket or MinIO bucket name */
  bucket: string;
  /** AWS region (S3 only) */
  region?: string;
  /** Custom endpoint URL (MinIO or S3-compatible services) */
  endpoint?: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Use SSL/TLS (MinIO only, defaults to true) */
  useSSL?: boolean;
  /** Port number (MinIO only) */
  port?: number;
  /** Force path-style URLs instead of virtual-hosted-style (S3 only) */
  forcePathStyle?: boolean;
}

/**
 * Supported storage provider types.
 */
export type StorageProviderType = 's3' | 'minio';
