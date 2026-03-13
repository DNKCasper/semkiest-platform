import type {
  Project,
  ProjectListResponse,
  ProjectQueryParams,
  CreateProjectInput,
  UpdateProjectInput,
  ApiError,
} from '../types/project';
import type {
  TestRun,
  RunDetail,
  TestRunListResponse,
  TestRunQueryParams,
  TriggerRunInput,
  TestProfile,
} from '../types/run';

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

/** Test profile API methods */
export const profilesApi = {
  /** GET /api/projects/:projectId/profiles */
  list(projectId: string): Promise<TestProfile[]> {
    return request<TestProfile[]>(`/api/projects/${projectId}/profiles`);
  },

  /** GET /api/projects/:projectId/profiles/:id */
  get(projectId: string, id: string): Promise<TestProfile> {
    return request<TestProfile>(`/api/projects/${projectId}/profiles/${id}`);
  },
};

/** Test run API methods */
export const runsApi = {
  /** GET /api/projects/:projectId/runs */
  list(projectId: string, params: TestRunQueryParams = {}): Promise<TestRunListResponse> {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
    const qs =
      entries.length > 0
        ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`
        : '';
    return request<TestRunListResponse>(`/api/projects/${projectId}/runs${qs}`);
  },

  /** GET /api/projects/:projectId/runs/:runId */
  get(projectId: string, runId: string): Promise<RunDetail> {
    return request<RunDetail>(`/api/projects/${projectId}/runs/${runId}`);
  },

  /** POST /api/projects/:projectId/runs — trigger a new run */
  trigger(projectId: string, input: TriggerRunInput): Promise<TestRun> {
    return request<TestRun>(`/api/projects/${projectId}/runs`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** POST /api/projects/:projectId/runs/:runId/cancel */
  cancel(projectId: string, runId: string): Promise<void> {
    return request<void>(`/api/projects/${projectId}/runs/${runId}/cancel`, {
      method: 'POST',
    });
  },
};

export { ApiClientError };
