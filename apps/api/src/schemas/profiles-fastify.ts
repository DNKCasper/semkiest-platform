import { z } from 'zod';
import { ProjectIdParamsSchema } from './runs';

/**
 * Params schema for profile operations with projectId and profileId
 */
export const ProfileIdParamsSchema = z.object({
  projectId: z.string().min(1),
  profileId: z.string().min(1),
});

/**
 * Query params schema for listing profiles
 */
export const ListProfilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Body schema for creating a profile
 */
export const CreateProfileBodySchema = z.object({
  name: z.string().min(1).max(255),
  config: z.record(z.any()).optional().default({}),
});

/**
 * Body schema for updating a profile
 */
export const UpdateProfileBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.any()).optional(),
});

// Export ProjectIdParamsSchema from runs for reuse
export { ProjectIdParamsSchema };

// Type exports
export type ProfileIdParams = z.infer<typeof ProfileIdParamsSchema>;
export type ProjectIdParams = z.infer<typeof ProjectIdParamsSchema>;
export type ListProfilesQuery = z.infer<typeof ListProfilesQuerySchema>;
export type CreateProfileBody = z.infer<typeof CreateProfileBodySchema>;
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
