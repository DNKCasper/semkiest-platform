/**
 * Standard success response envelope
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/**
 * Standard error response envelope
 */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

/**
 * Paginated response envelope
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Pagination metadata included in list responses
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * User roles for access control
 */
export type UserRole = 'VIEWER' | 'MEMBER' | 'MANAGER' | 'ADMIN';

/**
 * Project status values
 */
export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

/**
 * Authenticated user payload attached to requests
 */
export interface AuthUser {
  id: string;
  orgId: string;
  role: UserRole;
  email: string;
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';
