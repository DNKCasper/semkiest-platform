import type {
  TestRun,
  RunListResponse,
  RunQueryParams,
  RunTrendResponse,
} from '../types/run';
import type { ApiError } from '../types/project';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class RunsApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'RunsApiClientError';
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
    throw new RunsApiClientError(response.status, error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildQueryString(params: RunQueryParams): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '' && v !== 'all',
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `?${qs}`;
}

/** Test run API methods */
export const runsApi = {
  /** GET /api/projects/:projectId/runs */
  list(
    projectId: string,
    params: RunQueryParams = {},
  ): Promise<RunListResponse> {
    return request<RunListResponse>(
      `/api/projects/${projectId}/runs${buildQueryString(params)}`,
    );
  },

  /** GET /api/projects/:projectId/runs/:runId */
  get(projectId: string, runId: string): Promise<TestRun> {
    return request<TestRun>(`/api/projects/${projectId}/runs/${runId}`);
  },

  /**
   * GET /api/projects/:projectId/runs/trend
   * Returns the last 10 runs' pass-rate data points for trend visualization.
   */
  trend(projectId: string): Promise<RunTrendResponse> {
    return request<RunTrendResponse>(
      `/api/projects/${projectId}/runs/trend`,
    );
  },
};
