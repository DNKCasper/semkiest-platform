/**
 * EdgeCaseGenerator — generates edge case test variants for API endpoints.
 *
 * Creates test cases with edge cases such as empty bodies, missing fields,
 * invalid types, SQL injection payloads, XSS payloads, and more.
 */

import { EndpointDefinition, ApiTestCase, Assertion, Logger } from './types';

/**
 * EdgeCaseGenerator generates edge case test variants from endpoint definitions.
 */
export class EdgeCaseGenerator {
  private logger: Logger;
  private sqlInjectionPayloads = [
    "' OR '1'='1",
    '"; DROP TABLE users; --',
    "1 UNION SELECT NULL, NULL --",
    "admin' --",
    "' OR 1=1 --",
  ];

  private xssPayloads = [
    '<script>alert("xss")</script>',
    '"><script>alert("xss")</script>',
    '<img src=x onerror="alert(\'xss\')">',
    '<svg onload="alert(\'xss\')">',
    'javascript:alert("xss")',
  ];

  private specialCharacters = ['!@#$%^&*()', '\0\n\r\t', '\\\\', '""', "''", '{}[]'];

  /**
   * Create a new EdgeCaseGenerator instance.
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
   * Generate edge case test variants from an endpoint definition.
   *
   * @param endpoint The endpoint to generate edge cases for.
   * @param baseId Optional base ID for generated test cases.
   * @returns Array of edge case test variants.
   */
  generateEdgeCases(endpoint: EndpointDefinition, baseId: string = 'edge'): ApiTestCase[] {
    const cases: ApiTestCase[] = [];

    // Only generate edge cases for POST, PUT, PATCH methods
    if (!['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      this.logger.debug(`Skipping edge case generation for ${endpoint.method} ${endpoint.url}`);
      return cases;
    }

    let caseIndex = 0;

    // Empty body
    cases.push(
      this.createEdgeCaseTestCase(
        endpoint,
        `${baseId}-empty-body-${caseIndex++}`,
        'Empty request body',
        {},
        [{ type: 'status', expected: [400, 422, 500], message: 'Handles empty body' }]
      )
    );

    // Null body
    cases.push(
      this.createEdgeCaseTestCase(
        endpoint,
        `${baseId}-null-body-${caseIndex++}`,
        'Null request body',
        null,
        [{ type: 'status', expected: [400, 422, 500], message: 'Handles null body' }]
      )
    );

    // Missing required fields
    if (endpoint.body && typeof endpoint.body === 'object' && !Array.isArray(endpoint.body)) {
      const bodyObj = endpoint.body as Record<string, unknown>;
      for (const key of Object.keys(bodyObj).slice(0, 3)) {
        // Limit to first 3 fields
        const modifiedBody = { ...bodyObj };
        delete modifiedBody[key];

        cases.push(
          this.createEdgeCaseTestCase(
            endpoint,
            `${baseId}-missing-${key}-${caseIndex++}`,
            `Missing required field: ${key}`,
            modifiedBody,
            [{ type: 'status', expected: [400, 422], message: `Validates presence of ${key}` }]
          )
        );
      }
    }

    // Invalid types
    if (endpoint.body && typeof endpoint.body === 'object' && !Array.isArray(endpoint.body)) {
      const bodyObj = endpoint.body as Record<string, unknown>;
      for (const key of Object.keys(bodyObj).slice(0, 2)) {
        // Limit to first 2 fields
        const modifiedBody = { ...bodyObj, [key]: 'invalid-non-matching-type' };

        cases.push(
          this.createEdgeCaseTestCase(
            endpoint,
            `${baseId}-invalid-type-${key}-${caseIndex++}`,
            `Invalid type for field: ${key}`,
            modifiedBody,
            [{ type: 'status', expected: [400, 422], message: `Validates type of ${key}` }]
          )
        );
      }
    }

    // SQL injection payloads
    if (endpoint.body && typeof endpoint.body === 'object' && !Array.isArray(endpoint.body)) {
      const bodyObj = endpoint.body as Record<string, unknown>;
      const firstKey = Object.keys(bodyObj)[0];

      if (firstKey) {
        for (const payload of this.sqlInjectionPayloads.slice(0, 2)) {
          cases.push(
            this.createEdgeCaseTestCase(
              endpoint,
              `${baseId}-sql-injection-${caseIndex++}`,
              'SQL injection payload attempt',
              { ...bodyObj, [firstKey]: payload },
              [
                {
                  type: 'status',
                  expected: [400, 422, 500],
                  message: 'Safely handles SQL injection attempt',
                },
              ]
            )
          );
        }
      }
    }

    // XSS payloads
    if (endpoint.body && typeof endpoint.body === 'object' && !Array.isArray(endpoint.body)) {
      const bodyObj = endpoint.body as Record<string, unknown>;
      const firstKey = Object.keys(bodyObj)[0];

      if (firstKey) {
        for (const payload of this.xssPayloads.slice(0, 2)) {
          cases.push(
            this.createEdgeCaseTestCase(
              endpoint,
              `${baseId}-xss-${caseIndex++}`,
              'XSS payload attempt',
              { ...bodyObj, [firstKey]: payload },
              [{ type: 'status', expected: [400, 422, 500], message: 'Safely handles XSS attempt' }]
            )
          );
        }
      }
    }

    // Oversized payload
    const largePayload = { data: 'x'.repeat(1024 * 1024 * 10) }; // 10MB string
    cases.push(
      this.createEdgeCaseTestCase(
        endpoint,
        `${baseId}-oversized-${caseIndex++}`,
        'Oversized request payload',
        largePayload,
        [{ type: 'status', expected: [400, 413, 422, 500], message: 'Handles oversized payload' }]
      )
    );

    // Special characters
    if (endpoint.body && typeof endpoint.body === 'object' && !Array.isArray(endpoint.body)) {
      const bodyObj = endpoint.body as Record<string, unknown>;
      const firstKey = Object.keys(bodyObj)[0];

      if (firstKey) {
        for (const chars of this.specialCharacters.slice(0, 2)) {
          cases.push(
            this.createEdgeCaseTestCase(
              endpoint,
              `${baseId}-special-chars-${caseIndex++}`,
              'Special characters in payload',
              { ...bodyObj, [firstKey]: chars },
              [
                {
                  type: 'status',
                  expected: [200, 201, 400, 422],
                  message: 'Handles special characters',
                },
              ]
            )
          );
        }
      }
    }

    // Duplicate submission
    cases.push(
      this.createEdgeCaseTestCase(
        endpoint,
        `${baseId}-duplicate-${caseIndex++}`,
        'Duplicate submission (idempotency)',
        endpoint.body,
        [
          {
            type: 'status',
            expected: [200, 201, 409, 422],
            message: 'Handles duplicate submission gracefully',
          },
        ]
      )
    );

    // Null values
    if (endpoint.body && typeof endpoint.body === 'object' && !Array.isArray(endpoint.body)) {
      const bodyObj = endpoint.body as Record<string, unknown>;
      const modifiedBody: Record<string, unknown> = {};

      for (const key of Object.keys(bodyObj)) {
        modifiedBody[key] = null;
      }

      cases.push(
        this.createEdgeCaseTestCase(
          endpoint,
          `${baseId}-null-values-${caseIndex++}`,
          'All fields set to null',
          modifiedBody,
          [{ type: 'status', expected: [400, 422], message: 'Validates against all-null payload' }]
        )
      );
    }

    this.logger.info(`Generated ${cases.length} edge case variants for ${endpoint.url}`);
    return cases;
  }

  /**
   * Create a single edge case test case.
   *
   * @param baseEndpoint The base endpoint definition.
   * @param testId The test case ID.
   * @param name The test case name.
   * @param body The body for the edge case.
   * @param assertions The assertions for the test.
   * @returns The created test case.
   */
  private createEdgeCaseTestCase(
    baseEndpoint: EndpointDefinition,
    testId: string,
    name: string,
    body: unknown,
    assertions: Assertion[]
  ): ApiTestCase {
    return {
      id: testId,
      name,
      endpoint: {
        ...baseEndpoint,
        body: body === null ? undefined : body,
      },
      expectedStatus: Array.isArray(assertions[0]?.expected) ? assertions[0].expected : [400, 422],
      assertions,
      category: 'edge-case',
      priority: 'medium',
    };
  }
}
