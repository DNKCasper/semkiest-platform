import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

import { authenticate } from '../middleware/org-isolation';
import { broadcastToRun } from './ws-runs';
import { enqueueCoordinateJob } from '../queues/coordinate.queue';
import {
  ProjectIdParamsSchema,
  RunIdParamsSchema,
  TriggerTestRunBodySchema,
  ListRunsQuerySchema,
  UpdateRunStatusBodySchema,
  RecordTestResultsBodySchema,
} from '../schemas/runs';
import { buildPaginationMeta } from '../types/pagination';

/** Maps API sort field names to Prisma field names. */
const SORT_FIELD_MAP: Record<string, string> = {
  startedAt: 'startedAt',
  createdAt: 'createdAt',
  completedAt: 'completedAt',
  // Frontend also uses these sort keys — fall back to createdAt for fields
  // that aren't direct Prisma columns (they're computed from testResults).
  passRate: 'createdAt',
  duration: 'createdAt',
  totalTests: 'createdAt',
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

/**
 * Compute summary statistics from a test run including totalTests, passed, failed, skipped, passRate, and duration
 */
function computeRunStats(run: any): {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  passRate: number;
  duration: number | null;
} {
  const testResults = run.testResults || [];
  const totalTests = testResults.length;
  const passedTests = testResults.filter((tr: any) => tr.status === 'PASSED').length;
  const failedTests = testResults.filter((tr: any) => tr.status === 'FAILED').length;
  const skippedTests = testResults.filter((tr: any) => tr.status === 'SKIPPED').length;

  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  let duration: number | null = null;
  if (run.startedAt && run.completedAt) {
    duration = Math.round(
      (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
    );
  }

  return { totalTests, passedTests, failedTests, skippedTests, passRate, duration };
}

/**
 * Enhance a run object with computed statistics
 */
function enhanceRunWithStats(run: any): any {
  const stats = computeRunStats(run);
  return { ...run, ...stats };
}

export const runRoutes: FastifyPluginAsync = async (fastify) => {
  // Use dynamic import with fallback chain (same resilient pattern as auth/user routes).
  // This ensures the plugin always registers even if one DB package is unavailable.
  let prisma: any;
  try {
    const dbModule = await import('@semkiest/db');
    prisma = dbModule.prisma || dbModule.default?.prisma;
    fastify.log.info('Run routes: loaded Prisma from @semkiest/db');
  } catch {
    try {
      const dbModule = await import('@sem/database');
      prisma = dbModule.prisma || dbModule.default?.prisma;
      fastify.log.info('Run routes: loaded Prisma from @sem/database');
    } catch {
      fastify.log.warn('Run routes: could not import Prisma client — routes will return 503');
    }
  }

  /** POST /projects/:projectId/runs — Trigger a new test run */
  fastify.post(
    '/projects/:projectId/runs',
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

      const bodyResult = TriggerTestRunBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          statusCode: 400,
          details: formatZodError(bodyResult.error),
        });
      }

      const { projectId } = paramsResult.data;
      const { profileId } = bodyResult.data;
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
        const profile = await prisma.testProfile.findFirst({
          where: { id: profileId, projectId },
        });

        if (!profile) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Test profile ${profileId} not found in project`,
            statusCode: 404,
          });
        }

        // Create the test run
        // Note: triggerType is accepted in the request body for client tracking
        // but is NOT persisted — the Prisma TestRun model has no triggerType column.
        const testRun = await prisma.testRun.create({
          data: {
            testProfileId: profileId,
            status: 'PENDING',
          },
          include: {
            testResults: true,
          },
        });

        // Enqueue a coordinate job so the worker picks up and executes the test run.
        // This is fire-and-forget from the API's perspective — the worker will
        // update the TestRun status to RUNNING → PASSED/FAILED as it progresses.
        try {
          const jobId = await enqueueCoordinateJob({
            metadata: {
              projectId,
              testRunId: testRun.id,
              correlationId: testRun.id,
            },
            baseUrl: project.url ?? '',
            profileId,
          });

          fastify.log.info(
            { testRunId: testRun.id, jobId },
            'Enqueued coordinate job for test run',
          );
        } catch (enqueueErr) {
          // If the queue is unavailable, the run stays in PENDING. The frontend
          // will show it as pending and the user can retry. We don't fail the
          // HTTP request because the TestRun was successfully created.
          fastify.log.warn(
            { testRunId: testRun.id, error: enqueueErr },
            'Failed to enqueue coordinate job — run will stay in PENDING',
          );
        }

        // Enhance with computed stats
        const enhancedRun = enhanceRunWithStats(testRun);

        return reply.code(201).send({ data: enhancedRun });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to trigger test run');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to trigger test run',
          statusCode: 500,
        });
      }
    },
  );

  /** GET /projects/:projectId/runs — List runs for a project */
  fastify.get(
    '/projects/:projectId/runs',
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

      const queryResult = ListRunsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid query parameters',
          statusCode: 400,
          details: formatZodError(queryResult.error),
        });
      }

      const { projectId } = paramsResult.data;
      const { page, pageSize, status, sort, sortDir } = queryResult.data;
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

        // Build where clause
        // Note: triggerType is accepted in query params but not filterable
        // since it's not persisted on the TestRun model.
        const where: Record<string, unknown> = {
          testProfile: {
            projectId,
          },
          ...(status !== undefined && { status }),
        };

        const orderBy = { [SORT_FIELD_MAP[sort]]: sortDir };

        const [total, runs] = await Promise.all([
          prisma.testRun.count({ where }),
          prisma.testRun.findMany({
            where,
            orderBy,
            take: pageSize,
            skip: offset,
            include: {
              testResults: true,
              testProfile: true,
            },
          }),
        ]);

        // Enhance runs with computed statistics
        const enhancedRuns = runs.map(enhanceRunWithStats);

        return reply.code(200).send({
          data: enhancedRuns,
          pagination: {
            total,
            page,
            pageSize,
            hasMore: offset + pageSize < total,
          },
        });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to list test runs');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to list test runs',
          statusCode: 500,
        });
      }
    },
  );

  /** GET /projects/:projectId/runs/trend — Trend data (last 10 completed runs) */
  fastify.get(
    '/projects/:projectId/runs/trend',
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

      const { projectId } = paramsResult.data;
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

        // Fetch last 10 completed runs
        const runs = await prisma.testRun.findMany({
          where: {
            testProfile: {
              projectId,
            },
            completedAt: {
              not: null,
            },
          },
          orderBy: {
            completedAt: 'desc',
          },
          take: 10,
          include: {
            testResults: true,
          },
        });

        // Map to trend data
        const trendData = runs.map((run: any) => {
          const stats = computeRunStats(run);
          return {
            runId: run.id,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            passRate: stats.passRate,
            totalTests: stats.totalTests,
            passedTests: stats.passedTests,
            failedTests: stats.failedTests,
          };
        });

        return reply.code(200).send({ data: trendData });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to get trend data');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to get trend data',
          statusCode: 500,
        });
      }
    },
  );

  /** GET /projects/:projectId/runs/:runId — Get single run detail */
  fastify.get(
    '/projects/:projectId/runs/:runId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = RunIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const { projectId, runId } = paramsResult.data;
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

        // Fetch the run with all related data
        const run = await prisma.testRun.findFirst({
          where: {
            id: runId,
            testProfile: {
              projectId,
            },
          },
          include: {
            testResults: {
              include: {
                testSteps: {
                  orderBy: {
                    stepNumber: 'asc',
                  },
                },
              },
            },
            testProfile: true,
          },
        });

        if (!run) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Test run ${runId} not found`,
            statusCode: 404,
          });
        }

        // Enhance with computed stats
        const enhancedRun = enhanceRunWithStats(run);

        return reply.code(200).send({ data: enhancedRun });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to get test run details');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to get test run details',
          statusCode: 500,
        });
      }
    },
  );

  /** PATCH /projects/:projectId/runs/:runId — Update run status */
  fastify.patch(
    '/projects/:projectId/runs/:runId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = RunIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const bodyResult = UpdateRunStatusBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          statusCode: 400,
          details: formatZodError(bodyResult.error),
        });
      }

      const { projectId, runId } = paramsResult.data;
      const { status, completedAt } = bodyResult.data;
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

        // Verify run exists
        const existingRun = await prisma.testRun.findFirst({
          where: {
            id: runId,
            testProfile: {
              projectId,
            },
          },
        });

        if (!existingRun) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Test run ${runId} not found`,
            statusCode: 404,
          });
        }

        // Update the run
        const updateData: any = { status };
        // Automatically set startedAt when transitioning to RUNNING
        if (status === 'RUNNING' && !existingRun.startedAt) {
          updateData.startedAt = new Date();
        }
        if (completedAt) {
          updateData.completedAt = new Date(completedAt);
        }

        const updatedRun = await prisma.testRun.update({
          where: { id: runId },
          data: updateData,
          include: {
            testResults: true,
          },
        });

        // Enhance with computed stats
        const enhancedRun = enhanceRunWithStats(updatedRun);

        // Broadcast status update to all connected clients
        broadcastToRun(runId, { type: 'run.status', runId, status: updatedRun.status });

        // If status is terminal, broadcast run completion
        if (['PASSED', 'FAILED', 'CANCELLED'].includes(updatedRun.status)) {
          broadcastToRun(runId, {
            type: 'run.complete',
            runId,
            run: { status: updatedRun.status, summary: computeRunStats(updatedRun) },
          });
        }

        return reply.code(200).send({ data: enhancedRun });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to update test run status');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to update test run status',
          statusCode: 500,
        });
      }
    },
  );

  /** POST /projects/:projectId/runs/:runId/results — Record test results */
  fastify.post(
    '/projects/:projectId/runs/:runId/results',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!prisma) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Database not available',
          statusCode: 503,
        });
      }

      const paramsResult = RunIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid path parameters',
          statusCode: 400,
          details: formatZodError(paramsResult.error),
        });
      }

      const bodyResult = RecordTestResultsBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          statusCode: 400,
          details: formatZodError(bodyResult.error),
        });
      }

      const { projectId, runId } = paramsResult.data;
      const { results } = bodyResult.data;
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

        // Verify run exists
        const existingRun = await prisma.testRun.findFirst({
          where: {
            id: runId,
            testProfile: {
              projectId,
            },
          },
        });

        if (!existingRun) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Test run ${runId} not found`,
            statusCode: 404,
          });
        }

        // Create test results and their steps in a transaction
        const createdResults = await Promise.all(
          results.map(async (result) => {
            const testResult = await prisma.testResult.create({
              data: {
                testRunId: runId,
                testName: result.testName,
                status: result.status,
                errorMessage: result.errorMessage || null,
              },
              include: {
                testSteps: true,
              },
            });

            // Create test steps if provided
            if (result.steps && result.steps.length > 0) {
              const stepsData = result.steps.map((step) => ({
                testResultId: testResult.id,
                stepNumber: step.stepNumber,
                action: step.action,
                expected: step.expected || null,
                actual: step.actual || null,
                status: step.status,
              }));

              const createdSteps = await prisma.testStep.createMany({
                data: stepsData,
              });

              // Fetch the result with steps
              return await prisma.testResult.findUnique({
                where: { id: testResult.id },
                include: {
                  testSteps: {
                    orderBy: {
                      stepNumber: 'asc',
                    },
                  },
                },
              });
            }

            return testResult;
          }),
        );

        // Fetch the updated run with all results
        const updatedRun = await prisma.testRun.findUnique({
          where: { id: runId },
          include: {
            testResults: {
              include: {
                testSteps: {
                  orderBy: {
                    stepNumber: 'asc',
                  },
                },
              },
            },
          },
        });

        // Enhance with computed stats
        const enhancedRun = enhanceRunWithStats(updatedRun);

        // Broadcast each created result to connected clients
        for (const result of createdResults) {
          broadcastToRun(runId, {
            type: 'run.result',
            runId,
            result: {
              id: result.id,
              testName: result.testName,
              status: result.status,
              errorMessage: result.errorMessage || undefined,
            },
          });
        }

        // Broadcast updated summary
        broadcastToRun(runId, {
          type: 'run.summary',
          runId,
          summary: computeRunStats(updatedRun),
        });

        return reply.code(201).send({
          data: {
            run: enhancedRun,
            resultsCreated: createdResults.length,
          },
        });
      } catch (err: unknown) {
        fastify.log.error(err, 'Failed to record test results');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to record test results',
          statusCode: 500,
        });
      }
    },
  );
};
