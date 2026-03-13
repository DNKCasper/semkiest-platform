import type { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/jwt.js';
import type { AuthenticatedUser } from '../types/auth.js';

/**
 * Extracts and verifies a Bearer token from the Authorization header.
 * When a valid token is found, attaches the decoded user to `req.user`.
 * When no token is present, `req.user` remains `undefined`.
 *
 * Use this for routes where authentication is optional.
 *
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyAccessToken(token);
    const user: AuthenticatedUser = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.orgId,
    };
    req.user = user;
  } catch {
    // For optional auth, an invalid token is treated as no token.
  }

  next();
}

/**
 * Extracts and verifies a Bearer token from the Authorization header.
 * Attaches the decoded user to `req.user` on success.
 * Returns HTTP 401 if the token is absent, expired, or invalid.
 *
 * Use this for routes that require authentication.
 *
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header is required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyAccessToken(token);
    const user: AuthenticatedUser = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.orgId,
    };
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({ error: 'Access token has expired' });
      return;
    }
    if (err instanceof JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid access token' });
      return;
    }
    next(err);
  }
}
