import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// In-memory refresh token store (replaces Redis until ElastiCache is set up)
// ---------------------------------------------------------------------------
const refreshTokenStore = new Map<string, { userId: string; expiresAt: number }>();

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of refreshTokenStore) {
    if (data.expiresAt < now) refreshTokenStore.delete(token);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
const ACCESS_SECRET = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'change-me-access';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'change-me-refresh';
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateAccessToken(payload: { sub: string; email: string; role: string; orgId?: string }): string {
  return jwt.sign(
    { email: payload.email, role: payload.role, orgId: payload.orgId },
    ACCESS_SECRET(),
    { subject: payload.sub, expiresIn: ACCESS_EXPIRY, algorithm: 'HS256' },
  );
}

function generateRefreshToken(sub: string): string {
  return jwt.sign({}, REFRESH_SECRET(), {
    subject: sub,
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_SECRET(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
}

function verifyRefreshToken(token: string) {
  return jwt.verify(token, REFRESH_SECRET(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
}

function makeTokenPair(user: { id: string; email: string; role: string; orgId?: string }) {
  const accessToken = generateAccessToken({ sub: user.id, email: user.email, role: user.role, orgId: user.orgId });
  const refreshToken = generateRefreshToken(user.id);
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

  // Store refresh token
  refreshTokenStore.set(refreshToken, { userId: user.id, expiresAt: Date.now() + REFRESH_EXPIRY_MS });

  return { accessToken, refreshToken, expiresAt };
}

/** Derive a display name from email */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'User';
  return local
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatUser(u: { id: string; email: string; role: string; orgId?: string | null; createdAt: Date; updatedAt: Date }) {
  return {
    id: u.id,
    name: nameFromEmail(u.email),
    email: u.email,
    role: u.role.toLowerCase(),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RegisterBody = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().optional(),
  acceptTerms: z.boolean().optional(),
});

const RefreshBody = z.object({
  refreshToken: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------
export async function authRoutes(server: FastifyInstance): Promise<void> {
  // Lazily import Prisma client - may fail if @sem/db isn't built
  let prisma: any;
  try {
    const dbModule = await import('@semkiest/db');
    prisma = dbModule.prisma || dbModule.default?.prisma;
  } catch {
    try {
      const dbModule = await import('@sem/database');
      prisma = dbModule.prisma || dbModule.default?.prisma;
    } catch {
      // If neither package works, try @sem/db
      try {
        const dbModule = await import('@sem/db');
        prisma = dbModule.prisma || dbModule.default?.prisma;
      } catch {
        server.log.warn('Could not import Prisma client - auth routes will return errors');
      }
    }
  }

  // POST /api/auth/register
  server.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const parsed = RegisterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Validation failed', details: parsed.error.errors });
    }
    const { email, password } = parsed.data;

    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ message: 'A user with that email already exists' });
      }

      // Ensure a default organization exists
      let org = await prisma.organization.findFirst({ where: { name: 'Default' } });
      if (!org) {
        org = await prisma.organization.create({ data: { name: 'Default' } });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: 'VIEWER',
          orgId: org.id,
        },
      });

      const tokens = makeTokenPair({ id: user.id, email: user.email, role: user.role, orgId: user.orgId });
      return reply.status(201).send({
        user: formatUser(user),
        tokens,
      });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: err.message || 'Registration failed' });
    }
  });

  // POST /api/auth/login
  server.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Validation failed', details: parsed.error.errors });
    }
    const { email, password } = parsed.data;

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return reply.status(401).send({ message: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ message: 'Invalid email or password' });
      }

      const tokens = makeTokenPair({ id: user.id, email: user.email, role: user.role, orgId: user.orgId });
      return reply.status(200).send({
        user: formatUser(user),
        tokens,
      });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: err.message || 'Login failed' });
    }
  });

  // POST /api/auth/refresh
  server.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = RefreshBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Validation failed' });
    }

    const { refreshToken } = parsed.data;

    try {
      const decoded = verifyRefreshToken(refreshToken);
      const stored = refreshTokenStore.get(refreshToken);

      if (!stored || stored.userId !== decoded.sub) {
        return reply.status(401).send({ message: 'Invalid or expired refresh token' });
      }

      // Rotate: delete old, issue new
      refreshTokenStore.delete(refreshToken);

      let user: any = null;
      if (prisma) {
        user = await prisma.user.findUnique({ where: { id: decoded.sub as string } });
      }

      if (!user) {
        return reply.status(401).send({ message: 'User not found' });
      }

      const tokens = makeTokenPair({ id: user.id, email: user.email, role: user.role, orgId: user.orgId });
      return reply.status(200).send(tokens);
    } catch {
      return reply.status(401).send({ message: 'Invalid or expired refresh token' });
    }
  });

  // POST /api/auth/logout
  server.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      if (body?.refreshToken) {
        refreshTokenStore.delete(body.refreshToken);
      }
    } catch {
      // best effort
    }
    return reply.status(200).send({ message: 'Logged out successfully' });
  });

  // GET /api/auth/me
  server.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing authorization token' });
    }

    try {
      const token = authHeader.slice(7);
      const decoded = verifyAccessToken(token);

      const user = await prisma.user.findUnique({ where: { id: decoded.sub as string } });
      if (!user) {
        return reply.status(401).send({ message: 'User not found' });
      }

      return reply.status(200).send(formatUser(user));
    } catch {
      return reply.status(401).send({ message: 'Invalid or expired token' });
    }
  });

  // POST /api/auth/forgot-password (stub)
  server.post('/forgot-password', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ message: 'If that email exists, a reset link has been sent.' });
  });

  // POST /api/auth/reset-password (stub)
  server.post('/reset-password', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ message: 'Password has been reset successfully.' });
  });
}
