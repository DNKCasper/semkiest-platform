"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueId = generateUniqueId;
exports.buildKey = buildKey;
exports.extensionFromMimeType = extensionFromMimeType;
/**
 * Generates a unique storage key component using timestamp and random hex.
 */
function generateUniqueId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${timestamp}-${random}`;
}
/**
 * Builds a normalized storage key from path segments.
 * Removes leading/trailing slashes and joins with '/'.
 */
function buildKey(...segments) {
    return segments
        .map((s) => s.replace(/^\/+|\/+$/g, ''))
        .filter((s) => s.length > 0)
        .join('/');
}
/**
 * Extracts a file extension from a MIME type.
 * Returns 'bin' as fallback for unknown types.
 */
function extensionFromMimeType(mimeType) {
    const mimeToExt = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'text/html': 'html',
        'application/json': 'json',
        'application/xml': 'xml',
        'text/xml': 'xml',
        'text/plain': 'txt',
        'application/pdf': 'pdf',
    };
    return mimeToExt[mimeType] ?? 'bin';
}
//# sourceMappingURL=key.js.map