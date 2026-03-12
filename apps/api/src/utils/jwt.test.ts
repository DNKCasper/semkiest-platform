import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt.js';

const ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32chars';
const REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32chars';

beforeEach(() => {
  process.env['JWT_ACCESS_SECRET'] = ACCESS_SECRET;
  process.env['JWT_REFRESH_SECRET'] = REFRESH_SECRET;
});

afterEach(() => {
  delete process.env['JWT_ACCESS_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

describe('generateAccessToken', () => {
  it('generates a verifiable JWT with correct claims', () => {
    const payload = { sub: 'user-123', email: 'test@example.com', role: 'viewer' as const };
    const token = generateAccessToken(payload);
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;

    expect(decoded['sub']).toBe('user-123');
    expect(decoded['email']).toBe('test@example.com');
    expect(decoded['role']).toBe('viewer');
  });

  it('includes orgId in claims when provided', () => {
    const payload = { sub: 'user-456', email: 'org@example.com', role: 'admin' as const, orgId: 'org-789' };
    const token = generateAccessToken(payload);
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;

    expect(decoded['orgId']).toBe('org-789');
  });

  it('omits orgId from claims when not provided', () => {
    const payload = { sub: 'user-789', email: 'no-org@example.com', role: 'manager' as const };
    const token = generateAccessToken(payload);
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;

    expect(decoded['orgId']).toBeUndefined();
  });

  it('throws when JWT_ACCESS_SECRET is not set', () => {
    delete process.env['JWT_ACCESS_SECRET'];
    expect(() =>
      generateAccessToken({ sub: 'x', email: 'x@x.com', role: 'viewer' as const }),
    ).toThrow('JWT_ACCESS_SECRET environment variable is not set');
  });
});

describe('generateRefreshToken', () => {
  it('generates a verifiable refresh JWT with subject', () => {
    const token = generateRefreshToken({ sub: 'user-123' });
    const decoded = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload;

    expect(decoded['sub']).toBe('user-123');
  });

  it('throws when JWT_REFRESH_SECRET is not set', () => {
    delete process.env['JWT_REFRESH_SECRET'];
    expect(() => generateRefreshToken({ sub: 'x' })).toThrow(
      'JWT_REFRESH_SECRET environment variable is not set',
    );
  });
});

describe('generateTokenPair', () => {
  it('returns both accessToken and refreshToken', () => {
    const pair = generateTokenPair({ sub: 'user-1', email: 'a@b.com', role: 'viewer' as const });
    expect(pair).toHaveProperty('accessToken');
    expect(pair).toHaveProperty('refreshToken');
    expect(typeof pair.accessToken).toBe('string');
    expect(typeof pair.refreshToken).toBe('string');
  });
});

describe('verifyAccessToken', () => {
  it('returns decoded payload for a valid token', () => {
    const payload = { sub: 'user-xyz', email: 'verify@test.com', role: 'admin' as const };
    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe('user-xyz');
    expect(decoded.email).toBe('verify@test.com');
    expect(decoded.role).toBe('admin');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('throws for a token signed with wrong secret', () => {
    const forged = jwt.sign({ email: 'x@x.com', role: 'viewer' }, 'wrong-secret', { subject: 'u1' });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('throws for an expired token', () => {
    const expired = jwt.sign({ email: 'x@x.com', role: 'viewer' }, ACCESS_SECRET, {
      subject: 'u1',
      expiresIn: -1,
    });
    expect(() => verifyAccessToken(expired)).toThrow(jwt.TokenExpiredError);
  });
});

describe('verifyRefreshToken', () => {
  it('returns decoded payload for a valid refresh token', () => {
    const token = generateRefreshToken({ sub: 'user-abc' });
    const decoded = verifyRefreshToken(token);

    expect(decoded.sub).toBe('user-abc');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('throws for a token signed with wrong secret', () => {
    const forged = jwt.sign({}, 'wrong-secret', { subject: 'u1' });
    expect(() => verifyRefreshToken(forged)).toThrow();
  });
});
