/** Default number of items per page */
export const DEFAULT_LIMIT = 20;

/** Maximum number of items per page */
export const MAX_LIMIT = 100;

/** Pagination query parameters */
export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Build pagination metadata for list responses.
 */
export function buildPaginationMeta(
  total: number,
  limit: number,
  offset: number,
): { total: number; limit: number; offset: number; hasMore: boolean } {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}
