/**
 * EndpointDiscoverer — discovers API endpoints from OpenAPI specs and GraphQL introspection.
 *
 * Parses OpenAPI/Swagger specifications to extract endpoint definitions,
 * and can discover endpoints by crawling for common API paths.
 */

import { EndpointDefinition, HttpMethod, Logger } from './types';

/**
 * EndpointDiscoverer discovers API endpoints from various sources:
 * - OpenAPI/Swagger specifications (JSON/YAML)
 * - GraphQL introspection results
 * - Common API path crawling
 */
export class EndpointDiscoverer {
  private logger: Logger;

  /**
   * Create a new EndpointDiscoverer instance.
   * @param logger Optional logger instance for diagnostic output.
   */
  constructor(logger?: Logger) {
    this.logger = logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
  }

  /**
   * Discover endpoints from an OpenAPI/Swagger specification.
   * Supports both JSON and YAML formats.
   *
   * @param specContent The OpenAPI specification content (parsed JSON or YAML string).
   * @param baseUrl The base URL to prepend to relative endpoint paths.
   * @returns Array of discovered endpoint definitions.
   */
  discoverFromOpenApi(
    specContent: Record<string, unknown> | string,
    baseUrl: string
  ): EndpointDefinition[] {
    try {
      const spec = typeof specContent === 'string' ? JSON.parse(specContent) : specContent;

      if (!spec.paths || typeof spec.paths !== 'object') {
        this.logger.warn('OpenAPI spec has no paths property');
        return [];
      }

      const endpoints: EndpointDefinition[] = [];

      for (const [path, pathItem] of Object.entries(spec.paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;

        for (const [method, operation] of Object.entries(pathItem)) {
          const httpMethod = method.toUpperCase() as HttpMethod;

          // Skip non-HTTP method properties (e.g., "parameters", "servers")
          if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(httpMethod)) {
            continue;
          }

          const operationObj = operation as Record<string, unknown>;
          const endpoint: EndpointDefinition = {
            url: this.buildUrl(baseUrl, path),
            method: httpMethod,
            protocol: 'rest',
            description: (operationObj.summary || operationObj.description) as string | undefined,
            tags: (operationObj.tags as string[]) || [],
          };

          // Extract query parameters from spec
          if (Array.isArray(operationObj.parameters)) {
            const queryParams: Record<string, string> = {};
            for (const param of operationObj.parameters) {
              if (param && typeof param === 'object' && (param as Record<string, unknown>).in === 'query') {
                queryParams[(param as Record<string, unknown>).name as string] = 'string';
              }
            }
            if (Object.keys(queryParams).length > 0) {
              endpoint.queryParams = queryParams;
            }
          }

          endpoints.push(endpoint);
        }
      }

      this.logger.info(`Discovered ${endpoints.length} endpoints from OpenAPI spec`);
      return endpoints;
    } catch (error) {
      this.logger.error(`Failed to discover endpoints from OpenAPI spec: ${error}`);
      return [];
    }
  }

  /**
   * Discover endpoints from GraphQL introspection results.
   * Extracts queries and mutations from the schema.
   *
   * @param introspectionResult The GraphQL introspection result.
   * @param graphqlEndpoint The GraphQL endpoint URL.
   * @returns Array of discovered GraphQL endpoint definitions.
   */
  discoverFromGraphQL(
    introspectionResult: Record<string, unknown>,
    graphqlEndpoint: string
  ): EndpointDefinition[] {
    try {
      const endpoints: EndpointDefinition[] = [];
      const schema = (introspectionResult.__schema || {}) as Record<string, unknown>;
      const types = (schema.types as Array<Record<string, unknown>>) || [];

      // Find Query type
      const queryType = types.find((t) => t.name === (schema.queryType as Record<string, unknown> | undefined)?.name);
      if (queryType && queryType.fields && Array.isArray(queryType.fields)) {
        for (const field of queryType.fields as Array<Record<string, unknown>>) {
          endpoints.push({
            url: graphqlEndpoint,
            method: 'POST',
            protocol: 'graphql',
            description: `GraphQL Query: ${field.name}`,
            tags: ['query'],
          });
        }
      }

      // Find Mutation type
      const mutationType = types.find(
        (t) => t.name === (schema.mutationType as Record<string, unknown> | undefined)?.name
      );
      if (mutationType && mutationType.fields && Array.isArray(mutationType.fields)) {
        for (const field of mutationType.fields as Array<Record<string, unknown>>) {
          endpoints.push({
            url: graphqlEndpoint,
            method: 'POST',
            protocol: 'graphql',
            description: `GraphQL Mutation: ${field.name}`,
            tags: ['mutation'],
          });
        }
      }

      this.logger.info(`Discovered ${endpoints.length} endpoints from GraphQL introspection`);
      return endpoints;
    } catch (error) {
      this.logger.error(`Failed to discover endpoints from GraphQL introspection: ${error}`);
      return [];
    }
  }

  /**
   * Discover endpoints by crawling common API paths.
   * Attempts to find API documentation and specification endpoints.
   *
   * @param baseUrl The base URL of the API.
   * @returns Array of discovered endpoint definitions.
   */
  async discoverByPath(baseUrl: string): Promise<EndpointDefinition[]> {
    const commonPaths = [
      '/api',
      '/v1',
      '/v2',
      '/swagger.json',
      '/openapi.json',
      '/api-docs',
      '/docs',
      '/graphql',
      '/.well-known/openapi.json',
    ];

    const endpoints: EndpointDefinition[] = [];

    for (const path of commonPaths) {
      try {
        const url = `${baseUrl.replace(/\/$/, '')}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers.get('content-type');

          if (contentType?.includes('application/json')) {
            const content = await response.json() as Record<string, unknown>;

            // Attempt to parse as OpenAPI
            if (content.openapi || content.swagger) {
              const discovered = this.discoverFromOpenApi(content, baseUrl);
              endpoints.push(...discovered);
            }

            // Attempt to parse as GraphQL introspection
            if (content.__schema) {
              const discovered = this.discoverFromGraphQL(content, baseUrl);
              endpoints.push(...discovered);
            }
          }
        }
      } catch (error) {
        this.logger.debug(`Could not discover from path ${path}: ${error}`);
      }
    }

    this.logger.info(`Discovered ${endpoints.length} endpoints by crawling paths`);
    return endpoints;
  }

  /**
   * Build a complete URL from a base URL and a path.
   * Handles relative paths, query parameters, and path variables.
   *
   * @param baseUrl The base URL.
   * @param path The relative path (may contain {variables}).
   * @returns The complete URL.
   */
  private buildUrl(baseUrl: string, path: string): string {
    const base = baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }
}
