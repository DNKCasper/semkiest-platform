import { RegisterSchema, LoginSchema, RefreshSchema, LogoutSchema } from './auth.js';

describe('RegisterSchema', () => {
  const valid = {
    email: 'user@example.com',
    password: 'SecurePass@123',
  };

  it('accepts a valid registration payload', () => {
    const result = RegisterSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('defaults role to "viewer"', () => {
    const result = RegisterSchema.safeParse(valid);
    expect(result.success && result.data.role).toBe('viewer');
  });

  it('accepts explicit roles', () => {
    for (const role of ['admin', 'manager', 'viewer'] as const) {
      const result = RegisterSchema.safeParse({ ...valid, role });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid email', () => {
    const result = RegisterSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 12 characters', () => {
    const result = RegisterSchema.safeParse({ ...valid, password: 'Short@1' });
    expect(result.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const result = RegisterSchema.safeParse({ ...valid, password: 'nouppercase@123' });
    expect(result.success).toBe(false);
  });

  it('rejects password without lowercase', () => {
    const result = RegisterSchema.safeParse({ ...valid, password: 'NOLOWERCASE@123' });
    expect(result.success).toBe(false);
  });

  it('rejects password without digit', () => {
    const result = RegisterSchema.safeParse({ ...valid, password: 'NoDigitsHere@@@' });
    expect(result.success).toBe(false);
  });

  it('rejects password without special character', () => {
    const result = RegisterSchema.safeParse({ ...valid, password: 'NoSpecialChar123' });
    expect(result.success).toBe(false);
  });
});

describe('LoginSchema', () => {
  it('accepts valid login payload', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: 'anypassword' });
    expect(result.success).toBe(true);
  });

  it('rejects empty password', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('RefreshSchema', () => {
  it('accepts a valid refresh token', () => {
    const result = RefreshSchema.safeParse({ refreshToken: 'some.jwt.token' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty refresh token', () => {
    const result = RefreshSchema.safeParse({ refreshToken: '' });
    expect(result.success).toBe(false);
  });
});

describe('LogoutSchema', () => {
  it('accepts a valid refresh token', () => {
    const result = LogoutSchema.safeParse({ refreshToken: 'some.jwt.token' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty refresh token', () => {
    const result = LogoutSchema.safeParse({ refreshToken: '' });
    expect(result.success).toBe(false);
  });
});
