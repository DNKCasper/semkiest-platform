import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * AES-256-GCM encryption for Asana personal access tokens stored in the database.
 *
 * Stored format (hex-encoded, colon-separated):
 *   `<salt>:<iv>:<authTag>:<ciphertext>`
 */

const ALGORITHM = 'aes-256-gcm' as const;
const KEY_BYTES = 32;
const IV_BYTES = 16;
const SALT_BYTES = 32;

/**
 * Encrypts a plaintext token using AES-256-GCM.
 *
 * @param token - The plaintext Asana personal access token.
 * @param encryptionKey - A secret key (e.g. from an environment variable).
 * @returns A hex-encoded, colon-separated string suitable for database storage.
 */
export function encryptToken(token: string, encryptionKey: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(encryptionKey, salt, KEY_BYTES);
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a token previously encrypted with {@link encryptToken}.
 *
 * @param encryptedToken - The stored hex-encoded token string.
 * @param encryptionKey - The same secret key used during encryption.
 * @returns The original plaintext Asana personal access token.
 * @throws If the format is invalid or authentication fails (tampered data).
 */
export function decryptToken(
  encryptedToken: string,
  encryptionKey: string,
): string {
  const parts = encryptedToken.split(':');
  if (parts.length !== 4) {
    throw new Error(
      'Invalid encrypted token format. Expected salt:iv:authTag:ciphertext.',
    );
  }

  const [saltHex, ivHex, authTagHex, encryptedHex] = parts as [
    string,
    string,
    string,
    string,
  ];

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const key = scryptSync(encryptionKey, salt, KEY_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
