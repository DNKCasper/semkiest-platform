"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinioProvider = void 0;
const Minio = __importStar(require("minio"));
const logger_js_1 = require("./utils/logger.js");
const retry_js_1 = require("./utils/retry.js");
const key_js_1 = require("./utils/key.js");
const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600;
const MAX_RETRY_ATTEMPTS = 3;
/**
 * MinIO storage provider implementation.
 * Designed for local development with Docker.
 */
class MinioProvider {
    client;
    bucket;
    logger;
    constructor(config) {
        this.bucket = config.bucket;
        this.logger = new logger_js_1.StorageLogger('MinioProvider');
        const endpointUrl = config.endpoint !== undefined ? new URL(config.endpoint) : undefined;
        this.client = new Minio.Client({
            endPoint: endpointUrl?.hostname ?? 'localhost',
            port: config.port ?? (endpointUrl?.port !== '' ? parseInt(endpointUrl?.port ?? '9000', 10) : 9000),
            useSSL: config.useSSL ?? false,
            accessKey: config.accessKeyId,
            secretKey: config.secretAccessKey,
        });
    }
    async uploadScreenshot(projectId, testRunId, testResultId, file) {
        const ext = (0, key_js_1.extensionFromMimeType)(file.mimeType);
        const filename = file.originalName ?? `${(0, key_js_1.generateUniqueId)()}.${ext}`;
        const key = (0, key_js_1.buildKey)(projectId, testRunId, testResultId, 'screenshots', filename);
        this.logger.info('Uploading screenshot', { key, size: file.size, mimeType: file.mimeType });
        await (0, retry_js_1.withRetry)(() => this.client.putObject(this.bucket, key, file.buffer, file.size, {
            'Content-Type': file.mimeType,
            'x-amz-meta-project-id': projectId,
            'x-amz-meta-test-run-id': testRunId,
            'x-amz-meta-test-result-id': testResultId,
        }), MAX_RETRY_ATTEMPTS);
        this.logger.info('Screenshot uploaded', { key });
        return key;
    }
    async uploadBaseline(projectId, name, file) {
        const key = (0, key_js_1.buildKey)(projectId, 'baselines', name);
        this.logger.info('Uploading baseline', { key, size: file.size, mimeType: file.mimeType });
        await (0, retry_js_1.withRetry)(() => this.client.putObject(this.bucket, key, file.buffer, file.size, {
            'Content-Type': file.mimeType,
            'x-amz-meta-project-id': projectId,
        }), MAX_RETRY_ATTEMPTS);
        this.logger.info('Baseline uploaded', { key });
        return key;
    }
    async uploadReport(testRunId, format, content) {
        const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
        const key = (0, key_js_1.buildKey)('reports', testRunId, format, `report-${(0, key_js_1.generateUniqueId)()}.${format}`);
        this.logger.info('Uploading report', { key, format, size: body.length });
        await (0, retry_js_1.withRetry)(() => this.client.putObject(this.bucket, key, body, body.length, {
            'Content-Type': formatToMimeType(format),
            'x-amz-meta-test-run-id': testRunId,
            'x-amz-meta-format': format,
        }), MAX_RETRY_ATTEMPTS);
        this.logger.info('Report uploaded', { key });
        return key;
    }
    async getSignedUrl(key, expirationSeconds = DEFAULT_PRESIGNED_EXPIRY_SECONDS) {
        this.logger.info('Generating presigned URL', { key, expirationSeconds });
        const url = await this.client.presignedGetObject(this.bucket, key, expirationSeconds);
        this.logger.info('Presigned URL generated', { key });
        return url;
    }
    async deleteObject(key) {
        this.logger.info('Deleting object', { key });
        await (0, retry_js_1.withRetry)(() => this.client.removeObject(this.bucket, key), MAX_RETRY_ATTEMPTS);
        this.logger.info('Object deleted', { key });
    }
    async listObjects(prefix) {
        this.logger.info('Listing objects', { prefix });
        return new Promise((resolve, reject) => {
            const objects = [];
            const stream = this.client.listObjects(this.bucket, prefix, true);
            stream.on('data', (item) => {
                if (item.name !== undefined) {
                    objects.push({
                        key: item.name,
                        size: item.size ?? 0,
                        lastModified: item.lastModified ?? new Date(0),
                        etag: item.etag,
                    });
                }
            });
            stream.on('error', (err) => {
                this.logger.error('Error listing objects', {
                    prefix,
                    error: err.message,
                });
                reject(err);
            });
            stream.on('end', () => {
                this.logger.info('Objects listed', { prefix, count: objects.length });
                resolve(objects);
            });
        });
    }
}
exports.MinioProvider = MinioProvider;
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
//# sourceMappingURL=minio-provider.js.map