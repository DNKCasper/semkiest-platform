import type { IStorageProvider } from './storage-provider.js';
import type { StorageFile, StorageKey, StorageObject, StorageProviderConfig } from './types.js';
/**
 * MinIO storage provider implementation.
 * Designed for local development with Docker.
 */
export declare class MinioProvider implements IStorageProvider {
    private readonly client;
    private readonly bucket;
    private readonly logger;
    constructor(config: StorageProviderConfig);
    uploadScreenshot(projectId: string, testRunId: string, testResultId: string, file: StorageFile): Promise<StorageKey>;
    uploadBaseline(projectId: string, name: string, file: StorageFile): Promise<StorageKey>;
    uploadReport(testRunId: string, format: string, content: Buffer | string): Promise<StorageKey>;
    getSignedUrl(key: StorageKey, expirationSeconds?: number): Promise<string>;
    deleteObject(key: StorageKey): Promise<void>;
    listObjects(prefix: string): Promise<StorageObject[]>;
}
//# sourceMappingURL=minio-provider.d.ts.map