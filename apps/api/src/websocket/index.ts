/**
 * WebSocket server setup.
 * Creates a typed Socket.io server bound to a Node.js HTTP server and wires
 * up JWT authentication and event handlers.
 */

import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/websocket';
import { createAuthMiddleware } from './auth';
import { registerSocketHandlers } from './handlers';
import { WebSocketEvents } from './events';

/** Typed Socket.io server for the SemkiEst platform */
export type AppSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface WebSocketOptions {
  /** Allowed CORS origins */
  corsOrigins: string[];
  /** JWT secret used to verify inbound tokens */
  jwtSecret: string;
  /** Socket.io ping timeout in ms (default: 60 000) */
  pingTimeout?: number;
  /** Socket.io ping interval in ms (default: 25 000) */
  pingInterval?: number;
}

/**
 * Creates and configures a typed Socket.io server attached to the given HTTP
 * server.  Authentication middleware and event handlers are registered before
 * the server is returned.
 *
 * @param httpServer - The Node.js HTTP server (e.g. `fastify.server`).
 * @param options    - WebSocket configuration options.
 * @returns The configured Socket.io server instance.
 */
export function createWebSocketServer(
  httpServer: HttpServer,
  options: WebSocketOptions,
): AppSocketServer {
  const io: AppSocketServer = new Server(httpServer, {
    cors: {
      origin: options.corsOrigins,
      methods: ['GET', 'POST'],
    },
    pingTimeout: options.pingTimeout ?? 60_000,
    pingInterval: options.pingInterval ?? 25_000,
  });

  // Reject connections that do not carry a valid JWT
  io.use(createAuthMiddleware(options.jwtSecret));

  io.on('connection', (socket) => {
    registerSocketHandlers(io, socket);

    socket.on('error', () => {
      socket.emit(WebSocketEvents.ERROR, {
        code: 'SOCKET_ERROR',
        message: 'An unexpected socket error occurred',
        timestamp: new Date().toISOString(),
      });
    });
  });

  return io;
}

// Re-export commonly needed symbols so callers can import from a single path
export { WebSocketEvents, RoomNames } from './events';
export type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
  TestProgressPayload,
  AgentStatusPayload,
  TestResultPayload,
  ErrorPayload,
} from '../types/websocket';
