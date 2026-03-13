import type { StorageKey, StorageObject, UploadFileInput } from './types.js';

/**
 * Provider-agnostic storage interface.
 *
 * All storage backends (AWS S3, MinIO) must implement this interface so that
 * callers can remain decoupled from the underlying storage technology.
 */
export interface IStorageProvider {
  /**
   * Upload a test-run screenshot and return its storage key.
   *
   * Objects are stored at:
   *   {projectId}/{testRunId}/screenshots/{testResultId}/{filename}
   *
   * @param projectId    Unique project identifier.
   * @param testRunId    Unique test-run identifier.
   * @param testResultId Unique test-result identifier.
   * @param file         File buffer, content-type, size, and optional metadata.
   * @returns            The storage key of the uploaded object.
   */
  uploadScreenshot(
    projectId: string,
    testRunId: string,
    testResultId: string,
    file: UploadFileInput,
  ): Promise<StorageKey>;

  /**
   * Upload a baseline image and return its storage key.
   *
   * Objects are stored at:
   *   {projectId}/baselines/{name}
   *
   * @param projectId Unique project identifier.
   * @param name      Baseline name / filename.
   * @param file      File buffer, content-type, size, and optional metadata.
   * @returns         The storage key of the uploaded object.
   */
  uploadBaseline(
    projectId: string,
    name: string,
    file: UploadFileInput,
  ): Promise<StorageKey>;

  /**
   * Upload a test report and return its storage key.
   *
   * Objects are stored at:
   *   {testRunId}/reports/{format}/{timestamp}-report.{format}
   *
   * @param testRunId Unique test-run identifier.
   * @param format    Report format (e.g. "html", "json", "xml").
   * @param content   Report content as a Buffer or UTF-8 string.
   * @returns         The storage key of the uploaded object.
   */
  uploadReport(
    testRunId: string,
    format: string,
    content: Buffer | string,
  ): Promise<StorageKey>;

  /**
   * Generate a time-limited pre-signed URL for secure object access.
   *
   * @param key               Storage key of the target object.
   * @param expirationSeconds URL validity in seconds. Default: 3600 (1 hour).
   * @returns                 A pre-signed URL string.
   */
  getSignedUrl(key: StorageKey, expirationSeconds?: number): Promise<string>;

  /**
   * Permanently delete a single object from the bucket.
   *
   * @param key Storage key of the object to delete.
   */
  deleteObject(key: StorageKey): Promise<void>;

  /**
   * List all objects whose key begins with the given prefix.
   *
   * @param prefix Key prefix to filter results (e.g. "project-1/run-2/").
   * @returns      Array of matching storage objects.
   */
  listObjects(prefix: string): Promise<StorageObject[]>;
}
