import type { ApprovalStatus, BoundingBox, VisualTestResult } from '../components/visual-diff/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApprovalApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApprovalApiError';
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
    let message = `HTTP error ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // keep default message
    }
    throw new ApprovalApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface ApprovalResult {
  id: string;
  status: ApprovalStatus;
  updatedAt: string;
}

export interface BatchApprovalInput {
  ids: string[];
  status: 'approved' | 'rejected';
  comment?: string;
}

export interface BatchApprovalResult {
  updated: number;
  results: ApprovalResult[];
}

/** Approval Workflow API — corresponds to SEM-72 */
export const approvalApi = {
  /** GET /api/visual-tests/:testRunId/results */
  listResults(testRunId: string): Promise<VisualTestResult[]> {
    return request<VisualTestResult[]>(`/api/visual-tests/${testRunId}/results`);
  },

  /** GET /api/visual-tests/results/:id */
  getResult(id: string): Promise<VisualTestResult> {
    return request<VisualTestResult>(`/api/visual-tests/results/${id}`);
  },

  /** POST /api/visual-tests/results/:id/approve */
  approve(id: string, comment?: string): Promise<ApprovalResult> {
    return request<ApprovalResult>(`/api/visual-tests/results/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  /** POST /api/visual-tests/results/:id/reject */
  reject(id: string, comment?: string): Promise<ApprovalResult> {
    return request<ApprovalResult>(`/api/visual-tests/results/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  /** POST /api/visual-tests/results/batch */
  batchUpdate(input: BatchApprovalInput): Promise<BatchApprovalResult> {
    return request<BatchApprovalResult>('/api/visual-tests/results/batch', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

export type { ApprovalStatus, BoundingBox, VisualTestResult };
