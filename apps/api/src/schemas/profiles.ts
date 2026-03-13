import { z } from 'zod';

export const ProfileParamsSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
});

export const ProjectParamsSchema = z.object({
  id: z.string().min(1),
});

export const ListProfilesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  name: z.string().optional(),
  sortBy: z.enum(['name', 'created_at', 'updated_at']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  createdAfter: z.string().datetime({ offset: true }).optional(),
  createdBefore: z.string().datetime({ offset: true }).optional(),
});

export const CreateProfileBodySchema = z.object({
  name: z.string().min(1).max(255),
  config: z.record(z.unknown()).default({}),
});

export const UpdateProfileBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type ProfileParams = z.infer<typeof ProfileParamsSchema>;
export type ListProfilesQuery = z.infer<typeof ListProfilesQuerySchema>;
export type CreateProfileBody = z.infer<typeof CreateProfileBodySchema>;
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
