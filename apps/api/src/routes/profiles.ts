import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { profileService } from '../services/profile-service';
import { AppError } from '../middleware/error-handler';
import type {
  CreateProfileInput,
  UpdateProfileInput,
  DuplicateProfileInput,
  ProfileQueryParams,
  ProfileTemplateType,
} from '@semkiest/shared-types';

export const profilesRouter = Router();

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

const viewportSchema = z.object({
  width: z.number().int().min(1).max(7680),
  height: z.number().int().min(1).max(4320),
  name: z.string().min(1).max(64),
});

const smokeConfigSchema = z.object({
  enabled: z.boolean(),
});

const regressionConfigSchema = z.object({
  enabled: z.boolean(),
  browsers: z.array(z.enum(['chromium', 'firefox', 'webkit'])).optional(),
  viewports: z.array(viewportSchema).optional(),
});

const performanceThresholdsSchema = z.object({
  p95ResponseTimeMs: z.number().positive().optional(),
  errorRatePercent: z.number().min(0).max(100).optional(),
  requestsPerSecond: z.number().positive().optional(),
});

const performanceConfigSchema = z.object({
  enabled: z.boolean(),
  concurrentUsers: z.number().int().min(1).max(10000).optional(),
  rampUpSeconds: z.number().int().min(0).optional(),
  holdSeconds: z.number().int().min(1).optional(),
  thresholds: performanceThresholdsSchema.optional(),
});

const accessibilityConfigSchema = z.object({
  enabled: z.boolean(),
  wcagLevel: z.enum(['A', 'AA', 'AAA']).optional(),
  includeWarnings: z.boolean().optional(),
});

const testCategoriesSchema = z.object({
  smoke: smokeConfigSchema.optional(),
  regression: regressionConfigSchema.optional(),
  performance: performanceConfigSchema.optional(),
  accessibility: accessibilityConfigSchema.optional(),
});

const emailNotificationSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).optional(),
  onSuccess: z.boolean().optional(),
  onFailure: z.boolean().optional(),
});

const slackNotificationSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().optional(),
  channel: z.string().optional(),
  onSuccess: z.boolean().optional(),
  onFailure: z.boolean().optional(),
});

const webhookNotificationSchema = z.object({
  enabled: z.boolean(),
  url: z.string(),
  secret: z.string().optional(),
  onSuccess: z.boolean().optional(),
  onFailure: z.boolean().optional(),
});

const notificationPreferencesSchema = z.object({
  email: emailNotificationSchema.optional(),
  slack: slackNotificationSchema.optional(),
  webhooks: z.array(webhookNotificationSchema).optional(),
});

const autoRunTriggersSchema = z.object({
  onDeploy: z.boolean().optional(),
  onPullRequest: z.boolean().optional(),
  onSchedule: z.boolean().optional(),
  deployEnvironments: z.array(z.string()).optional(),
  pullRequestBranches: z.array(z.string()).optional(),
});

const profileTemplateTypeValues = [
  'smoke-test',
  'full-regression',
  'performance-only',
  'accessibility-audit',
] as const;

const createProfileSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  isTemplate: z.boolean().optional(),
  templateType: z.enum(profileTemplateTypeValues).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  testCategories: testCategoriesSchema.optional(),
  cronExpression: z.string().max(100).optional(),
  notificationPreferences: notificationPreferencesSchema.optional(),
  autoRunTriggers: autoRunTriggersSchema.optional(),
  changeNote: z.string().max(500).optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  isDefault: z.boolean().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  testCategories: testCategoriesSchema.optional(),
  cronExpression: z.string().max(100).nullable().optional(),
  notificationPreferences: notificationPreferencesSchema.nullable().optional(),
  autoRunTriggers: autoRunTriggersSchema.nullable().optional(),
  changeNote: z.string().max(500).optional(),
});

const duplicateProfileSchema = z.object({
  targetProjectId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  variableSubstitutions: z.record(z.string()).optional(),
});

const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  tags: z.string().max(500).optional(),
  templateType: z.enum(profileTemplateTypeValues).optional(),
  isTemplate: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  isDefault: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1))
    .optional(),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

const createFromTemplateBodySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  testCategories: testCategoriesSchema.optional(),
  cronExpression: z.string().max(100).optional(),
  notificationPreferences: notificationPreferencesSchema.optional(),
  autoRunTriggers: autoRunTriggersSchema.optional(),
});

// ---------------------------------------------------------------------------
// Validation middleware helper
// ---------------------------------------------------------------------------

function validateBody<T extends z.ZodTypeAny>(
  schema: T,
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details));
      return;
    }
    req.body = result.data as z.infer<T>;
    next();
  };
}

function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      next(new AppError(400, 'Invalid query parameters', 'VALIDATION_ERROR', details));
      return;
    }
    (req as Request & { parsedQuery: unknown }).parsedQuery = result.data;
    next();
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/profiles
 * List profiles with optional filtering and pagination.
 */
profilesRouter.get(
  '/',
  validateQuery(listQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req as Request & { parsedQuery: ProfileQueryParams }).parsedQuery;
      const result = await profileService.listProfiles(query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/profiles/templates
 * List all available built-in profile templates.
 */
profilesRouter.get('/templates', (_req: Request, res: Response): void => {
  const templates = profileService.listTemplates();
  res.json({ templates });
});

/**
 * POST /api/profiles/from-template/:templateType
 * Create a new profile from a built-in template.
 */
profilesRouter.post(
  '/from-template/:templateType',
  validateBody(createFromTemplateBodySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { templateType } = req.params;
      const { projectId, ...overrides } = req.body as z.infer<typeof createFromTemplateBodySchema>;
      const profile = await profileService.createFromTemplate(
        templateType as ProfileTemplateType,
        projectId,
        overrides,
      );
      res.status(201).json(profile);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/profiles/:id
 * Get a single profile by ID.
 */
profilesRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await profileService.getProfile(req.params.id);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/profiles
 * Create a new profile.
 */
profilesRouter.post(
  '/',
  validateBody(createProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as CreateProfileInput;
      const profile = await profileService.createProfile(input);
      res.status(201).json(profile);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/profiles/:id
 * Update an existing profile. Records a version snapshot.
 */
profilesRouter.put(
  '/:id',
  validateBody(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as UpdateProfileInput;
      const profile = await profileService.updateProfile(req.params.id, input);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/profiles/:id
 * Delete a profile.
 */
profilesRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await profileService.deleteProfile(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/profiles/:id/versions
 * List all historical versions for a profile.
 */
profilesRouter.get(
  '/:id/versions',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versions = await profileService.getProfileVersions(req.params.id);
      res.json({ versions });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/profiles/:id/versions/:versionId/revert
 * Revert a profile to a specific historical version.
 */
profilesRouter.post(
  '/:id/versions/:versionId/revert',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await profileService.revertToVersion(
        req.params.id,
        req.params.versionId,
      );
      res.json(profile);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/profiles/:id/duplicate
 * Duplicate a profile to another project with optional variable substitution.
 */
profilesRouter.post(
  '/:id/duplicate',
  validateBody(duplicateProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as DuplicateProfileInput;
      const profile = await profileService.duplicateProfile(req.params.id, input);
      res.status(201).json(profile);
    } catch (err) {
      next(err);
    }
  },
);
