import { encryptToken, decryptToken } from './encryption';

const KEY = 'test-encryption-key-32-chars-min!!';
const TOKEN = '1/abc123:xyz789secretasanatoken';

describe('encryptToken', () => {
  it('returns a colon-separated hex string with 4 parts', () => {
    const encrypted = encryptToken(TOKEN, KEY);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    parts.forEach((p) => expect(p).toMatch(/^[0-9a-f]+$/));
  });

  it('produces a different ciphertext on each call (random IV + salt)', () => {
    const a = encryptToken(TOKEN, KEY);
    const b = encryptToken(TOKEN, KEY);
    expect(a).not.toBe(b);
  });
});

describe('decryptToken', () => {
  it('round-trips the original token', () => {
    const encrypted = encryptToken(TOKEN, KEY);
    expect(decryptToken(encrypted, KEY)).toBe(TOKEN);
  });

  it('throws when given wrong key', () => {
    const encrypted = encryptToken(TOKEN, KEY);
    expect(() => decryptToken(encrypted, 'wrong-key-that-is-also-32-chars!!')).toThrow();
  });

  it('throws when format is invalid (missing parts)', () => {
    expect(() => decryptToken('bad:format', KEY)).toThrow(
      /Invalid encrypted token format/,
    );
  });

  it('throws when ciphertext is tampered with', () => {
    const encrypted = encryptToken(TOKEN, KEY);
    const parts = encrypted.split(':');
    // Flip one character in the ciphertext segment.
    const lastHex = parts[3]!;
    const tampered =
      lastHex.slice(0, -1) + (lastHex.endsWith('0') ? '1' : '0');
    const tamperedEncrypted = [...parts.slice(0, 3), tampered].join(':');
    expect(() => decryptToken(tamperedEncrypted, KEY)).toThrow();
  });
});
