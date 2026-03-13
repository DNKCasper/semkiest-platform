import type {
  Project,
  ProjectListResponse,
  ProjectQueryParams,
  CreateProjectInput,
  UpdateProjectInput,
  ApiError,
} from '../types/project';
import type {
  TestProfile,
  ProfileListResponse,
  ProfileQueryParams,
  CreateProfileInput,
  UpdateProfileInput,
  CloneProfileInput,
} from '../types/profile';

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

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
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

/** Profile API methods */
export const profilesApi = {
  /** GET /api/projects/:projectId/profiles */
  list(
    projectId: string,
    params: ProfileQueryParams = {},
  ): Promise<ProfileListResponse> {
    return request<ProfileListResponse>(
      `/api/projects/${projectId}/profiles${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`,
    );
  },

  /** GET /api/projects/:projectId/profiles/:id */
  get(projectId: string, id: string): Promise<TestProfile> {
    return request<TestProfile>(`/api/projects/${projectId}/profiles/${id}`);
  },

  /** POST /api/projects/:projectId/profiles */
  create(
    projectId: string,
    input: CreateProfileInput,
  ): Promise<TestProfile> {
    return request<TestProfile>(`/api/projects/${projectId}/profiles`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** PUT /api/projects/:projectId/profiles/:id */
  update(
    projectId: string,
    id: string,
    input: UpdateProfileInput,
  ): Promise<TestProfile> {
    return request<TestProfile>(
      `/api/projects/${projectId}/profiles/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    );
  },

  /** DELETE /api/projects/:projectId/profiles/:id */
  delete(projectId: string, id: string): Promise<void> {
    return request<void>(`/api/projects/${projectId}/profiles/${id}`, {
      method: 'DELETE',
    });
  },

  /** POST /api/projects/:projectId/profiles/:id/clone */
  clone(
    projectId: string,
    id: string,
    input: CloneProfileInput,
  ): Promise<TestProfile> {
    return request<TestProfile>(
      `/api/projects/${projectId}/profiles/${id}/clone`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },
};

export { ApiClientError };
