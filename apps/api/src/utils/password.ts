import bcrypt from 'bcryptjs';

/** Number of bcrypt salt rounds. Higher = slower but more secure. */
const SALT_ROUNDS = 12;

/** Maximum number of previous password hashes to retain for reuse prevention. */
const MAX_PREVIOUS_PASSWORDS = 5;

/**
 * Hashes a plaintext password using bcrypt with {@link SALT_ROUNDS} rounds.
 *
 * @param plaintext - The raw password string provided by the user.
 * @returns A promise that resolves to the bcrypt hash string.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 *
 * @param plaintext - The raw password string to check.
 * @param hash - The stored bcrypt hash to compare against.
 * @returns A promise that resolves to `true` if the password matches, `false` otherwise.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Checks whether a plaintext password matches any of the previously used password hashes.
 * Used to prevent users from reusing recent passwords.
 *
 * @param plaintext - The raw password string to check.
 * @param previousHashes - Array of historical bcrypt hashes (most recent first).
 * @returns A promise that resolves to `true` if the password was previously used.
 */
export async function isPasswordReused(
  plaintext: string,
  previousHashes: string[],
): Promise<boolean> {
  const checks = previousHashes.map((hash) => bcrypt.compare(plaintext, hash));
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

/**
 * Builds a new previous-passwords list after a password change.
 * Prepends the old (current) hash and trims to {@link MAX_PREVIOUS_PASSWORDS} entries.
 *
 * @param currentHash - The hash that is being replaced (i.e., the old password hash).
 * @param existingPreviousHashes - The user's current `previous_passwords` array from the DB.
 * @returns A new array of up to {@link MAX_PREVIOUS_PASSWORDS} hashes to store.
 */
export function buildPreviousPasswordsList(
  currentHash: string,
  existingPreviousHashes: string[],
): string[] {
  return [currentHash, ...existingPreviousHashes].slice(
    0,
    MAX_PREVIOUS_PASSWORDS,
  );
}
