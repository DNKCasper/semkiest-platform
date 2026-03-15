import type { BaseJobPayload } from './types';

/** Payload for API testing agent jobs */
export interface ApiTestJobPayload extends BaseJobPayload {
  /** Base URL for API under test */
  baseUrl: string;
  /** Path to OpenAPI/Swagger specification (URL or file path) */
  openApiSpec?: string;
  /** GraphQL endpoint URL */
  graphqlEndpoint?: string;
  /** Explicit endpoint definitions to test */
  endpoints?: Array<{
    url: string;
    method: string;
    body?: unknown;
    headers?: Record<string, string>;
  }>;
  /** Authentication strategy */
  auth?: {
    strategy: 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2' | 'cookie';
    credentials: Record<string, string>;
  };
  /** Whether to generate edge case tests */
  generateEdgeCases?: boolean;
  /** Maximum concurrent requests (default: 5) */
  maxConcurrency?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/** BullMQ queue name for API test jobs */
export const API_TEST_QUEUE = 'api-test' as const;
