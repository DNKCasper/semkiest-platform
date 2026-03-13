/**
 * Generates a unique storage key component using timestamp and random hex.
 */
export declare function generateUniqueId(): string;
/**
 * Builds a normalized storage key from path segments.
 * Removes leading/trailing slashes and joins with '/'.
 */
export declare function buildKey(...segments: string[]): string;
/**
 * Extracts a file extension from a MIME type.
 * Returns 'bin' as fallback for unknown types.
 */
export declare function extensionFromMimeType(mimeType: string): string;
//# sourceMappingURL=key.d.ts.map