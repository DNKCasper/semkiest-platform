import Fastify from 'fastify';
import fjwt from '@fastify/jwt';

import { registerRoutes } from './routes';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
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
