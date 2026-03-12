/**
 * @semkiest/shared-types
 * Shared TypeScript type definitions for the SemkiEst platform.
 */

// ─── Common ────────────────────────────────────────────────────────────────

/** ISO-8601 date-time string */
export type ISODateString = string;

/** Pagination parameters */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Standard API error shape */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Standard API response wrapper */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };
