import type { StorageFile, StorageKey, StorageObject } from './types.js';

/**
 * Provider-agnostic storage interface.
 * All implementations must satisfy this contract.
 */
export interface IStorageProvider {
  /**
   * Upload a test screenshot.
   * Stored at: {projectId}/{testRunId}/{testResultId}/screenshots/{filename}
   *
   * @param projectId - Project identifier
   * @param testRunId - Test run identifier
   * @param testResultId - Test result identifier
   * @param file - File to upload
   * @returns Storage key for the uploaded object
   */
  uploadScreenshot(
    projectId: string,
    testRunId: string,
    testResultId: string,
    file: StorageFile,
  ): Promise<StorageKey>;

  /**
   * Upload a baseline image for visual comparison.
   * Stored at: {projectId}/baselines/{name}
   *
   * @param projectId - Project identifier
   * @param name - Baseline name/identifier
   * @param file - File to upload
   * @returns Storage key for the uploaded object
   */
  uploadBaseline(projectId: string, name: string, file: StorageFile): Promise<StorageKey>;

  /**
   * Upload a test report.
   * Stored at: reports/{testRunId}/{format}/{filename}
   *
   * @param testRunId - Test run identifier
   * @param format - Report format (e.g., 'html', 'json', 'xml')
   * @param content - Report content as Buffer or string
   * @returns Storage key for the uploaded object
   */
  uploadReport(testRunId: string, format: string, content: Buffer | string): Promise<StorageKey>;

  /**
   * Generate a time-limited presigned URL for secure access.
   *
   * @param key - Storage key of the object
   * @param expirationSeconds - URL validity period in seconds (default: 3600)
   * @returns Presigned URL string
   */
  getSignedUrl(key: StorageKey, expirationSeconds?: number): Promise<string>;

  /**
   * Delete an object from storage.
   *
   * @param key - Storage key of the object to delete
   */
  deleteObject(key: StorageKey): Promise<void>;

  /**
   * List objects under a given prefix.
   *
   * @param prefix - Key prefix to filter by
   * @returns Array of storage objects
   */
  listObjects(prefix: string): Promise<StorageObject[]>;
}
