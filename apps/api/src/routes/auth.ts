import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { prisma } from '@sem/db';
import {
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
  LogoutSchema,
} from '../schemas/auth.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import {
  storeRefreshToken,
  getRefreshTokenUserId,
  deleteRefreshToken,
} from '../utils/redis.js';

export const authRouter = Router();

/**
 * POST /api/v1/auth/register
 *
 * Creates a new user account with a hashed password.
 * Returns the created user (without sensitive fields) and a token pair.
 */
authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let input;
      try {
        input = RegisterSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          res
            .status(400)
            .json({ error: 'Validation failed', details: err.errors });
          return;
        }
        throw err;
      }

      const { email, password, role, orgId } = input;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res
          .status(409)
          .json({ error: 'A user with that email already exists' });
        return;
      }

      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          email,
          password_hash: passwordHash,
          role,
          org_id: orgId,
          previous_passwords: [],
        },
        select: {
          id: true,
          email: true,
          role: true,
          org_id: true,
          created_at: true,
        },
      });

      const tokens = generateTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
        orgId: user.org_id ?? undefined,
      });

      await storeRefreshToken(tokens.refreshToken, user.id);

      res.status(201).json({ user, ...tokens });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/login
 *
 * Validates user credentials and returns a new access/refresh token pair.
 */
authRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let input;
      try {
        input = LoginSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          res
            .status(400)
            .json({ error: 'Validation failed', details: err.errors });
          return;
        }
        throw err;
      }

      const { email, password } = input;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password_hash: true,
          role: true,
          org_id: true,
        },
      });

      // Use a constant-time-equivalent response to prevent user enumeration.
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const passwordValid = await verifyPassword(password, user.password_hash);
      if (!passwordValid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const tokens = generateTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
        orgId: user.org_id ?? undefined,
      });

      await storeRefreshToken(tokens.refreshToken, user.id);

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          orgId: user.org_id,
        },
        ...tokens,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/refresh
 *
 * Exchanges a valid refresh token for a new access token and rotated refresh token.
 * The old refresh token is invalidated in Redis immediately (token rotation).
 */
authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let input;
      try {
        input = RefreshSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          res
            .status(400)
            .json({ error: 'Validation failed', details: err.errors });
          return;
        }
        throw err;
      }

      const { refreshToken } = input;

      // Verify JWT signature and expiry first.
      let decoded;
      try {
        decoded = verifyRefreshToken(refreshToken);
      } catch {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
        return;
      }

      // Confirm the token exists in Redis (not rotated/revoked).
      const storedUserId = await getRefreshTokenUserId(refreshToken);
      if (!storedUserId || storedUserId !== decoded.sub) {
        res.status(401).json({ error: 'Refresh token has been revoked' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          email: true,
          role: true,
          org_id: true,
        },
      });

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Rotate: invalidate old token and issue new pair.
      await deleteRefreshToken(refreshToken);

      const newAccessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        orgId: user.org_id ?? undefined,
      });
      const newRefreshToken = generateRefreshToken({ sub: user.id });

      await storeRefreshToken(newRefreshToken, user.id);

      res.status(200).json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout
 *
 * Invalidates the provided refresh token in Redis.
 * The access token will expire naturally after its 15-minute window.
 */
authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let input;
      try {
        input = LogoutSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          res
            .status(400)
            .json({ error: 'Validation failed', details: err.errors });
          return;
        }
        throw err;
      }

      const { refreshToken } = input;

      // Best-effort deletion — even if the token is already gone, respond with success.
      await deleteRefreshToken(refreshToken);

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  },
);

