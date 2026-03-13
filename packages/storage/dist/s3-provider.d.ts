import type { IStorageProvider } from './storage-provider.js';
import type { StorageFile, StorageKey, StorageObject, StorageProviderConfig } from './types.js';
/**
 * AWS S3 storage provider implementation.
 * Uses AWS SDK v3 with retry logic and structured logging.
 */
export declare class S3Provider implements IStorageProvider {
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
//# sourceMappingURL=s3-provider.d.ts.map