import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

import { authenticate } from '../middleware/org-isolation';
import {
  ProjectIdParamsSchema,
  ProfileIdParamsSchema,
  CreateProfileBodySchema,
  UpdateProfileBodySchema,
  ListProfilesQuerySchema,
} from '../schemas/profiles-fastify';

function formatZodError(err: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of err.errors) {
    const key = issue.path.join('.') || 'root';
    if (!formatted[key]) formatted[key] = [];
    formatted[key].push(issue.message);
  }
  return formatted;
}

export const profileRoutes: FastifyPluginAsync = async (fastify) => {
  // Use dynamic import with fallback chain (same resilient pattern as auth/user routes).
  // This ensures the plugin always registers even if one DB package is unavailable.
  let prisma: any;
  try {
    const dbModule = await import('@semkiest/db');
    prisma = dbModule.prisma || dbModule.default?.prisma;
    fastify.log.info('Profile routes: loaded Prisma from @semkiest/db');
  } catch {
    try {
      const dbModule = await import('@sem/database');
      prisma = dbModule.prisma || dbModule.default?.prisma;
      fastify.log.info('Profile routes: loaded Prisma from @sem/database');
    } catch {
      fastify.log.warn('Profile routes: could not import Prisma client — routes will return 503');
    }
  }

  /** GET /projects/:projectId/profiles — List profiles for a project */
  fastify.get(
    '/projects/:projectId/profiles',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = ProjectIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const queryResult = ListProfilesQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid query parameters',
          statusCode: 400,
          details: formatZodError(queryResult.error),
        });
      }

      const { projectId } = paramsResult.data;
      const { page, pageSize } = queryResult.data;
      const { orgId } = request.user;

      const offset = (page - 1) * pageSize;

      try {
        // Verify project exists and belongs to user's org
        const project = await prisma.project.findFirst({
          where: { id: projectId, orgId, deletedAt: null },
        });

        if (!project) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Project ${projectId} not found`,
            statusCode: 404,
          });
        }

        const [total, profiles] = await Promise.all([
          prisma.testProfile.count({
            where: { projectId },
          }),
          prisma.testProfile.findMany({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
            take: pageSize,
            skip: offset,
          }),
        ]);

        return reply.code(200).send({
          data: profiles,
          pagination: {
            total,
            page,
            pageSize,
            hasMore: offset + pageSize < total,
          },
        });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to list profiles');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to list profiles',
          statusCode: 500,
        });
      }
    },
  );

  /** POST /projects/:projectId/profiles — Create a new profile */
  fastify.post(
    '/projects/:projectId/profiles',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = ProjectIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const bodyResult = CreateProfileBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          statusCode: 400,
          details: formatZodError(bodyResult.error),
        });
      }

      const { projectId } = paramsResult.data;
      const { name, config } = bodyResult.data;
      const { orgId } = request.user;

      try {
        // Verify project exists and belongs to user's org
        const project = await prisma.project.findFirst({
          where: { id: projectId, orgId, deletedAt: null },
        });

        if (!project) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Project ${projectId} not found`,
            statusCode: 404,
          });
        }

        // Create the test profile
        const profile = await prisma.testProfile.create({
          data: {
            projectId,
            name,
            config: config || {},
          },
        });

        return reply.code(201).send({ data: profile });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to create profile');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to create profile',
          statusCode: 500,
        });
      }
    },
  );

  /** GET /projects/:projectId/profiles/:profileId — Get single profile */
  fastify.get(
    '/projects/:projectId/profiles/:profileId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = ProfileIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const { projectId, profileId } = paramsResult.data;
      const { orgId } = request.user;

      try {
        // Verify project exists and belongs to user's org
        const project = await prisma.project.findFirst({
          where: { id: projectId, orgId, deletedAt: null },
        });

        if (!project) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Project ${projectId} not found`,
            statusCode: 404,
          });
        }

        // Fetch the profile and verify it belongs to the project
        const profile = await prisma.testProfile.findFirst({
          where: {
            id: profileId,
            projectId,
          },
        });

        if (!profile) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Profile ${profileId} not found in project`,
            statusCode: 404,
          });
        }

        return reply.code(200).send({ data: profile });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to get profile details');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to get profile details',
          statusCode: 500,
        });
      }
    },
  );

  /** PUT /projects/:projectId/profiles/:profileId — Update profile */
  fastify.put(
    '/projects/:projectId/profiles/:profileId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = ProfileIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const bodyResult = UpdateProfileBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          statusCode: 400,
          details: formatZodError(bodyResult.error),
        });
      }

      const { projectId, profileId } = paramsResult.data;
      const { name, config } = bodyResult.data;
      const { orgId } = request.user;

      try {
        // Verify project exists and belongs to user's org
        const project = await prisma.project.findFirst({
          where: { id: projectId, orgId, deletedAt: null },
        });

        if (!project) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Project ${projectId} not found`,
            statusCode: 404,
          });
        }

        // Verify profile exists and belongs to the project
        const existingProfile = await prisma.testProfile.findFirst({
          where: {
            id: profileId,
            projectId,
          },
        });

        if (!existingProfile) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Profile ${profileId} not found in project`,
            statusCode: 404,
          });
        }

        // Build update data (only include provided fields)
        const updateData: any = {};
        if (name !== undefined) {
          updateData.name = name;
        }
        if (config !== undefined) {
          updateData.config = config;
        }

        const updatedProfile = await prisma.testProfile.update({
          where: { id: profileId },
          data: updateData,
        });

        return reply.code(200).send({ data: updatedProfile });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to update profile');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to update profile',
          statusCode: 500,
        });
      }
    },
  );

  /** DELETE /projects/:projectId/profiles/:profileId — Delete profile */
  fastify.delete(
    '/projects/:projectId/profiles/:profileId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = ProfileIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const { projectId, profileId } = paramsResult.data;
      const { orgId } = request.user;

      try {
        // Verify project exists and belongs to user's org
        const project = await prisma.project.findFirst({
          where: { id: projectId, orgId, deletedAt: null },
        });

        if (!project) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Project ${projectId} not found`,
            statusCode: 404,
          });
        }

        // Verify profile exists and belongs to the project
        const existingProfile = await prisma.testProfile.findFirst({
          where: {
            id: profileId,
            projectId,
          },
        });

        if (!existingProfile) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Profile ${profileId} not found in project`,
            statusCode: 404,
          });
        }

        // Delete the profile
        await prisma.testProfile.delete({
          where: { id: profileId },
        });

        return reply.code(204).send();
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to delete profile');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to delete profile',
          statusCode: 500,
        });
      }
    },
  );
};
