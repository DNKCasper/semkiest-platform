import {
  hashPassword,
  verifyPassword,
  isPasswordReused,
  buildPreviousPasswordsList,
} from './password.js';

describe('hashPassword', () => {
  it('returns a bcrypt hash starting with $2', async () => {
    const hash = await hashPassword('Test@1234567890');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const hash1 = await hashPassword('Test@1234567890');
    const hash2 = await hashPassword('Test@1234567890');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const password = 'Correct@1234567890';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('Correct@1234567890');
    expect(await verifyPassword('Wrong@1234567890', hash)).toBe(false);
  });
});

describe('isPasswordReused', () => {
  it('returns true when the password matches a previous hash', async () => {
    const password = 'OldPass@123456789';
    const hash = await hashPassword(password);
    expect(await isPasswordReused(password, [hash])).toBe(true);
  });

  it('returns false when the password does not match any previous hash', async () => {
    const oldHash = await hashPassword('OldPass@123456789');
    expect(await isPasswordReused('NewPass@123456789', [oldHash])).toBe(false);
  });

  it('returns false for an empty history', async () => {
    expect(await isPasswordReused('AnyPass@123456789', [])).toBe(false);
  });
});

describe('buildPreviousPasswordsList', () => {
  it('prepends the current hash to the existing list', () => {
    const result = buildPreviousPasswordsList('hashA', ['hashB', 'hashC']);
    expect(result[0]).toBe('hashA');
    expect(result).toEqual(['hashA', 'hashB', 'hashC']);
  });

  it('trims to a maximum of 5 entries', () => {
    const existing = ['h1', 'h2', 'h3', 'h4', 'h5'];
    const result = buildPreviousPasswordsList('h0', existing);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('h0');
    expect(result).not.toContain('h5');
  });

  it('works with an empty existing list', () => {
    const result = buildPreviousPasswordsList('hashA', []);
    expect(result).toEqual(['hashA']);
  });
});
