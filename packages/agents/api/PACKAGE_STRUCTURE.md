# API Testing Agent Package Structure

## Package Overview

The API Testing Agent (`@semkiest/api-agent`) is a comprehensive TypeScript package for testing REST and GraphQL API endpoints. It provides endpoint discovery, request building, assertion evaluation, edge case generation, and concurrent test execution.

## Directory Structure

```
packages/agents/api/
├── package.json           # Package metadata and dependencies
├── tsconfig.json          # TypeScript configuration
├── src/
│   ├── index.ts                      # Public API exports
│   ├── types.ts                      # Type definitions (400+ lines)
│   ├── endpoint-discoverer.ts        # OpenAPI/GraphQL discovery
│   ├── request-builder.ts            # HTTP request construction
│   ├── assertion-engine.ts           # Response validation
│   ├── edge-case-generator.ts        # Edge case test generation
│   ├── test-executor.ts              # Test execution engine
│   ├── api-agent.ts                  # Main orchestrator
│   └── api-agent.test.ts             # Comprehensive unit tests
└── dist/                 # Generated (build output)
```

## File Descriptions

### Configuration Files

**package.json** (949 bytes)
- Package name: `@semkiest/api-agent`
- Version: 0.0.0 (follows monorepo pattern)
- Scripts: build, dev, test, typecheck, lint, clean
- Dependencies: zod (validation)
- DevDependencies: TypeScript, tsup, Jest, testing utilities

**tsconfig.json** (344 bytes)
- Extends shared config: `../../../packages/shared-config/tsconfig/node.json`
- Includes src files, excludes dist and test files
- Defines rootDir and outDir for TypeScript compilation

### Source Files

**types.ts** (8.3 KB)
Comprehensive type definitions covering:
- HTTP and Protocol Types:
  - `HttpMethod`: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
  - `ApiProtocol`: 'rest' | 'graphql'
  - `AuthStrategy`: 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2' | 'cookie'

- Core Data Structures:
  - `EndpointDefinition`: Complete endpoint description with URL, method, headers, body, query params
  - `ApiTestCase`: Test case with endpoint, expected status, assertions, category, priority
  - `Assertion`: Single validation with type, path, expected value, message
  - `AssertionType`: 9 assertion types (status, header, body-contains, body-schema, response-time, content-type, not-empty, array-length, json-path)
  - `TestCategory`: 'smoke' | 'functional' | 'edge-case' | 'integration' | 'security' | 'performance'

- Results and Feedback:
  - `AssertionResult`: Individual assertion evaluation result
  - `ApiTestResult`: Complete test execution result with status, body, response time, headers
  - `TestSummary`: Aggregated statistics (total, passed, failed, avg/p95/p99 response times)

- Configuration and Output:
  - `ApiAgentConfig`: Agent configuration with baseUrl, endpoints, OpenAPI spec, GraphQL endpoint, auth, timeout, concurrency
  - `ApiAgentResult`: Final result containing tests array, summary, edge cases generated, endpoints discovered

- Logging:
  - `Logger`: Minimal interface for info/warn/error/debug logging

**endpoint-discoverer.ts** (7.5 KB)
Class for discovering API endpoints:
- `discoverFromOpenApi()`: Parses OpenAPI/Swagger specs (JSON/YAML) to extract endpoints
  - Extracts paths, HTTP methods, descriptions, tags
  - Builds complete URLs from base URL and path definitions
  - Supports query parameters from spec definitions

- `discoverFromGraphQL()`: Extracts queries and mutations from GraphQL introspection
  - Discovers Query type fields as endpoints
  - Discovers Mutation type fields as endpoints
  - Creates POST-based GraphQL endpoints

- `discoverByPath()`: Crawls common API paths for specs
  - Checks: /api, /v1, /v2, /swagger.json, /openapi.json, /api-docs, /docs, /graphql, /.well-known/openapi.json
  - Auto-detects OpenAPI and GraphQL specs
  - Returns discovered endpoints

**request-builder.ts** (5.6 KB)
Class for constructing HTTP requests:
- `buildRequest()`: Creates complete request from endpoint definition
  - Handles variable substitution in URLs and bodies ({id}, {name}, etc.)
  - Applies authentication headers (bearer, api-key, basic, oauth2, cookie)
  - Constructs query parameters
  - Builds GraphQL query payloads

- `buildHeaders()`: Merges default headers with endpoint-specific headers
- `applyAuthentication()`: Applies auth strategy to headers
- `buildUrl()`: Handles URL construction with query params and variable substitution
- `buildGraphQLBody()`: Creates GraphQL request with query and variables

**assertion-engine.ts** (11 KB)
Class for evaluating assertions against responses:
- `evaluateAssertions()`: Evaluates array of assertions
- Supports 9 assertion types:
  - **status**: Validate HTTP status code (single or array)
  - **header**: Check header presence/value
  - **body-contains**: Search response for string
  - **body-schema**: Basic object property validation
  - **response-time**: Check response time threshold
  - **content-type**: Validate Content-Type header
  - **not-empty**: Ensure value is present
  - **array-length**: Validate array length
  - **json-path**: Extract and validate value using dot notation (e.g., "data.user.id")

- `extractJsonPath()`: Supports nested object access via dot notation
- Returns detailed results with actual vs. expected values

**edge-case-generator.ts** (8.4 KB)
Class for generating edge case test variants:
- `generateEdgeCases()`: Creates variants for POST/PUT/PATCH endpoints
- Strategies generate 15+ edge case variants:
  1. Empty body
  2. Null body
  3. Missing required fields (first 3)
  4. Invalid types (first 2 fields)
  5. SQL injection payloads (5 variants, 2 executed)
  6. XSS payloads (5 variants, 2 executed)
  7. Oversized payload (10MB)
  8. Special characters (4 variants, 2 executed)
  9. Duplicate submission (idempotency)
  10. All-null payload

- Each edge case includes appropriate expected status codes (400, 422, 500)
- Marked as 'edge-case' category with 'medium' priority

**test-executor.ts** (5.2 KB)
Class for executing test cases:
- `executeTests()`: Concurrent test execution with configurable concurrency
  - Respects maxConcurrency limit (default 5)
  - Uses Promise.race for efficient concurrency
  - Captures timing information

- `executeTest()`: Individual test execution
  - Builds request using RequestBuilder
  - Sends request with timeout support
  - Captures status code, headers, body
  - Auto-detects JSON vs. text responses
  - Evaluates assertions using AssertionEngine
  - Returns complete ApiTestResult

- Timeout handling via AbortController
- Response parsing for JSON and text content types

**api-agent.ts** (7.5 KB)
Main orchestrator class:
- `run()`: Main execution orchestrator
  - Discovers endpoints (predefined, OpenAPI, GraphQL, path crawling)
  - Generates test cases (functional + edge cases if enabled)
  - Executes tests concurrently
  - Aggregates results and statistics

- `discoverFromOpenApiSpec()`: File-based OpenAPI discovery
- `discoverGraphQLEndpoints()`: GraphQL introspection discovery
- `generateTestCases()`: Creates functional + edge case tests
- `aggregateResults()`: Computes summary statistics
  - Calculates: total, passed, failed, skipped
  - Computes: average, 95th percentile, 99th percentile response times

**index.ts** (1.1 KB)
Public API exports:
- Exports all 6 main classes
- Exports all 20+ type definitions
- Clean, documented interface

**api-agent.test.ts** (13 KB)
Comprehensive test suite:
- 40+ test cases covering:
  - EndpointDiscoverer: OpenAPI parsing, GraphQL introspection
  - RequestBuilder: Basic requests, auth (bearer, basic), variable substitution, query params, request bodies
  - AssertionEngine: All 9 assertion types (status, header, body, response-time, content-type, array-length, not-empty, json-path)
  - EdgeCaseGenerator: Edge case generation, empty/missing/invalid variants, GET method skip
  - TestExecutor: Single and concurrent execution, concurrency limits
  - Integration tests: Discovery + generation, request building + execution

- Tests use httpbin.org for realistic HTTP testing
- Comprehensive assertions on test results

## Key Features

### Endpoint Discovery
- **OpenAPI/Swagger**: Parses specifications to extract all endpoints
- **GraphQL**: Introspection-based discovery of queries and mutations
- **Path Crawling**: Automatic discovery of common API paths
- **Predefined**: Support for manually specified endpoints

### Test Case Generation
- **Functional Tests**: One per endpoint with basic assertions
- **Edge Cases**: 15+ variants per POST/PUT/PATCH endpoint
  - Input validation (empty, null, missing fields)
  - Type safety (invalid types)
  - Security (SQL injection, XSS)
  - Performance (oversized payloads)
  - Idempotency (duplicate submissions)

### Request Building
- **HTTP Methods**: All standard methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- **Authentication**: Bearer tokens, API keys, basic auth, OAuth2, cookies
- **Variable Substitution**: {varName} in URLs and request bodies
- **Query Parameters**: Automatic URL-encoded query string construction
- **GraphQL**: Automatic query payload construction

### Assertion Engine
- **Status Code**: Single value or array of acceptable codes
- **Headers**: Check header presence and value
- **Body Content**: String search in response
- **JSON Path**: Nested object access and validation (e.g., "user.profile.email")
- **Schema**: Basic property validation
- **Performance**: Response time thresholds
- **Content Type**: Verify expected MIME types
- **Arrays**: Validate array length
- **Presence**: Ensure values are not empty

### Concurrent Execution
- Configurable concurrency (default 5 requests)
- Efficient Promise-based scheduling
- Per-request timeout (default 30 seconds)
- Response time measurement

### Statistics & Reporting
- Total, passed, failed, skipped counts
- Average response time
- 95th percentile response time
- 99th percentile response time
- Per-test assertion results
- Error messages and diagnostics

## Build & Development

### Scripts
- `npm run build`: Build TypeScript to dist/ (CJS and ESM)
- `npm run dev`: Watch mode development
- `npm run test`: Run Jest test suite
- `npm run typecheck`: Type-check without emitting
- `npm run lint`: ESLint validation
- `npm run clean`: Remove dist and coverage

### TypeScript Compilation
- Target: ES2020+ via shared config
- Module: CommonJS and ESM (dual output)
- Strict: Full strict mode enabled
- Declaration files (.d.ts) auto-generated

## Dependencies

### Production
- **zod** ^3.23.0: Schema validation (imported but available for future use)

### Development
- **typescript** ^5.4.0: Type checking
- **tsup** ^8.0.0: Build tool
- **jest** ^29.7.0: Testing framework
- **ts-jest** ^29.1.0: Jest TypeScript support
- **@types/node** ^20.0.0: Node.js type definitions

## Integration Points

- Compatible with monorepo build system
- Follows established patterns from explorer agent
- Uses shared TypeScript configuration
- Integrates with Jest test infrastructure
- Supports pnpm workspace

## Usage Example

```typescript
import { ApiAgent, ApiAgentConfig } from '@semkiest/api-agent';

const config: ApiAgentConfig = {
  baseUrl: 'https://api.example.com/v1',
  openApiSpec: '/path/to/openapi.json',
  auth: {
    strategy: 'bearer',
    credentials: { token: 'your-token' }
  },
  generateEdgeCases: true,
  maxConcurrency: 10
};

const agent = new ApiAgent(config, console);
const results = await agent.run();

console.log(`Passed: ${results.summary.passed}/${results.summary.total}`);
console.log(`Avg Response Time: ${results.summary.avgResponseTime}ms`);
```

## Code Quality

- Comprehensive JSDoc comments on all public methods
- Proper TypeScript strict mode
- Full test coverage with 40+ test cases
- Error handling and logging throughout
- Consistent code style matching explorer agent patterns
