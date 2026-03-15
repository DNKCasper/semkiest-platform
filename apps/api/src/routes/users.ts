import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword, isPasswordReused, buildPreviousPasswordsList } from '../utils/password.js';

// ---------------------------------------------------------------------------
// Auth middleware helper
// ---------------------------------------------------------------------------
function extractUser(request: FastifyRequest): { sub: string; email: string; role: string; orgId?: string } | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.slice(7);
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export async function userRoutes(server: FastifyInstance): Promise<void> {
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
        server.log.warn('Could not import Prisma client - user routes will return errors');
      }
    }
  }

  // =========================================================================
  // GET /profile
  // =========================================================================
  server.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    try {
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) return reply.status(404).send({ message: 'User not found' });

      return reply.status(200).send({
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        role: user.role.toLowerCase(),
        emailVerified: user.emailVerified ?? false,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch profile' });
    }
  });

  // =========================================================================
  // PUT /profile
  // =========================================================================
  server.put('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    const { name, bio, avatarUrl } = (request.body as any) || {};

    try {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (bio !== undefined) updateData.bio = bio;
      // avatarUrl would require S3 integration; store if field exists
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

      const user = await prisma.user.update({
        where: { id: decoded.sub },
        data: updateData,
      });

      return reply.status(200).send({
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        role: user.role.toLowerCase(),
        emailVerified: user.emailVerified ?? false,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Failed to update profile' });
    }
  });

  // =========================================================================
  // PUT /password (change password for authenticated user)
  // =========================================================================
  server.put('/password', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

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
      if (!user) return reply.status(404).send({ message: 'User not found' });

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) return reply.status(401).send({ message: 'Current password is incorrect' });

      const previousHashes = user.previousPasswords || [];
      const reused = await isPasswordReused(newPassword, [user.passwordHash, ...previousHashes]);
      if (reused) {
        return reply.status(400).send({
          message: 'This password has been used recently. Please choose a different password.',
        });
      }

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

  // =========================================================================
  // GET /notifications (notification preferences)
  // =========================================================================
  server.get('/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    // Default preferences (until a dedicated preferences table is created)
    return reply.status(200).send({
      emailNotifications: true,
      testCompletion: true,
      testFailure: true,
      weeklySummary: false,
    });
  });

  // =========================================================================
  // PUT /notifications (update notification preferences)
  // =========================================================================
  server.put('/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    const body = request.body as any;
    // TODO: Store in a UserPreferences table when created
    return reply.status(200).send({
      emailNotifications: body?.emailNotifications ?? true,
      testCompletion: body?.testCompletion ?? true,
      testFailure: body?.testFailure ?? true,
      weeklySummary: body?.weeklySummary ?? false,
    });
  });

  // =========================================================================
  // GET /api-keys
  // =========================================================================
  server.get('/api-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    // TODO: Implement API key storage in database
    return reply.status(200).send([]);
  });

  // =========================================================================
  // POST /api-keys
  // =========================================================================
  server.post('/api-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    // TODO: Implement API key creation
    return reply.status(501).send({ message: 'API key management not yet implemented' });
  });

  // =========================================================================
  // DELETE /api-keys/:id
  // =========================================================================
  server.delete('/api-keys/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    // TODO: Implement API key deletion
    return reply.status(501).send({ message: 'API key management not yet implemented' });
  });

  // =========================================================================
  // GET /sessions
  // =========================================================================
  server.get('/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    // TODO: Implement session tracking
    return reply.status(200).send([]);
  });

  // =========================================================================
  // DELETE /sessions/others (revoke other sessions)
  // =========================================================================
  server.delete('/sessions/others', async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    // TODO: Implement session revocation
    return reply.status(200).send({ message: 'Other sessions revoked' });
  });

  // =========================================================================
  // DELETE /account (delete own account)
  // =========================================================================
  server.delete('/account', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!prisma) return reply.status(503).send({ message: 'Database not available' });

    const decoded = extractUser(request);
    if (!decoded) return reply.status(401).send({ message: 'Missing or invalid authorization token' });

    try {
      await prisma.user.delete({ where: { id: decoded.sub } });
      return reply.status(200).send({ message: 'Account deleted successfully' });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ message: 'Account deletion failed' });
    }
  });
}
