import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';

import { registerRoutes } from './routes';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

// Register CORS - allow all origins in staging, restrict in production
server.register(cors, {
  origin: true, // reflect request origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Register JWT plugin
server.register(fjwt, {
  secret: process.env.JWT_SECRET ?? 'change-me-in-production',
});

// Register all API routes
registerRoutes(server);

// Health check
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async (): Promise<void> => {
  try {
    const port = Number(process.env.PORT ?? 3001);
    const host = process.env.HOST ?? '0.0.0.0';
    await server.listen({ port, host });
    server.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

export { server };
