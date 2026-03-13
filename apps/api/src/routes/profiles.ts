import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';

import { prisma } from '@sem/database';

import { authenticate, MANAGER_ROLES, requireRole } from '../middleware/org-isolation';
import {
  CreateProfileBodySchema,
  ListProfilesQuerySchema,
  ProfileParamsSchema,
  ProjectParamsSchema,
  UpdateProfileBodySchema,
} from '../schemas/profiles';
import { buildPaginationMeta } from '../types/pagination';

/** Maps API sort field names to Prisma field names. */
const SORT_FIELD_MAP: Record<string, string> = {
  name: 'name',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

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
  /** GET /api/v1/projects/:id/profiles — list profiles for a project */
  fastify.get(
    '/projects/:id/profiles',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsResult = ProjectParamsSchema.safeParse(request.params);
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

      const { id: projectId } = paramsResult.data;
      const { orgId } = request.user;

      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
      });

      if (!project) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${projectId} not found`,
          statusCode: 404,
        });
      }

      if (project.orgId !== orgId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Access to this project is not allowed',
          statusCode: 403,
        });
      }

      const { limit, offset, name, sortBy, sortDir, createdAfter, createdBefore } =
        queryResult.data;

      const where = {
        projectId,
        deletedAt: null,
        ...(name !== undefined && {
          name: { contains: name, mode: 'insensitive' as const },
        }),
        ...((createdAfter !== undefined || createdBefore !== undefined) && {
          createdAt: {
            ...(createdAfter !== undefined && { gte: new Date(createdAfter) }),
            ...(createdBefore !== undefined && { lte: new Date(createdBefore) }),
          },
        }),
      };

      const orderBy = { [SORT_FIELD_MAP[sortBy]]: sortDir };

      const [total, profiles] = await Promise.all([
        prisma.testProfile.count({ where }),
        prisma.testProfile.findMany({ where, orderBy, take: limit, skip: offset }),
      ]);

      return reply.code(200).send({
        data: profiles,
        pagination: buildPaginationMeta(total, limit, offset),
      });
    },
  );

  /** GET /api/v1/projects/:id/profiles/:profileId — get a single profile */
  fastify.get(
    '/projects/:id/profiles/:profileId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsResult = ProfileParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const { id: projectId, profileId } = paramsResult.data;
      const { orgId } = request.user;

      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
      });

      if (!project) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${projectId} not found`,
          statusCode: 404,
        });
      }

      if (project.orgId !== orgId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Access to this project is not allowed',
          statusCode: 403,
        });
      }

      const profile = await prisma.testProfile.findFirst({
        where: { id: profileId, projectId, deletedAt: null },
      });

      if (!profile) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Profile ${profileId} not found`,
          statusCode: 404,
        });
      }

      return reply.code(200).send({ data: profile });
    },
  );

  /** POST /api/v1/projects/:id/profiles — create a profile */
  fastify.post(
    '/projects/:id/profiles',
    { preHandler: [authenticate, requireRole(...MANAGER_ROLES)] },
    async (request, reply) => {
      const paramsResult = ProjectParamsSchema.safeParse(request.params);
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

      const { id: projectId } = paramsResult.data;
      const { orgId } = request.user;

      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
      });

      if (!project) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${projectId} not found`,
          statusCode: 404,
        });
      }

      if (project.orgId !== orgId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Access to this project is not allowed',
          statusCode: 403,
        });
      }

      const { name, config } = bodyResult.data;

      const profile = await prisma.testProfile.create({
        data: { name, config, projectId },
      });

      return reply.code(201).send({ data: profile });
    },
  );

  /** PUT /api/v1/projects/:id/profiles/:profileId — update a profile */
  fastify.put(
    '/projects/:id/profiles/:profileId',
    { preHandler: [authenticate, requireRole(...MANAGER_ROLES)] },
    async (request, reply) => {
      const paramsResult = ProfileParamsSchema.safeParse(request.params);
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

      const { id: projectId, profileId } = paramsResult.data;
      const { orgId } = request.user;

      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
      });

      if (!project) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${projectId} not found`,
          statusCode: 404,
        });
      }

      if (project.orgId !== orgId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Access to this project is not allowed',
          statusCode: 403,
        });
      }

      const existing = await prisma.testProfile.findFirst({
        where: { id: profileId, projectId, deletedAt: null },
      });

      if (!existing) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Profile ${profileId} not found`,
          statusCode: 404,
        });
      }

      const profile = await prisma.testProfile.update({
        where: { id: profileId },
        data: bodyResult.data,
      });

      return reply.code(200).send({ data: profile });
    },
  );

  /** DELETE /api/v1/projects/:id/profiles/:profileId — soft delete a profile */
  fastify.delete(
    '/projects/:id/profiles/:profileId',
    { preHandler: [authenticate, requireRole(...MANAGER_ROLES)] },
    async (request, reply) => {
      const paramsResult = ProfileParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const { id: projectId, profileId } = paramsResult.data;
      const { orgId } = request.user;

      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
      });

      if (!project) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${projectId} not found`,
          statusCode: 404,
        });
      }

      if (project.orgId !== orgId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Access to this project is not allowed',
          statusCode: 403,
        });
      }

      const existing = await prisma.testProfile.findFirst({
        where: { id: profileId, projectId, deletedAt: null },
      });

      if (!existing) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Profile ${profileId} not found`,
          statusCode: 404,
        });
      }

      await prisma.testProfile.update({
        where: { id: profileId },
        data: { deletedAt: new Date() },
      });

      return reply.code(204).send();
    },
  );
};
