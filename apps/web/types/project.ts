/**
 * Project domain types for the SemkiEst platform.
 */

export type EnvironmentType = 'development' | 'staging' | 'production';

export type ProjectStatus = 'active' | 'inactive' | 'archived';

export interface Project {
  id: string;
  name: string;
  description?: string;
  urls: string[];
  environment: EnvironmentType;
  status: ProjectStatus;
  tags: string[];
  owner?: string;
  team?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  stats: ProjectStats;
}

export interface ProjectStats {
  totalRuns: number;
  passRate: number;
  totalTests: number;
}

/** Payload for creating a new project. */
export interface CreateProjectInput {
  name: string;
  description?: string;
  urls: string[];
  environment: EnvironmentType;
  tags?: string[];
  owner?: string;
  team?: string;
}

/** Payload for updating an existing project. */
export interface UpdateProjectInput {
  name?: string;
  description?: string;
  urls?: string[];
  environment?: EnvironmentType;
  tags?: string[];
  owner?: string;
  team?: string;
  status?: ProjectStatus;
}

export interface ProjectListResponse {
  data: Project[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProjectFilters {
  search?: string;
  environment?: EnvironmentType;
  status?: ProjectStatus;
  dateFrom?: string;
  dateTo?: string;
}

export type ProjectSortField = 'name' | 'createdAt' | 'lastRunAt';
export type SortDirection = 'asc' | 'desc';

export interface ProjectSortOptions {
  field: ProjectSortField;
  direction: SortDirection;
}

export interface ProjectQueryParams extends ProjectFilters {
  page?: number;
  pageSize?: number;
  sort?: ProjectSortField;
  sortDir?: SortDirection;
}

/** API error response shape. */
export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}
