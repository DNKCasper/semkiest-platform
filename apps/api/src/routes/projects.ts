import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';

import { prisma } from '@sem/database';

import { authenticate, MANAGER_ROLES, requireRole } from '../middleware/org-isolation';
import {
  CreateProjectBodySchema,
  ListProjectsQuerySchema,
  ProjectParamsSchema,
  UpdateProjectBodySchema,
} from '../schemas/projects';
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

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /api/v1/projects — list org projects with filtering, sorting, and pagination */
  fastify.get(
    '/projects',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const queryResult = ListProjectsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid query parameters',
          statusCode: 400,
          details: formatZodError(queryResult.error),
        });
      }

      const { limit, offset, status, name, sortBy, sortDir, createdAfter, createdBefore } =
        queryResult.data;
      const { orgId } = request.user;

      const where = {
        orgId,
        deletedAt: null,
        ...(status !== undefined && { status }),
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

      const [total, projects] = await Promise.all([
        prisma.project.count({ where }),
        prisma.project.findMany({ where, orderBy, take: limit, skip: offset }),
      ]);

      return reply.code(200).send({
        data: projects,
        pagination: buildPaginationMeta(total, limit, offset),
      });
    },
  );

  /** GET /api/v1/projects/:id — retrieve a single project */
  fastify.get(
    '/projects/:id',
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

      const { id } = paramsResult.data;
      const { orgId } = request.user;

      const project = await prisma.project.findFirst({
        where: { id, deletedAt: null },
      });

      if (!project) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${id} not found`,
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

      return reply.code(200).send({ data: project });
    },
  );

  /** POST /api/v1/projects — create a new project */
  fastify.post(
    '/projects',
    { preHandler: [authenticate, requireRole(...MANAGER_ROLES)] },
    async (request, reply) => {
      const bodyResult = CreateProjectBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          statusCode: 400,
          details: formatZodError(bodyResult.error),
        });
      }

      const { name, description, status } = bodyResult.data;
      const { orgId } = request.user;

      const project = await prisma.project.create({
        data: { name, description, status, orgId },
      });

      return reply.code(201).send({ data: project });
    },
  );

  /** PUT /api/v1/projects/:id — update a project */
  fastify.put(
    '/projects/:id',
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

      const bodyResult = UpdateProjectBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          statusCode: 400,
          details: formatZodError(bodyResult.error),
        });
      }

      const { id } = paramsResult.data;
      const { orgId } = request.user;

      const existing = await prisma.project.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${id} not found`,
          statusCode: 404,
        });
      }

      if (existing.orgId !== orgId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Access to this project is not allowed',
          statusCode: 403,
        });
      }

      const project = await prisma.project.update({
        where: { id },
        data: bodyResult.data,
      });

      return reply.code(200).send({ data: project });
    },
  );

  /** DELETE /api/v1/projects/:id — soft delete a project */
  fastify.delete(
    '/projects/:id',
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

      const { id } = paramsResult.data;
      const { orgId } = request.user;

      const existing = await prisma.project.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Project ${id} not found`,
          statusCode: 404,
        });
      }

      if (existing.orgId !== orgId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Access to this project is not allowed',
          statusCode: 403,
        });
      }

      await prisma.project.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(204).send();
    },
  );
};
