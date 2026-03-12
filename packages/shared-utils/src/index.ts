/**
 * @semkiest/shared-utils
 * Shared utility functions for the SemkiEst platform.
 */

import type { PaginatedResponse, PaginationParams } from '@semkiest/shared-types';

// ─── Pagination ─────────────────────────────────────────────────────────────

/**
 * Normalizes pagination parameters with sensible defaults.
 */
export function normalizePagination(params: PaginationParams): Required<PaginationParams> {
  return {
    page: Math.max(1, params.page ?? 1),
    pageSize: Math.min(100, Math.max(1, params.pageSize ?? 20)),
  };
}

/**
 * Builds a paginated response object.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  params: Required<PaginationParams>
): PaginatedResponse<T> {
  return {
    data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}

// ─── String Utilities ────────────────────────────────────────────────────────

/**
 * Converts a string to slug format (lowercase, hyphens).
 */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Type Guards ─────────────────────────────────────────────────────────────

/**
 * Asserts a value is not null or undefined.
 */
export function assertDefined<T>(value: T | null | undefined, name = 'value'): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${name} to be defined, got ${String(value)}`);
  }
  return value;
}
