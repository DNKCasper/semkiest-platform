import type {
  TestProfile,
  CreateProfileInput,
  UpdateProfileInput,
} from '../types/profile';
import type { ApiError } from '../types/project';
import { getStoredTokens, isTokenExpired } from './auth-service';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ProfilesApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'ProfilesApiClientError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  // Attach auth token if available
  const tokens = getStoredTokens();
  if (tokens && !isTokenExpired(tokens)) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let error: ApiError;
    try {
      error = (await response.json()) as ApiError;
    } catch {
      error = { message: `HTTP error ${response.status}` };
    }
    throw new ProfilesApiClientError(response.status, error);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** Test profile API methods */
export const profilesApi = {
  /** GET /api/projects/:projectId/profiles */
  list(projectId: string): Promise<{ data: TestProfile[] }> {
    return request<{ data: TestProfile[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/profiles`,
    );
  },

  /** GET /api/projects/:projectId/profiles/:id */
  get(projectId: string, id: string): Promise<TestProfile> {
    return request<TestProfile>(
      `/api/projects/${encodeURIComponent(projectId)}/profiles/${encodeURIComponent(id)}`,
    );
  },

  /** POST /api/projects/:projectId/profiles */
  create(projectId: string, input: CreateProfileInput): Promise<TestProfile> {
    return request<TestProfile>(
      `/api/projects/${encodeURIComponent(projectId)}/profiles`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },

  /** PUT /api/projects/:projectId/profiles/:id */
  update(
    projectId: string,
    id: string,
    input: UpdateProfileInput,
  ): Promise<TestProfile> {
    return request<TestProfile>(
      `/api/projects/${encodeURIComponent(projectId)}/profiles/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    );
  },

  /** DELETE /api/projects/:projectId/profiles/:id */
  delete(projectId: string, id: string): Promise<void> {
    return request<void>(
      `/api/projects/${encodeURIComponent(projectId)}/profiles/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
  },
};
