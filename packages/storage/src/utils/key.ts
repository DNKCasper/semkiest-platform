/**
 * Generates a unique storage key component using timestamp and random hex.
 */
export function generateUniqueId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Builds a normalized storage key from path segments.
 * Removes leading/trailing slashes and joins with '/'.
 */
export function buildKey(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter((s) => s.length > 0)
    .join('/');
}

/**
 * Extracts a file extension from a MIME type.
 * Returns 'bin' as fallback for unknown types.
 */
export function extensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
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
