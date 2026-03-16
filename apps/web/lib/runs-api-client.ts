import type {
  TestRun,
  RunListResponse,
  RunQueryParams,
  RunTrendResponse,
  TriggerRunInput,
  CategoryResults,
  TestCategory,
  RunSummary,
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

// ---------------------------------------------------------------------------
// Data transformation helpers
// ---------------------------------------------------------------------------

/** Map Prisma result status → frontend display status */
function mapResultStatus(status: string): 'pass' | 'fail' | 'warning' | 'skip' {
  switch (status?.toUpperCase()) {
    case 'PASSED': return 'pass';
    case 'FAILED': return 'fail';
    case 'WARNING': return 'warning';
    case 'SKIPPED': return 'skip';
    default: return 'skip';
  }
}

/** Infer a test category from the test name. */
function inferCategory(testName: string): TestCategory {
  const lower = testName.toLowerCase();
  if (lower.includes('visual') || lower.includes('screenshot') || lower.includes('baseline')) return 'visual';
  if (lower.includes('performance') || lower.includes('speed') || lower.includes('load time')) return 'performance';
  if (lower.includes('accessibility') || lower.includes('a11y') || lower.includes('wcag')) return 'accessibility';
  if (lower.includes('security') || lower.includes('auth') || lower.includes('xss')) return 'security';
  if (lower.includes('api') || lower.includes('endpoint') || lower.includes('contract')) return 'api';
  return 'ui'; // default category
}

/** Build category groups from a flat testResults array. */
function buildCategories(testResults: any[]): CategoryResults[] {
  if (!testResults || testResults.length === 0) return [];

  const categoryMap = new Map<TestCategory, CategoryResults>();

  for (const tr of testResults) {
    const cat = inferCategory(tr.testName ?? '');

    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, {
        category: cat,
        stats: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 },
        results: [],
      });
    }

    const group = categoryMap.get(cat)!;
    const displayStatus = mapResultStatus(tr.status);

    group.results.push({
      id: tr.id,
      name: tr.testName ?? 'Unnamed test',
      description: tr.errorMessage ? `Error: ${tr.errorMessage}` : undefined,
      status: displayStatus,
      severity: displayStatus === 'fail' ? 'high' : displayStatus === 'warning' ? 'medium' : 'info',
      error: tr.errorMessage ?? undefined,
      category: cat,
      duration: tr.duration ?? 0,
    });

    group.stats.total += 1;
    if (displayStatus === 'pass') group.stats.passed += 1;
    else if (displayStatus === 'fail') group.stats.failed += 1;
    else if (displayStatus === 'warning') group.stats.warnings += 1;
    else if (displayStatus === 'skip') group.stats.skipped += 1;
  }

  return Array.from(categoryMap.values());
}

/** Build a RunSummary from raw API data. */
function buildSummary(raw: any): RunSummary {
  return {
    total: raw.totalTests ?? 0,
    passed: raw.passedTests ?? 0,
    failed: raw.failedTests ?? 0,
    warnings: 0,
    skipped: raw.skippedTests ?? 0,
    duration: raw.duration ?? 0,
  };
}

/**
 * Normalise a raw run object returned by the API so it matches the
 * frontend `TestRun` shape (lowercase status, 0-1 passRate, categories, etc.).
 */
function normalizeRun(raw: any): TestRun {
  const totalTests = raw.totalTests ?? 0;
  const passedTests = raw.passedTests ?? 0;
  const failedTests = raw.failedTests ?? 0;
  const skippedTests = raw.skippedTests ?? 0;
  const startedAt = raw.startedAt ?? raw.createdAt ?? new Date().toISOString();

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
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    completedTests: passedTests + failedTests + skippedTests,
    duration: raw.duration ?? 0,
    // triggerType may be absent from the DB – default to 'manual'
    triggerType: raw.triggerType?.toLowerCase() ?? 'manual',
    // startedAt may be null – fall back to createdAt
    startedAt,
    // triggeredAt is an alias used by the run-detail page
    triggeredAt: startedAt,
    // Computed fields for the run-detail page
    summary: buildSummary(raw),
    categories: buildCategories(raw.testResults ?? []),
    // Profile info
    profile: raw.testProfile
      ? { id: raw.testProfile.id, name: raw.testProfile.name }
      : undefined,
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
