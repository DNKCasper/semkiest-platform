/**
 * ApiAgent — main orchestrator for API testing.
 *
 * Discovers endpoints, generates test cases, executes tests,
 * and aggregates results with comprehensive statistics.
 */

import {
  ApiAgentConfig,
  ApiAgentResult,
  ApiTestCase,
  ApiTestResult,
  EndpointDefinition,
  TestSummary,
  Logger,
} from './types';
import { EndpointDiscoverer } from './endpoint-discoverer';
import { TestExecutor } from './test-executor';
import { EdgeCaseGenerator } from './edge-case-generator';

/**
 * ApiAgent orchestrates REST and GraphQL API testing.
 * Discovers endpoints, generates test cases, executes tests, and aggregates results.
 */
export class ApiAgent {
  private config: ApiAgentConfig;
  private logger: Logger;
  private discoverer: EndpointDiscoverer;
  private executor: TestExecutor;
  private edgeCaseGenerator: EdgeCaseGenerator;

  /**
   * Create a new ApiAgent instance.
   *
   * @param config The agent configuration.
   * @param logger Optional logger instance.
   */
  constructor(config: ApiAgentConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };

    this.discoverer = new EndpointDiscoverer(this.logger);
    this.executor = new TestExecutor(
      this.config.maxConcurrency || 5,
      this.config.timeout || 30000,
      this.logger
    );
    this.edgeCaseGenerator = new EdgeCaseGenerator(this.logger);
  }

  /**
   * Run the API testing agent.
   * Discovers endpoints, generates test cases, executes tests, and returns results.
   *
   * @returns The aggregated test results.
   */
  async run(): Promise<ApiAgentResult> {
    this.logger.info('Starting API Agent');

    // Step 1: Discover endpoints
    let endpoints = [...(this.config.endpoints || [])];
    let endpointsDiscovered = endpoints.length;

    if (this.config.openApiSpec) {
      this.logger.info('Discovering endpoints from OpenAPI spec');
      const discoveredFromOpenApi = this.discoverFromOpenApiSpec(this.config.openApiSpec);
      endpoints.push(...discoveredFromOpenApi);
      endpointsDiscovered += discoveredFromOpenApi.length;
    }

    if (this.config.graphqlEndpoint) {
      this.logger.info('Discovering GraphQL endpoints');
      const discoveredFromGraphQL = await this.discoverGraphQLEndpoints();
      endpoints.push(...discoveredFromGraphQL);
      endpointsDiscovered += discoveredFromGraphQL.length;
    }

    if (endpoints.length === 0) {
      this.logger.warn('No endpoints discovered; attempting path crawling');
      endpoints = await this.discoverer.discoverByPath(this.config.baseUrl);
      endpointsDiscovered = endpoints.length;
    }

    this.logger.info(`Discovered ${endpointsDiscovered} endpoints`);

    // Step 2: Generate test cases
    let testCases = this.generateTestCases(endpoints);
    const edgeCasesGenerated = this.config.generateEdgeCases !== false ? testCases.length : 0;

    this.logger.info(`Generated ${testCases.length} test cases`);

    // Step 3: Execute tests
    const results = await this.executor.executeTests(testCases);

    // Step 4: Aggregate results
    const summary = this.aggregateResults(results);

    this.logger.info(
      `Test execution completed: ${summary.passed} passed, ${summary.failed} failed out of ${summary.total}`
    );

    return {
      tests: results,
      summary,
      edgeCasesGenerated,
      endpointsDiscovered,
    };
  }

  /**
   * Discover endpoints from an OpenAPI specification file.
   *
   * @param specPath Path to the OpenAPI spec file (JSON or YAML).
   * @returns Discovered endpoint definitions.
   */
  private discoverFromOpenApiSpec(specPath: string): EndpointDefinition[] {
    try {
      // In a real implementation, read from filesystem or URL
      // For now, return empty array as placeholder
      this.logger.debug(`Reading OpenAPI spec from ${specPath}`);
      return [];
    } catch (error) {
      this.logger.error(`Failed to discover endpoints from OpenAPI spec: ${error}`);
      return [];
    }
  }

  /**
   * Discover GraphQL endpoints via introspection.
   *
   * @returns Discovered GraphQL endpoint definitions.
   */
  private async discoverGraphQLEndpoints(): Promise<EndpointDefinition[]> {
    if (!this.config.graphqlEndpoint) {
      return [];
    }

    try {
      // Send introspection query
      const introspectionQuery = `
        query {
          __schema {
            queryType { name }
            mutationType { name }
            types {
              name
              fields { name }
            }
          }
        }
      `;

      const response = await fetch(this.config.graphqlEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: introspectionQuery }),
      });

      if (!response.ok) {
        this.logger.warn(`GraphQL introspection returned status ${response.status}`);
        return [];
      }

      const result = (await response.json()) as Record<string, unknown>;
      return this.discoverer.discoverFromGraphQL(result, this.config.graphqlEndpoint);
    } catch (error) {
      this.logger.error(`Failed to discover GraphQL endpoints: ${error}`);
      return [];
    }
  }

  /**
   * Generate test cases from endpoint definitions.
   *
   * @param endpoints The endpoints to test.
   * @returns Array of test cases (including edge cases if enabled).
   */
  private generateTestCases(endpoints: EndpointDefinition[]): ApiTestCase[] {
    const testCases: ApiTestCase[] = [];
    let caseIndex = 0;

    for (const endpoint of endpoints) {
      // Create basic functional test case
      const basicTestCase: ApiTestCase = {
        id: `test-${caseIndex++}`,
        name: `${endpoint.method} ${endpoint.url}`,
        endpoint,
        expectedStatus: endpoint.method === 'POST' ? [200, 201] : [200, 404],
        assertions: [
          {
            type: 'status',
            expected: endpoint.method === 'POST' ? [200, 201] : [200, 404],
            message: 'Returns expected status code',
          },
        ],
        category: 'functional',
        priority: 'high',
      };

      testCases.push(basicTestCase);

      // Generate edge cases if enabled
      if (this.config.generateEdgeCases !== false) {
        const edgeCases = this.edgeCaseGenerator.generateEdgeCases(
          endpoint,
          `edge-${caseIndex}`
        );
        testCases.push(...edgeCases);
        caseIndex += edgeCases.length;
      }
    }

    return testCases;
  }

  /**
   * Aggregate test results and compute summary statistics.
   *
   * @param results The test execution results.
   * @returns Aggregated summary statistics.
   */
  private aggregateResults(results: ApiTestResult[]): TestSummary {
    const responseTimes = results
      .filter((r) => r.responseTimeMs > 0)
      .map((r) => r.responseTimeMs)
      .sort((a, b) => a - b);

    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;

    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);

    const p95ResponseTime = responseTimes[p95Index] || 0;
    const p99ResponseTime = responseTimes[p99Index] || 0;

    return {
      total,
      passed,
      failed,
      skipped: 0,
      avgResponseTime,
      p95ResponseTime,
      p99ResponseTime,
    };
  }
}
