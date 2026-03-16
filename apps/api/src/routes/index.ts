import type { FastifyInstance } from 'fastify';

import { projectRoutes } from './projects';
import { authRoutes } from './auth-fastify';
import { userRoutes } from './users';
import { runRoutes } from './runs';
import { profileRoutes } from './profiles-fastify';

/**
 * Registers all API route plugins on the Fastify instance.
 */
export function registerRoutes(server: FastifyInstance): void {
  server.register(authRoutes, { prefix: '/api/auth' });
  server.register(projectRoutes, { prefix: '/api' });
  server.register(userRoutes, { prefix: '/api/users' });
  server.register(runRoutes, { prefix: '/api' });
  server.register(profileRoutes, { prefix: '/api' });
}
