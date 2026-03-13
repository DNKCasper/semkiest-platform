"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinioProvider = exports.S3Provider = void 0;
exports.createStorageProvider = createStorageProvider;
exports.createStorageProviderFromEnv = createStorageProviderFromEnv;
const s3_provider_js_1 = require("./s3-provider.js");
const minio_provider_js_1 = require("./minio-provider.js");
/**
 * Creates a storage provider instance.
 *
 * @param type - Provider type ('s3' or 'minio'). Defaults to the S3_PROVIDER env var or 's3'.
 * @param config - Provider configuration
 * @returns Configured storage provider
 *
 * @example
 * ```typescript
 * const storage = createStorageProvider('minio', {
 *   bucket: 'test-artifacts',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   endpoint: 'http://localhost:9000',
 * });
 * ```
 */
function createStorageProvider(type, config) {
    const resolvedType = type ?? process.env['S3_PROVIDER'] ?? 's3';
    switch (resolvedType) {
        case 'minio':
            return new minio_provider_js_1.MinioProvider(config);
        case 's3':
            return new s3_provider_js_1.S3Provider(config);
        default: {
            const exhaustive = resolvedType;
            throw new Error(`Unknown storage provider type: ${String(exhaustive)}`);
        }
    }
}
/**
 * Creates a storage provider from environment variables.
 * Reads: S3_PROVIDER, S3_BUCKET, AWS_REGION, S3_ENDPOINT,
 *        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *        MINIO_USE_SSL, MINIO_PORT
 *
 * @throws If required environment variables are missing
 */
function createStorageProviderFromEnv() {
    const bucket = requireEnv('S3_BUCKET');
    const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
    const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');
    const providerType = process.env['S3_PROVIDER'] ?? 's3';
    const config = {
        bucket,
        accessKeyId,
        secretAccessKey,
        region: process.env['AWS_REGION'],
        endpoint: process.env['S3_ENDPOINT'],
        useSSL: process.env['MINIO_USE_SSL'] !== 'false',
        port: process.env['MINIO_PORT'] !== undefined ? parseInt(process.env['MINIO_PORT'], 10) : undefined,
        forcePathStyle: process.env['S3_FORCE_PATH_STYLE'] === 'true',
    };
    return createStorageProvider(providerType, config);
}
function requireEnv(name) {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`Required environment variable "${name}" is not set`);
    }
    return value;
}
var s3_provider_js_2 = require("./s3-provider.js");
Object.defineProperty(exports, "S3Provider", { enumerable: true, get: function () { return s3_provider_js_2.S3Provider; } });
var minio_provider_js_2 = require("./minio-provider.js");
Object.defineProperty(exports, "MinioProvider", { enumerable: true, get: function () { return minio_provider_js_2.MinioProvider; } });
//# sourceMappingURL=index.js.map