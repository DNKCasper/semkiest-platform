import type {
  TestRun,
  RunListResponse,
  RunQueryParams,
  RunTrendResponse,
  TriggerRunInput,
} from '../types/run';
import type { ApiError } from '../types/project';
import { getStoredTokens, isTokenExpired } from './auth-service';

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

/**
 * Normalise a raw run object returned by the API so it matches the
 * frontend `TestRun` shape (lowercase status, 0-1 passRate, etc.).
 */
function normalizeRun(raw: any): TestRun {
  return {
    ...raw,
    // Prisma returns UPPER_CASE status – frontend uses lower case
    status: typeof raw.status === 'string' ? raw.status.toLowerCase() : raw.status,
    // API returns passRate as 0-100 integer; frontend expects 0-1 ratio
    passRate:
      raw.passRate != null && raw.passRate > 1
        ? raw.passRate / 100
        : raw.passRate ?? 0,
    // Ensure numeric fields have sane defaults
    totalTests: raw.totalTests ?? 0,
    passedTests: raw.passedTests ?? 0,
    failedTests: raw.failedTests ?? 0,
    skippedTests: raw.skippedTests ?? 0,
    duration: raw.duration ?? 0,
    // triggerType may be absent from the DB – default to 'manual'
    triggerType: raw.triggerType?.toLowerCase() ?? 'manual',
    // startedAt may be null – fall back to createdAt
    startedAt: raw.startedAt ?? raw.createdAt ?? new Date().toISOString(),
  };
}

/** Test run API methods */
export const runsApi = {
  /** GET /api/projects/:projectId/runs */
  async list(
    projectId: string,
    params: RunQueryParams = {},
  ): Promise<RunListResponse> {
    // The API returns { data: [...], pagination: { total, page, pageSize, hasMore } }
    // but RunListResponse expects { data, total, page, pageSize } flat.
    const raw = await request<any>(
      `/api/projects/${projectId}/runs${buildQueryString(params)}`,
    );
    return {
      data: (raw.data ?? []).map(normalizeRun),
      total: raw.pagination?.total ?? raw.total ?? 0,
      page: raw.pagination?.page ?? raw.page ?? 1,
      pageSize: raw.pagination?.pageSize ?? raw.pageSize ?? 20,
    };
  },

  /** GET /api/projects/:projectId/runs/:runId */
  async get(projectId: string, runId: string): Promise<TestRun> {
    const raw = await request<any>(`/api/projects/${projectId}/runs/${runId}`);
    // Single-run responses are wrapped in { data: {...} }
    return normalizeRun(raw.data ?? raw);
  },

  /**
   * GET /api/projects/:projectId/runs/trend
   * Returns the last 10 runs' pass-rate data points for trend visualization.
   */
  async trend(projectId: string): Promise<RunTrendResponse> {
    const raw = await request<any>(
      `/api/projects/${projectId}/runs/trend`,
    );
    // Normalise passRate from 0-100 → 0-1
    const data = (raw.data ?? []).map((point: any) => ({
      ...point,
      passRate:
        point.passRate != null && point.passRate > 1
          ? point.passRate / 100
          : point.passRate ?? 0,
    }));
    return { data };
  },

  /** POST /api/projects/:projectId/runs — trigger a new test run */
  async trigger(projectId: string, input: TriggerRunInput): Promise<TestRun> {
    const raw = await request<any>(`/api/projects/${projectId}/runs`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return normalizeRun(raw.data ?? raw);
  },
};
