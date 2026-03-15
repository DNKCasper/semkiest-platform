import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthUser, UserRole } from '@sem/shared';

import { verifyAccessToken } from '../utils/jwt.js';

// Augment @fastify/jwt so request.user is typed as AuthUser
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

/**
 * Fastify preHandler that verifies the JWT token and populates request.user.
 * Uses the same verifyAccessToken() utility as the auth routes so the
 * signing secret (which includes an "access:" prefix) always matches.
 * Returns 401 when the token is absent or invalid.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token',
      statusCode: 401,
    });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = verifyAccessToken(token);
    // Populate request.user so downstream handlers can access it
    (request as any).user = {
      sub: decoded.sub,
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.orgId,
    };
  } catch {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token',
      statusCode: 401,
    });
  }
}

/**
 * Returns a Fastify preHandler that enforces a minimum role requirement.
 * Must be used after `authenticate`.
 */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { role } = request.user;
    if (!(roles as string[]).includes(role)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions for this action',
        statusCode: 403,
      });
    }
  };
}

/** Roles allowed to mutate resources (create / update / delete). */
export const MANAGER_ROLES: UserRole[] = ['MANAGER', 'ADMIN'];
