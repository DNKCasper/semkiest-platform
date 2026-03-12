/**
 * API server entry point.
 * Initialises Fastify, registers Socket.io, and starts listening.
 */

import Fastify from 'fastify';
import { createWebSocketServer } from './websocket';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const JWT_SECRET = process.env['JWT_SECRET'] ?? '';
const CORS_ORIGINS = process.env['CORS_ORIGINS']?.split(',').map((o) => o.trim()) ?? [
  'http://localhost:3000',
];
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

async function bootstrap(): Promise<void> {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const fastify = Fastify({
    logger: { level: LOG_LEVEL },
  });

  // Health check endpoint used by load balancers and k8s probes
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Listen first so fastify.server is a fully initialised HTTP server
  await fastify.listen({ port: PORT, host: HOST });

  // Attach Socket.io to the same HTTP server – shares the port with Fastify
  createWebSocketServer(fastify.server, {
    corsOrigins: CORS_ORIGINS,
    jwtSecret: JWT_SECRET,
  });

  fastify.log.info(`API server listening on ${HOST}:${PORT}`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal: failed to start API server', err);
  process.exit(1);
});
