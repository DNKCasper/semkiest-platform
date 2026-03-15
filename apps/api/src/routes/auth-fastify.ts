import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { ZodError } from 'zod';
import {
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
  LogoutSchema,
} from '../schemas/auth.js';
import {
  hashPassword,
  verifyPassword,
  isPasswordReused,
  buildPreviousPasswordsList,
} from '../utils/password.js';
import {
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../utils/jwt.js';

// ---------------------------------------------------------------------------
// Redis-backed refresh token store (falls back to in-memory if REDIS_URL unset)
// ---------------------------------------------------------------------------
let redisAvailable = false;
let redisStoreRefreshToken: (token: string, userId: string) => Promise<void>;
let redisGetRefreshTokenUserId: (token: string) => Promise<string | null>;
let redisDeleteRefreshToken: (token: string) => Promise<void>;

// In-memory fallback stores
const memRefreshTokens = new Map<string, { userId: string; expiresAt: number }>();
const memVerificationTokens = new Map<string, { userId: string; expiresAt: number }>();
const memResetTokens = new Map<string, { userId: string; expiresAt: number }>();

// Clean up expired in-memory tokens every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memRefreshTokens) {
    if (data.expiresAt < now) memRefreshTokens.delete(key);
  }
  for (const [key, data] of memVerificationTokens) {
    if (data.expiresAt < now) memVerificationTokens.delete(key);
  }
  for (const [key, data] of memResetTokens) {
    if (data.expiresAt < now) memResetTokens.delete(key);
  }
}, 60_000);

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VERIFY_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_EXPIRY_MS = 1 * 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Refresh token helpers (Redis with in-memory fallback)
// ---------------------------------------------------------------------------
async function storeRefreshToken(token: string, userId: string): Promise<void> {
  if (redisAvailable) {
    return redisStoreRefreshToken(token, userId);
  }
  memRefreshTokens.set(token, { userId, expiresAt: Date.now() + REFRESH_EXPIRY_MS });
}

async function getRefreshTokenUserId(token: string): Promise<string | null> {
  if (redisAvailable) {
    return redisGetRefreshTokenUserId(token);
  }
  const entry = memRefreshTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    memRefreshTokens.delete(token);
    return null;
  }
  return entry.userId;
}

async function deleteRefreshToken(token: string): Promise<void> {
  if (redisAvailable) {
    return redisDeleteRefreshToken(token);
  }
  memRefreshTokens.delete(token);
}

// ---------------------------------------------------------------------------
// Email verification token helpers
// ---------------------------------------------------------------------------
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function storeVerificationToken(token: string, userId: string): Promise<void> {
  memVerificationTokens.set(token, { userId, expiresAt: Date.now() + VERIFY_TOKEN_EXPIRY_MS });
}

async function getVerificationTokenUserId(token: string): Promise<string | null> {
  const entry = memVerificationTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    memVerificationTokens.delete(token);
    return null;
  }
  return entry.userId;
}

async function deleteVerificationToken(token: string): Promise<void> {
  memVerificationTokens.delete(token);
}

// ---------------------------------------------------------------------------
// Password reset token helpers
// ---------------------------------------------------------------------------
async function storeResetToken(token: string, userId: string): Promise<void> {
  memResetTokens.set(token, { userId, expiresAt: Date.now() + RESET_TOKEN_EXPIRY_MS });
}

async function getResetTokenUserId(token: string): Promise<string | null> {
  const entry = memResetTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    memResetTokens.delete(token);
    return null;
  }
  return entry.userId;
}

async function deleteResetToken(token: string): Promise<void> {
  memResetTokens.delete(token);
}

// ---------------------------------------------------------------------------
// User formatting helper
// ---------------------------------------------------------------------------
function formatUser(u: {
  id: string;
  email: string;
  name?: string | null;
  bio?: string | null;
  role: string;
  emailVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    name: u.name || u.email.split('@')[0]?.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'User',
    email: u.email,
    bio: u.bio || undefined,
    role: u.role.toLowerCase(),
    emailVerified: u.emailVerified ?? false,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Email sending placeholder (logs to console until SES/SMTP is configured)
// ---------------------------------------------------------------------------
async function sendVerificationEmail(email: string, token: string, baseUrl: string): Promise<void> {
  const verifyUrl = `${baseUrl}/auth/verify-email?token=${token}`;
  // TODO: Replace with SES/SMTP integration
  console.log(`[EMAIL] Verification email for ${email}: ${verifyUrl}`);
}

async function sendPasswordResetEmail(email: string, token: string, baseUrl: string): Promise<void> {
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
  // TODO: Replace with SES/SMTP integration
  console.log(`[EMAIL] Password reset email for ${email}: ${resetUrl}`);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export async function authRoutes(server: FastifyInstance): Promise<void> {
  // Attempt to import Prisma client
  let prisma: any;
  try {
    const dbModule = await import('@semkiest/db');
    prisma = dbModule.prisma || dbModule.default?.prisma;
  } catch {
    try {
      const dbModule = await import('@sem/database');
      prisma = dbModule.prisma || dbModule.default?.prisma;
    } catch {
      try {
        const dbModule = await import('@sem/db');
        prisma = dbModule.prisma || dbModule.default?.prisma;
      } catch {
        server.log.warn('Could not import Prisma client - auth routes will return errors');
      }
    }
  }

  // Attempt to connect Redis for refresh token storage
  try {
    const redisModule = await import('../utils/redis.js');
    redisStoreRefreshToken = redisModule.storeRefreshToken;
    redisGetRefreshTokenUserId = redisModule.getRefreshTokenUserId;
    redisDeleteRefreshToken = redisModule.deleteRefreshToken;
    // Test connection
    redisModule.getRedisClient();
    redisAvailable = true;
    server.log.info('Redis connected - using Redis for refresh token storage');
  } catch {
    server.log.warn('Redis not available - using in-memory refresh token store (not suitable for production)');
  }

  // =========================================================================
  // POST /register
  // =========================================================================
  server.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    let parsed;
    try {
      parsed = RegisterSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ message: 'Validation failed', details: err.errors });
      }
      throw err;
    }

    const { email, password, name, role, orgId } = parsed;

    try {
      // Check for existing user
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return reply.status(409).send({ message: 'A user with that email already exists' });

      // Ensure a default organization exists
      let org: any;
      if (orgId) {
        org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) return reply.status(400).send({ message: 'Organization not found' });
      } else {
        org = await prisma.organization.findFirst({ where: { name: 'Default' } });
        if (!org) org = await prisma.organization.create({ data: { name: 'Default' } });
      }

      // Hash password using SEM-42 utility (12 rounds bcrypt)
      const passwordHash = await hashPassword(password);

      // Create user with all required fields
      const user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          passwordHash,
          role: (role || 'viewer').toUpperCase(),
          orgId: org.id,
          previousPasswords: [],
          emailVerified: false,
        },
      });

      // Generate email verification token
      const verificationToken = generateSecureToken();
      await storeVerificationToken(verificationToken, user.id);

      // Send verification email (logs to console until SES is configured)
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await sendVerificationEmail(email, verificationToken, frontendUrl);

      // Generate token pair using SEM-42 JWT utilities
      const tokens = generateTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      });

      // Store refresh token
      await storeRefreshToken(tokens.refreshToken, user.id);

      const expiresAt = Date.now() + 15 * 60 * 1000;

      return reply.status(201).send({
        user: formatUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt,
        },
        message: 'Account created. Please check your email to verify your address.',
      });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: err.message || 'Registration failed' });
    }
  });

  // =========================================================================
  // POST /login
  // =========================================================================
  server.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    let parsed;
    try {
      parsed = LoginSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ message: 'Validation failed', details: err.errors });
      }
      throw err;
    }

    const { email, password } = parsed;

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return reply.status(401).send({ message: 'Invalid email or password' });

      // Verify password using SEM-42 utility (constant-time bcrypt compare)
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return reply.status(401).send({ message: 'Invalid email or password' });

      // Update last login timestamp
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }).catch(() => { /* best effort */ });

      // Generate token pair
      const tokens = generateTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      });

      await storeRefreshToken(tokens.refreshToken, user.id);

      const expiresAt = Date.now() + 15 * 60 * 1000;

      return reply.status(200).send({
        user: formatUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt,
        },
      });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: err.message || 'Login failed' });
    }
  });

  // =========================================================================
  // POST /refresh
  // =========================================================================
  server.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    let parsed;
    try {
      parsed = RefreshSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ message: 'Validation failed' });
      }
      throw err;
    }

    const { refreshToken } = parsed;

    try {
      // Verify JWT signature and expiry
      const decoded = verifyRefreshToken(refreshToken);

      // Confirm the token exists in store (not rotated/revoked)
      const storedUserId = await getRefreshTokenUserId(refreshToken);
      if (!storedUserId || storedUserId !== decoded.sub) {
        return reply.status(401).send({ message: 'Invalid or expired refresh token' });
      }

      // Rotate: invalidate old token
      await deleteRefreshToken(refreshToken);

      let user: any = null;
      if (prisma) user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) return reply.status(401).send({ message: 'User not found' });

      // Issue new token pair
      const newAccessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      });
      const newRefreshToken = generateRefreshToken({ sub: user.id });
      await storeRefreshToken(newRefreshToken, user.id);

      const expiresAt = Date.now() + 15 * 60 * 1000;

      return reply.status(200).send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt,
      });
    } catch {
      return reply.status(401).send({ message: 'Invalid or expired refresh token' });
    }
  });

  // =========================================================================
  // POST /logout
  // =========================================================================
  server.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      if (body?.refreshToken) {
        await deleteRefreshToken(body.refreshToken);
      }
    } catch { /* best effort */ }
    return reply.status(200).send({ message: 'Logged out successfully' });
  });

  // =========================================================================
  // GET /me
  // =========================================================================
  server.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing authorization token' });
    }

    try {
      const token = authHeader.slice(7);
      const decoded = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) return reply.status(401).send({ message: 'User not found' });
      return reply.status(200).send(formatUser(user));
    } catch {
      return reply.status(401).send({ message: 'Invalid or expired token' });
    }
  });

  // =========================================================================
  // POST /verify-email
  // =========================================================================
  server.post('/verify-email', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const { token } = (request.body as any) || {};
    if (!token || typeof token !== 'string') {
      return reply.status(400).send({ message: 'Verification token is required' });
    }

    try {
      const userId = await getVerificationTokenUserId(token);
      if (!userId) {
        return reply.status(400).send({ message: 'Invalid or expired verification token' });
      }

      // Mark email as verified
      await prisma.user.update({
        where: { id: userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      // Consume the token
      await deleteVerificationToken(token);

      return reply.status(200).send({ message: 'Email verified successfully' });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Email verification failed' });
    }
  });

  // =========================================================================
  // GET /verify-email (for link clicks from email)
  // =========================================================================
  server.get('/verify-email', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const { token } = request.query as any;
    if (!token || typeof token !== 'string') {
      return reply.status(400).send({ message: 'Verification token is required' });
    }

    try {
      const userId = await getVerificationTokenUserId(token);
      if (!userId) {
        return reply.status(400).send({ message: 'Invalid or expired verification token' });
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      await deleteVerificationToken(token);

      // Redirect to login page after successful verification
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return reply.redirect(`${frontendUrl}/auth/login?verified=true`);
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Email verification failed' });
    }
  });

  // =========================================================================
  // POST /resend-verification
  // =========================================================================
  server.post('/resend-verification', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const { email } = (request.body as any) || {};
    if (!email || typeof email !== 'string') {
      return reply.status(400).send({ message: 'Email is required' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      // Always return success to prevent user enumeration
      if (!user || user.emailVerified) {
        return reply.status(200).send({ message: 'If that email exists and is unverified, a verification link has been sent.' });
      }

      const verificationToken = generateSecureToken();
      await storeVerificationToken(verificationToken, user.id);

      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await sendVerificationEmail(email, verificationToken, frontendUrl);

      return reply.status(200).send({ message: 'If that email exists and is unverified, a verification link has been sent.' });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Failed to resend verification email' });
    }
  });

  // =========================================================================
  // POST /forgot-password
  // =========================================================================
  server.post('/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const { email } = (request.body as any) || {};
    if (!email || typeof email !== 'string') {
      // Return success regardless to prevent enumeration
      return reply.status(200).send({ message: 'If that email exists, a reset link has been sent.' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      // Always return success to prevent user enumeration
      if (user) {
        const resetToken = generateSecureToken();
        await storeResetToken(resetToken, user.id);

        const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        await sendPasswordResetEmail(email, resetToken, frontendUrl);
      }

      return reply.status(200).send({ message: 'If that email exists, a reset link has been sent.' });
    } catch (err: any) {
      server.log.error(err);
      // Still return success to prevent enumeration even on error
      return reply.status(200).send({ message: 'If that email exists, a reset link has been sent.' });
    }
  });

  // =========================================================================
  // POST /reset-password
  // =========================================================================
  server.post('/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const { token, password, confirmPassword } = (request.body as any) || {};
    if (!token || typeof token !== 'string') {
      return reply.status(400).send({ message: 'Reset token is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 12) {
      return reply.status(400).send({ message: 'Password must be at least 12 characters long' });
    }
    if (confirmPassword && password !== confirmPassword) {
      return reply.status(400).send({ message: 'Passwords do not match' });
    }

    try {
      const userId = await getResetTokenUserId(token);
      if (!userId) {
        return reply.status(400).send({ message: 'Invalid or expired reset token' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(400).send({ message: 'User not found' });
      }

      // Check password reuse (SEM-42: prevent reusing last 5 passwords)
      const previousHashes = user.previousPasswords || [];
      const reused = await isPasswordReused(password, [user.passwordHash, ...previousHashes]);
      if (reused) {
        return reply.status(400).send({
          message: 'This password has been used recently. Please choose a different password.',
        });
      }

      // Hash new password and update previous passwords list
      const newPasswordHash = await hashPassword(password);
      const newPreviousPasswords = buildPreviousPasswordsList(user.passwordHash, previousHashes);

      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          previousPasswords: newPreviousPasswords,
        },
      });

      // Consume the reset token
      await deleteResetToken(token);

      return reply.status(200).send({ message: 'Password has been reset successfully.' });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Password reset failed' });
    }
  });

  // =========================================================================
  // PUT /change-password (authenticated)
  // =========================================================================
  server.put('/change-password', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing authorization token' });
    }

    let decoded;
    try {
      const token = authHeader.slice(7);
      decoded = verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ message: 'Invalid or expired token' });
    }

    const { currentPassword, newPassword, confirmPassword } = (request.body as any) || {};
    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ message: 'Current password and new password are required' });
    }
    if (newPassword.length < 12) {
      return reply.status(400).send({ message: 'New password must be at least 12 characters long' });
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      return reply.status(400).send({ message: 'Passwords do not match' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) return reply.status(401).send({ message: 'User not found' });

      // Verify current password
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) return reply.status(401).send({ message: 'Current password is incorrect' });

      // Check password reuse
      const previousHashes = user.previousPasswords || [];
      const reused = await isPasswordReused(newPassword, [user.passwordHash, ...previousHashes]);
      if (reused) {
        return reply.status(400).send({
          message: 'This password has been used recently. Please choose a different password.',
        });
      }

      // Hash and update
      const newPasswordHash = await hashPassword(newPassword);
      const newPreviousPasswords = buildPreviousPasswordsList(user.passwordHash, previousHashes);

      await prisma.user.update({
        where: { id: decoded.sub },
        data: {
          passwordHash: newPasswordHash,
          previousPasswords: newPreviousPasswords,
        },
      });

      return reply.status(200).send({ message: 'Password changed successfully' });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Password change failed' });
    }
  });
}
