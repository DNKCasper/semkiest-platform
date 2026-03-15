/**
 * Type definitions for the API Testing Agent.
 *
 * Supports REST and GraphQL API testing with comprehensive assertion,
 * edge case generation, and performance measurement capabilities.
 */

// ---------------------------------------------------------------------------
// HTTP and API Protocol Types
// ---------------------------------------------------------------------------

/**
 * Supported HTTP methods for REST API endpoints.
 */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

/**
 * Supported API protocol types.
 */
export type ApiProtocol = 'rest' | 'graphql';

// ---------------------------------------------------------------------------
// Authentication Configuration
// ---------------------------------------------------------------------------

/**
 * Supported authentication strategies for API testing.
 */
export type AuthStrategy = 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2' | 'cookie';

/**
 * Authentication configuration for API requests.
 * Provides strategy and credentials for different auth mechanisms.
 */
export interface AuthConfig {
  strategy: AuthStrategy;
  credentials: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Endpoint Definition
// ---------------------------------------------------------------------------

/**
 * Definition of an API endpoint to be tested.
 * Contains the URL, HTTP method, protocol type, and optional metadata.
 */
export interface EndpointDefinition {
  /** Absolute URL of the API endpoint. */
  url: string;
  /** HTTP method (GET, POST, etc.). For GraphQL, typically POST. */
  method: HttpMethod;
  /** API protocol: REST or GraphQL. */
  protocol: ApiProtocol;
  /** Optional HTTP headers to include in requests (e.g., custom headers, content-type overrides). */
  headers?: Record<string, string>;
  /** Optional request body (for POST, PUT, PATCH methods). */
  body?: unknown;
  /** Optional URL query parameters. */
  queryParams?: Record<string, string>;
  /** Human-readable description of the endpoint. */
  description?: string;
  /** Tags for categorization (e.g., "user", "auth", "payments"). */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Assertions and Test Cases
// ---------------------------------------------------------------------------

/**
 * Types of assertions that can be performed on API responses.
 */
export type AssertionType =
  | 'status'
  | 'header'
  | 'body-contains'
  | 'body-schema'
  | 'response-time'
  | 'content-type'
  | 'not-empty'
  | 'array-length'
  | 'json-path';

/**
 * Single assertion to validate against an API response.
 */
export interface Assertion {
  /** Type of assertion to perform. */
  type: AssertionType;
  /** Optional JSON path for body or schema assertions (e.g., "data.user.id"). */
  path?: string;
  /** Expected value for comparison. */
  expected?: unknown;
  /** Human-readable assertion message. */
  message: string;
}

/**
 * Test categories for API test cases.
 */
export type TestCategory = 'smoke' | 'functional' | 'edge-case' | 'integration' | 'security' | 'performance';

/**
 * Priority level for test execution.
 */
export type TestPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * A single API test case with endpoint, assertions, and metadata.
 */
export interface ApiTestCase {
  /** Unique identifier for the test case. */
  id: string;
  /** Human-readable test case name. */
  name: string;
  /** Endpoint definition to test. */
  endpoint: EndpointDefinition;
  /** Expected HTTP status code(s). Can be a single code or array of acceptable codes. */
  expectedStatus: number | number[];
  /** Optional JSON Schema for response body validation. */
  expectedSchema?: Record<string, unknown>;
  /** Array of assertions to evaluate. */
  assertions: Assertion[];
  /** Category of the test case. */
  category: TestCategory;
  /** Priority level for execution. */
  priority: TestPriority;
}

// ---------------------------------------------------------------------------
// Assertion Results
// ---------------------------------------------------------------------------

/**
 * Result of a single assertion evaluation.
 */
export interface AssertionResult {
  /** The assertion that was evaluated. */
  assertion: Assertion;
  /** Whether the assertion passed. */
  passed: boolean;
  /** The actual value observed from the response (if applicable). */
  actual?: unknown;
  /** Human-readable message describing the result. */
  message: string;
}

// ---------------------------------------------------------------------------
// Test Execution Results
// ---------------------------------------------------------------------------

/**
 * Result of executing a single API test case.
 */
export interface ApiTestResult {
  /** The test case that was executed. */
  testCase: ApiTestCase;
  /** Overall test pass/fail status. */
  passed: boolean;
  /** Actual HTTP status code received. */
  actualStatus: number;
  /** Actual response body received. */
  actualBody: unknown;
  /** Time taken to receive response in milliseconds. */
  responseTimeMs: number;
  /** Response headers received. */
  responseHeaders: Record<string, string>;
  /** Results of individual assertions. */
  assertions: AssertionResult[];
  /** Error message (only populated if test failed unexpectedly). */
  error?: string;
}

// ---------------------------------------------------------------------------
// Summary Statistics
// ---------------------------------------------------------------------------

/**
 * Aggregated statistics for a test run.
 */
export interface TestSummary {
  /** Total number of tests executed. */
  total: number;
  /** Number of tests that passed. */
  passed: number;
  /** Number of tests that failed. */
  failed: number;
  /** Number of tests that were skipped. */
  skipped: number;
  /** Average response time across all tests in milliseconds. */
  avgResponseTime: number;
  /** 95th percentile response time in milliseconds. */
  p95ResponseTime: number;
  /** 99th percentile response time in milliseconds. */
  p99ResponseTime: number;
}

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the API Agent.
 * Controls endpoint discovery, authentication, concurrency, and edge case generation.
 */
export interface ApiAgentConfig {
  /** Base URL for the API (e.g., "https://api.example.com/v1"). */
  baseUrl: string;
  /** Predefined endpoint definitions to test (optional). */
  endpoints?: EndpointDefinition[];
  /** Path to OpenAPI/Swagger specification file (JSON or YAML). */
  openApiSpec?: string;
  /** GraphQL endpoint URL (if testing GraphQL). */
  graphqlEndpoint?: string;
  /** Authentication configuration for requests. */
  auth?: AuthConfig;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Whether to automatically generate edge case test variants. Defaults to true. */
  generateEdgeCases?: boolean;
  /** Maximum number of concurrent requests. Defaults to 5. */
  maxConcurrency?: number;
}

// ---------------------------------------------------------------------------
// Agent Results
// ---------------------------------------------------------------------------

/**
 * Result object returned by the API Agent after test execution.
 */
export interface ApiAgentResult {
  /** Array of all test execution results. */
  tests: ApiTestResult[];
  /** Summary statistics across all tests. */
  summary: TestSummary;
  /** Number of edge case variants generated. */
  edgeCasesGenerated: number;
  /** Number of unique endpoints discovered. */
  endpointsDiscovered: number;
}

// ---------------------------------------------------------------------------
// Logger Interface
// ---------------------------------------------------------------------------

/**
 * Minimal logging interface accepted by API Agent components.
 * Compatible with console, pino, winston, etc.
 */
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}
