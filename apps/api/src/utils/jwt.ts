import jwt from 'jsonwebtoken';
import type {
  DecodedAccessToken,
  DecodedRefreshToken,
  JwtAccessPayload,
  JwtRefreshPayload,
  TokenPair,
} from '../types/auth.js';

/** Access token validity window. */
const ACCESS_TOKEN_EXPIRY = '15m';

/** Refresh token validity window. */
const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * Retrieves the JWT access token secret from the environment.
 *
 * @throws {Error} When JWT_ACCESS_SECRET is not set.
 */
function getAccessSecret(): string {
  const secret = process.env['JWT_ACCESS_SECRET'];
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Retrieves the JWT refresh token secret from the environment.
 *
 * @throws {Error} When JWT_REFRESH_SECRET is not set.
 */
function getRefreshSecret(): string {
  const secret = process.env['JWT_REFRESH_SECRET'];
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Generates a signed JWT access token valid for 15 minutes.
 *
 * @param payload - The claims to embed in the token.
 * @returns A signed JWT string.
 */
export function generateAccessToken(payload: JwtAccessPayload): string {
  const { sub, email, role, orgId } = payload;
  const claims: Record<string, unknown> = { email, role };
  if (orgId !== undefined) {
    claims['orgId'] = orgId;
  }
  return jwt.sign(claims, getAccessSecret(), {
    subject: sub,
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
}

/**
 * Generates a signed JWT refresh token valid for 7 days.
 *
 * @param payload - The minimal claims to embed in the refresh token.
 * @returns A signed JWT string.
 */
export function generateRefreshToken(payload: JwtRefreshPayload): string {
  return jwt.sign({}, getRefreshSecret(), {
    subject: payload.sub,
    expiresIn: REFRESH_TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
}

/**
 * Generates both an access token and a refresh token for the given user.
 *
 * @param payload - The access token claims (refresh token uses only `sub`).
 * @returns A {@link TokenPair} containing both tokens.
 */
export function generateTokenPair(payload: JwtAccessPayload): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken({ sub: payload.sub }),
  };
}

/**
 * Verifies and decodes a JWT access token.
 *
 * @param token - The raw JWT string from the Authorization header.
 * @returns The decoded token payload.
 * @throws {jwt.JsonWebTokenError} When the token is invalid or tampered with.
 * @throws {jwt.TokenExpiredError} When the token has expired.
 */
export function verifyAccessToken(token: string): DecodedAccessToken {
  const decoded = jwt.verify(token, getAccessSecret(), {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

  return {
    sub: decoded['sub'] as string,
    email: decoded['email'] as string,
    role: decoded['role'] as DecodedAccessToken['role'],
    orgId: decoded['orgId'] as string | undefined,
    iat: decoded['iat'] as number,
    exp: decoded['exp'] as number,
  };
}

/**
 * Verifies and decodes a JWT refresh token.
 *
 * @param token - The raw JWT refresh token string.
 * @returns The decoded refresh token payload.
 * @throws {jwt.JsonWebTokenError} When the token is invalid or tampered with.
 * @throws {jwt.TokenExpiredError} When the token has expired.
 */
export function verifyRefreshToken(token: string): DecodedRefreshToken {
  const decoded = jwt.verify(token, getRefreshSecret(), {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

  return {
    sub: decoded['sub'] as string,
    iat: decoded['iat'] as number,
    exp: decoded['exp'] as number,
  };
}
