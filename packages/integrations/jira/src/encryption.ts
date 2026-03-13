import crypto from 'crypto';

/** AES-256-GCM encryption parameters. */
const ALGORITHM = 'aes-256-gcm' as const;
const KEY_LENGTH = 32; // 256-bit key
const IV_LENGTH = 12; // 96-bit IV (recommended for GCM)
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Encrypts a plain-text API token using AES-256-GCM.
 *
 * The returned string encodes (IV || authTag || ciphertext) as a single
 * hex string, so it can be stored safely in a database column without
 * additional serialisation.
 *
 * @param plaintext - The secret value to encrypt (e.g. a Jira API token).
 * @param key - 32-byte (256-bit) encryption key, hex-encoded.
 * @returns Hex-encoded string containing IV, auth tag, and ciphertext.
 *
 * @example
 * ```ts
 * const encrypted = encryptToken('my-jira-token', process.env.ENCRYPTION_KEY);
 * // Store `encrypted` in the database
 * ```
 */
export function encryptToken(plaintext: string, key: string): string {
  if (key.length !== KEY_LENGTH * 2) {
    throw new Error(
      `Encryption key must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH * 8}-bit key).`,
    );
  }

  const keyBuffer = Buffer.from(key, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Layout: [IV (12 bytes)] [authTag (16 bytes)] [ciphertext]
  return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

/**
 * Decrypts a token that was previously encrypted with {@link encryptToken}.
 *
 * @param encryptedHex - Hex-encoded string produced by `encryptToken`.
 * @param key - 32-byte (256-bit) encryption key, hex-encoded.
 * @returns The original plain-text value.
 *
 * @throws {Error} If the key is invalid or the ciphertext has been tampered with.
 *
 * @example
 * ```ts
 * const token = decryptToken(encryptedHex, process.env.ENCRYPTION_KEY);
 * ```
 */
export function decryptToken(encryptedHex: string, key: string): string {
  if (key.length !== KEY_LENGTH * 2) {
    throw new Error(
      `Encryption key must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH * 8}-bit key).`,
    );
  }

  const keyBuffer = Buffer.from(key, 'hex');
  const encryptedBuffer = Buffer.from(encryptedHex, 'hex');

  if (encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Encrypted data is too short to be valid.');
  }

  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Generates a cryptographically secure random 256-bit key suitable for use
 * with {@link encryptToken} and {@link decryptToken}.
 *
 * Store this key in a secret manager or environment variable.
 * NEVER commit this value to source control.
 *
 * @returns Hex-encoded 32-byte random key (64 hex characters).
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
