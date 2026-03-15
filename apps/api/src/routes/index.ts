import type { FastifyInstance } from 'fastify';

import { projectRoutes } from './projects';
// TODO: profiles.ts uses Express Router — needs rewrite for Fastify
// import { profileRoutes } from './profiles';

/**
 * Registers all API route plugins on the Fastify instance.
 */
export function registerRoutes(server: FastifyInstance): void {
  server.register(projectRoutes, { prefix: '/api/v1' });
  // server.register(profileRoutes, { prefix: '/api/v1' });
}
