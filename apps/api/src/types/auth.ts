import type { UserRole } from '@sem/db';

/**
 * The payload encoded into a JWT access token.
 * Contains identity and authorization claims.
 */
export interface JwtAccessPayload {
  /** The user's unique identifier (cuid). */
  sub: string;
  /** The user's email address. */
  email: string;
  /** The user's role for authorization checks. */
  role: UserRole;
  /** The organization the user belongs to, if any. */
  orgId?: string;
}

/**
 * The payload encoded into a JWT refresh token.
 * Minimal payload - only subject is required for token rotation.
 */
export interface JwtRefreshPayload {
  /** The user's unique identifier (cuid). */
  sub: string;
}

/**
 * Decoded access token after JWT verification, including standard JWT claims.
 */
export interface DecodedAccessToken extends JwtAccessPayload {
  /** Issued-at timestamp (seconds since epoch). */
  iat: number;
  /** Expiry timestamp (seconds since epoch). */
  exp: number;
}

/**
 * Decoded refresh token after JWT verification, including standard JWT claims.
 */
export interface DecodedRefreshToken extends JwtRefreshPayload {
  /** Issued-at timestamp (seconds since epoch). */
  iat: number;
  /** Expiry timestamp (seconds since epoch). */
  exp: number;
}

/**
 * Represents a pair of access and refresh tokens returned to the client.
 */
export interface TokenPair {
  /** Short-lived access token (15 minutes). */
  accessToken: string;
  /** Long-lived refresh token (7 days). Used for token rotation. */
  refreshToken: string;
}

/**
 * The shape of the authenticated user attached to the Express request object.
 * Populated by the auth middleware after successful token verification.
 */
export interface AuthenticatedUser {
  /** The user's unique identifier. */
  id: string;
  /** The user's email address. */
  email: string;
  /** The user's role. */
  role: UserRole;
  /** The organization the user belongs to, if any. */
  orgId?: string;
}

/**
 * Extends the Express Request interface to include the authenticated user.
 */
declare global {
  namespace Express {
    interface Request {
      /** Set by auth middleware when a valid Bearer token is present. */
      user?: AuthenticatedUser;
    }
  }
}
