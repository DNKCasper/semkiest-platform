import type {
  Project,
  ProjectListResponse,
  ProjectQueryParams,
  CreateProjectInput,
  UpdateProjectInput,
  ApiError,
} from '../types/project';
import type {
  Report,
  ReportListResponse,
  GenerateReportInput,
  ScheduleConfig,
  CreateScheduleInput,
  UpdateScheduleInput,
  OrgReportResponse,
} from '../types/report';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let error: ApiError;
    try {
      error = (await response.json()) as ApiError;
    } catch {
      error = { message: `HTTP error ${response.status}` };
    }
    throw new ApiClientError(response.status, error);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildQueryString(params: ProjectQueryParams): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '',
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `?${qs}`;
}

/** Project API methods */
export const projectsApi = {
  /** GET /api/projects */
  list(params: ProjectQueryParams = {}): Promise<ProjectListResponse> {
    return request<ProjectListResponse>(
      `/api/projects${buildQueryString(params)}`,
    );
  },

  /** GET /api/projects/:id */
  get(id: string): Promise<Project> {
    return request<Project>(`/api/projects/${id}`);
  },

  /** POST /api/projects */
  create(input: CreateProjectInput): Promise<Project> {
    return request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** PUT /api/projects/:id */
  update(id: string, input: UpdateProjectInput): Promise<Project> {
    return request<Project>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** DELETE /api/projects/:id */
  delete(id: string): Promise<void> {
    return request<void>(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  },
};

/** Reports API methods */
export const reportsApi = {
  /** GET /api/projects/:projectId/reports */
  list(projectId: string, page = 1, pageSize = 20): Promise<ReportListResponse> {
    return request<ReportListResponse>(
      `/api/projects/${projectId}/reports?page=${page}&pageSize=${pageSize}`,
    );
  },

  /** GET /api/reports/:id */
  get(id: string): Promise<Report> {
    return request<Report>(`/api/reports/${id}`);
  },

  /** POST /api/projects/:projectId/reports */
  generate(input: GenerateReportInput): Promise<Report> {
    return request<Report>(`/api/projects/${input.projectId}/reports`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** DELETE /api/reports/:id */
  delete(id: string): Promise<void> {
    return request<void>(`/api/reports/${id}`, { method: 'DELETE' });
  },

  /** GET /api/projects/:projectId/reports/schedules */
  listSchedules(projectId: string): Promise<ScheduleConfig[]> {
    return request<ScheduleConfig[]>(`/api/projects/${projectId}/reports/schedules`);
  },

  /** POST /api/projects/:projectId/reports/schedules */
  createSchedule(input: CreateScheduleInput): Promise<ScheduleConfig> {
    return request<ScheduleConfig>(
      `/api/projects/${input.projectId}/reports/schedules`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  /** PUT /api/reports/schedules/:id */
  updateSchedule(id: string, input: UpdateScheduleInput): Promise<ScheduleConfig> {
    return request<ScheduleConfig>(`/api/reports/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** DELETE /api/reports/schedules/:id */
  deleteSchedule(id: string): Promise<void> {
    return request<void>(`/api/reports/schedules/${id}`, { method: 'DELETE' });
  },

  /** GET /api/admin/reports/org */
  getOrgReport(): Promise<OrgReportResponse> {
    return request<OrgReportResponse>('/api/admin/reports/org');
  },
};

export { ApiClientError };
