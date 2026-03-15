/**
 * Project domain types for the SemkiEst platform.
 * Aligned with Prisma schema: id, orgId, name, description, url, status, deletedAt, createdAt, updatedAt
 */

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export interface Project {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  url?: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating a new project. */
export interface CreateProjectInput {
  name: string;
  description?: string;
  url?: string;
}

/** Payload for updating an existing project. */
export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  url?: string | null;
  status?: ProjectStatus;
}

export interface ProjectListResponse {
  data: Project[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ProjectQueryParams {
  limit?: number;
  offset?: number;
  status?: ProjectStatus;
  name?: string;
  sortBy?: 'name' | 'created_at' | 'updated_at';
  sortDir?: 'asc' | 'desc';
}

/** API error response shape. */
export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}
