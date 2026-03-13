"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Provider = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const logger_js_1 = require("./utils/logger.js");
const retry_js_1 = require("./utils/retry.js");
const key_js_1 = require("./utils/key.js");
const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600;
const MAX_RETRY_ATTEMPTS = 3;
/**
 * AWS S3 storage provider implementation.
 * Uses AWS SDK v3 with retry logic and structured logging.
 */
class S3Provider {
    client;
    bucket;
    logger;
    constructor(config) {
        this.bucket = config.bucket;
        this.logger = new logger_js_1.StorageLogger('S3Provider');
        this.client = new client_s3_1.S3Client({
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
    async uploadScreenshot(projectId, testRunId, testResultId, file) {
        const ext = (0, key_js_1.extensionFromMimeType)(file.mimeType);
        const filename = file.originalName ?? `${(0, key_js_1.generateUniqueId)()}.${ext}`;
        const key = (0, key_js_1.buildKey)(projectId, testRunId, testResultId, 'screenshots', filename);
        this.logger.info('Uploading screenshot', { key, size: file.size, mimeType: file.mimeType });
        await (0, retry_js_1.withRetry)(() => this.client.send(new client_s3_1.PutObjectCommand({
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
        })), MAX_RETRY_ATTEMPTS);
        this.logger.info('Screenshot uploaded', { key });
        return key;
    }
    async uploadBaseline(projectId, name, file) {
        const key = (0, key_js_1.buildKey)(projectId, 'baselines', name);
        this.logger.info('Uploading baseline', { key, size: file.size, mimeType: file.mimeType });
        await (0, retry_js_1.withRetry)(() => this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimeType,
            ContentLength: file.size,
            Metadata: { projectId },
        })), MAX_RETRY_ATTEMPTS);
        this.logger.info('Baseline uploaded', { key });
        return key;
    }
    async uploadReport(testRunId, format, content) {
        const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
        const mimeType = formatToMimeType(format);
        const key = (0, key_js_1.buildKey)('reports', testRunId, format, `report-${(0, key_js_1.generateUniqueId)()}.${format}`);
        this.logger.info('Uploading report', { key, format, size: body.length });
        await (0, retry_js_1.withRetry)(() => this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: mimeType,
            ContentLength: body.length,
            Metadata: { testRunId, format },
        })), MAX_RETRY_ATTEMPTS);
        this.logger.info('Report uploaded', { key });
        return key;
    }
    async getSignedUrl(key, expirationSeconds = DEFAULT_PRESIGNED_EXPIRY_SECONDS) {
        this.logger.info('Generating presigned URL', { key, expirationSeconds });
        const command = new client_s3_1.GetObjectCommand({ Bucket: this.bucket, Key: key });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn: expirationSeconds });
        this.logger.info('Presigned URL generated', { key });
        return url;
    }
    async deleteObject(key) {
        this.logger.info('Deleting object', { key });
        await (0, retry_js_1.withRetry)(() => this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: key })), MAX_RETRY_ATTEMPTS);
        this.logger.info('Object deleted', { key });
    }
    async listObjects(prefix) {
        this.logger.info('Listing objects', { prefix });
        const objects = [];
        let continuationToken;
        do {
            const response = await (0, retry_js_1.withRetry)(() => this.client.send(new client_s3_1.ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            })), MAX_RETRY_ATTEMPTS);
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
exports.S3Provider = S3Provider;
function formatToMimeType(format) {
    const map = {
        html: 'text/html',
        json: 'application/json',
        xml: 'application/xml',
        txt: 'text/plain',
        pdf: 'application/pdf',
    };
    return map[format] ?? 'application/octet-stream';
}
//# sourceMappingURL=s3-provider.js.map