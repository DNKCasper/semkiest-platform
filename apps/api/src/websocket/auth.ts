/**
 * JWT authentication middleware for WebSocket connections.
 * Verifies the token from socket handshake and populates socket.data.
 */

import * as jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  JwtTokenPayload,
  ServerToClientEvents,
  SocketData,
  UserRole,
} from '../types/websocket';

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const VALID_ROLES: ReadonlySet<string> = new Set<UserRole>(['admin', 'member']);

/**
 * Extracts the bearer token from socket handshake.
 * Accepts it either from `socket.handshake.auth.token` or the
 * `Authorization: Bearer <token>` header.
 */
function extractToken(socket: AppSocket): string | undefined {
  const authToken = socket.handshake.auth['token'] as unknown;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }

  const authHeader = socket.handshake.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  return undefined;
}

/**
 * Validates that the decoded JWT payload has all required fields.
 */
function isValidPayload(decoded: unknown): decoded is JwtTokenPayload {
  if (typeof decoded !== 'object' || decoded === null) {
    return false;
  }
  const p = decoded as Record<string, unknown>;
  return (
    typeof p['userId'] === 'string' &&
    typeof p['orgId'] === 'string' &&
    typeof p['role'] === 'string' &&
    VALID_ROLES.has(p['role'])
  );
}

/**
 * Creates a Socket.io middleware that validates JWT tokens.
 *
 * @param jwtSecret - The secret used to verify the token signature.
 * @returns A Socket.io middleware function.
 */
export function createAuthMiddleware(jwtSecret: string) {
  return (socket: AppSocket, next: (err?: Error) => void): void => {
    const token = extractToken(socket);

    if (!token) {
      next(new Error('Authentication error: No token provided'));
      return;
    }

    let decoded: unknown;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch {
      next(new Error('Authentication error: Invalid or expired token'));
      return;
    }

    if (!isValidPayload(decoded)) {
      next(new Error('Authentication error: Malformed token payload'));
      return;
    }

    socket.data.userId = decoded.userId;
    socket.data.orgId = decoded.orgId;
    socket.data.role = decoded.role;
    socket.data.projectIds = decoded.projectIds ?? [];

    next();
  };
}
