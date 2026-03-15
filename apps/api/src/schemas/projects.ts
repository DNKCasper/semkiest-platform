import { z } from 'zod';

export const ProjectParamsSchema = z.object({
  id: z.string().min(1),
});

export const ListProjectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  name: z.string().optional(),
  sortBy: z.enum(['name', 'created_at', 'updated_at']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  createdAfter: z.string().datetime({ offset: true }).optional(),
  createdBefore: z.string().datetime({ offset: true }).optional(),
});

export const CreateProjectBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  url: z
    .string()
    .max(2048)
    .optional()
    .transform((v) => {
      if (!v || v.trim() === '') return undefined;
      // Auto-prepend https:// if no protocol is specified
      if (!/^https?:\/\//i.test(v)) return `https://${v}`;
      return v;
    }),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
});

export const UpdateProjectBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).nullable().optional(),
    url: z
      .string()
      .max(2048)
      .nullable()
      .optional()
      .transform((v) => {
        if (v === null || v === undefined) return v;
        if (v.trim() === '') return null;
        if (!/^https?:\/\//i.test(v)) return `https://${v}`;
        return v;
      }),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type ProjectParams = z.infer<typeof ProjectParamsSchema>;
export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof UpdateProjectBodySchema>;
