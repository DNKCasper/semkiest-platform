/**
 * RequestBuilder — constructs HTTP requests for API testing.
 *
 * Handles request building with support for authentication, variable substitution,
 * and GraphQL query payload construction.
 */

import { EndpointDefinition, AuthConfig } from './types';

/**
 * Built request ready for execution.
 */
export interface BuiltRequest {
  /** Request URL with substituted variables. */
  url: string;
  /** HTTP method. */
  method: string;
  /** Request headers. */
  headers: Record<string, string>;
  /** Request body (stringified if present). */
  body?: string;
}

/**
 * RequestBuilder constructs HTTP requests from endpoint definitions
 * with support for authentication, variable substitution, and GraphQL.
 */
export class RequestBuilder {
  /**
   * Build a complete request from an endpoint definition and optional auth.
   *
   * @param endpoint The endpoint definition.
   * @param auth Optional authentication configuration.
   * @param variables Optional variable map for path/body substitution (e.g., {id: "123"}).
   * @returns The built request ready for execution.
   */
  buildRequest(
    endpoint: EndpointDefinition,
    auth?: AuthConfig,
    variables: Record<string, string> = {}
  ): BuiltRequest {
    const headers = this.buildHeaders(endpoint, auth);
    let url = this.buildUrl(endpoint, variables);
    let body: string | undefined;

    if (endpoint.protocol === 'graphql') {
      body = this.buildGraphQLBody(endpoint, variables);
    } else if (endpoint.body) {
      body = this.substituteVariables(JSON.stringify(endpoint.body), variables);
    }

    return {
      url,
      method: endpoint.method,
      headers,
      body,
    };
  }

  /**
   * Build headers for the request, including authentication.
   *
   * @param endpoint The endpoint definition.
   * @param auth Optional authentication configuration.
   * @returns The complete headers object.
   */
  private buildHeaders(endpoint: EndpointDefinition, auth?: AuthConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': '@semkiest/api-agent/1.0.0',
      ...endpoint.headers,
    };

    if (auth) {
      this.applyAuthentication(headers, auth);
    }

    return headers;
  }

  /**
   * Apply authentication to request headers based on strategy.
   *
   * @param headers The headers object to modify.
   * @param auth The authentication configuration.
   */
  private applyAuthentication(headers: Record<string, string>, auth: AuthConfig): void {
    const { strategy, credentials } = auth;

    switch (strategy) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${credentials.token}`;
        break;
      case 'api-key':
        const headerName = credentials.headerName || 'X-API-Key';
        headers[headerName] = credentials.apiKey || '';
        break;
      case 'basic':
        const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
        break;
      case 'oauth2':
        headers['Authorization'] = `Bearer ${credentials.accessToken}`;
        break;
      case 'cookie':
        headers['Cookie'] = credentials.cookie || '';
        break;
      case 'none':
      default:
        // No authentication
        break;
    }
  }

  /**
   * Build the URL with query parameters and variable substitution.
   *
   * @param endpoint The endpoint definition.
   * @param variables Variable map for substitution.
   * @returns The complete URL with query string.
   */
  private buildUrl(endpoint: EndpointDefinition, variables: Record<string, string>): string {
    let url = this.substituteVariables(endpoint.url, variables);

    if (endpoint.queryParams && Object.keys(endpoint.queryParams).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(endpoint.queryParams)) {
        params.append(key, this.substituteVariables(value, variables));
      }
      url += `?${params.toString()}`;
    }

    return url;
  }

  /**
   * Build a GraphQL request body from an endpoint definition.
   *
   * @param endpoint The endpoint definition (protocol must be 'graphql').
   * @param variables Variable map for substitution.
   * @returns The GraphQL query JSON string.
   */
  private buildGraphQLBody(endpoint: EndpointDefinition, variables: Record<string, string>): string {
    // If endpoint.body already contains a query, use it
    if (endpoint.body && typeof endpoint.body === 'object') {
      const body = endpoint.body as Record<string, unknown>;
      if (body.query) {
        return JSON.stringify({
          query: this.substituteVariables(body.query as string, variables),
          variables: body.variables || {},
        });
      }
    }

    // Build a minimal introspection query if no query provided
    const query = `
      query {
        __schema {
          types {
            name
          }
        }
      }
    `;

    return JSON.stringify({
      query: query.trim(),
      variables: {},
    });
  }

  /**
   * Substitute variables in a string using {varName} syntax.
   *
   * @param input The input string with {variable} placeholders.
   * @param variables The variable map.
   * @returns The string with variables substituted.
   */
  private substituteVariables(input: string, variables: Record<string, string>): string {
    let result = input;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }
    return result;
  }
}
