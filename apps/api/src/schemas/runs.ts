import { z } from 'zod';

export const ProjectIdParamsSchema = z.object({
  projectId: z.string().min(1),
});

export const RunIdParamsSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
});

export const TriggerTestRunBodySchema = z.object({
  profileId: z.string().min(1),
  triggerType: z.enum(['manual', 'ci', 'scheduled']).default('manual'),
  /** Optional override of which agent types to run. */
  agents: z.array(z.string()).optional(),
});

export const ListRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED', 'TIMEOUT']).optional(),
  triggerType: z.enum(['manual', 'ci', 'scheduled']).optional(),
  sort: z.enum(['startedAt', 'createdAt', 'completedAt', 'passRate', 'duration', 'totalTests']).default('startedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const UpdateRunStatusBodySchema = z.object({
  status: z.enum(['RUNNING', 'PASSED', 'FAILED', 'CANCELLED']),
  completedAt: z.string().datetime({ offset: true }).optional(),
});

export const TestStepSchema = z.object({
  stepNumber: z.number().int().min(0),
  action: z.string().min(1),
  expected: z.string().optional(),
  actual: z.string().optional(),
  status: z.enum(['PASSED', 'FAILED', 'SKIPPED']),
});

export const RecordTestResultSchema = z.object({
  testName: z.string().min(1),
  status: z.enum(['PASSED', 'FAILED', 'SKIPPED']),
  errorMessage: z.string().optional(),
  steps: z.array(TestStepSchema).optional(),
});

export const RecordTestResultsBodySchema = z.object({
  results: z.array(RecordTestResultSchema).min(1),
});

export type ProjectIdParams = z.infer<typeof ProjectIdParamsSchema>;
export type RunIdParams = z.infer<typeof RunIdParamsSchema>;
export type TriggerTestRunBody = z.infer<typeof TriggerTestRunBodySchema>;
export type ListRunsQuery = z.infer<typeof ListRunsQuerySchema>;
export type UpdateRunStatusBody = z.infer<typeof UpdateRunStatusBodySchema>;
export type TestStep = z.infer<typeof TestStepSchema>;
export type RecordTestResult = z.infer<typeof RecordTestResultSchema>;
export type RecordTestResultsBody = z.infer<typeof RecordTestResultsBodySchema>;
