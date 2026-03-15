/**
 * @semkiest/api-agent — API Testing Agent package.
 *
 * Public API surface for REST and GraphQL API testing with endpoint discovery,
 * test execution, and edge case generation.
 */

export { ApiAgent } from './api-agent';
export { EndpointDiscoverer } from './endpoint-discoverer';
export { RequestBuilder } from './request-builder';
export { AssertionEngine } from './assertion-engine';
export { EdgeCaseGenerator } from './edge-case-generator';
export { TestExecutor } from './test-executor';

export type {
  // HTTP and protocol types
  HttpMethod,
  ApiProtocol,

  // Authentication
  AuthStrategy,
  AuthConfig,

  // Endpoint definition
  EndpointDefinition,

  // Assertions and test cases
  Assertion,
  AssertionType,
  TestCategory,
  TestPriority,
  ApiTestCase,

  // Assertion results
  AssertionResult,

  // Test execution results
  ApiTestResult,

  // Summary statistics
  TestSummary,

  // Agent configuration and results
  ApiAgentConfig,
  ApiAgentResult,

  // Logger
  Logger,
} from './types';
