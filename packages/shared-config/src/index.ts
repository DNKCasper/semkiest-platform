/**
 * @semkiest/shared-config
 *
 * Central configuration package providing:
 * - Zod-based environment variable validation schemas for all services
 * - TypeScript configuration presets (via tsconfig/* exports)
 *
 * Environment validation modules:
 * @see ./env/index.ts – all schemas and parsers
 * @see ./env/api.ts   – API server (Express/Fastify)
 * @see ./env/worker.ts – BullMQ worker process
 * @see ./env/web.ts   – Next.js web dashboard
 * @see ./env/database.ts – PostgreSQL connection
 * @see ./env/redis.ts – Redis connection
 * @see ./env/s3.ts    – S3/MinIO object storage
 */

export * from './env/index';
