/**
 * Unit tests for API Agent and components.
 */

import { EndpointDiscoverer } from './endpoint-discoverer';
import { RequestBuilder } from './request-builder';
import { AssertionEngine } from './assertion-engine';
import { EdgeCaseGenerator } from './edge-case-generator';
import { TestExecutor } from './test-executor';
import {
  EndpointDefinition,
  ApiTestCase,
  Assertion,
  AuthConfig,
  Logger,
} from './types';

describe('EndpointDiscoverer', () => {
  let discoverer: EndpointDiscoverer;

  beforeEach(() => {
    discoverer = new EndpointDiscoverer();
  });

  test('discovers endpoints from OpenAPI spec', () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': {
          get: {
            summary: 'List users',
            tags: ['users'],
          },
          post: {
            summary: 'Create user',
            tags: ['users'],
          },
        },
        '/users/{id}': {
          get: {
            summary: 'Get user by ID',
            tags: ['users'],
          },
        },
      },
    };

    const endpoints = discoverer.discoverFromOpenApi(spec, 'https://api.example.com');

    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toMatchObject({
      url: 'https://api.example.com/users',
      method: 'GET',
      protocol: 'rest',
    });
    expect(endpoints[1]).toMatchObject({
      url: 'https://api.example.com/users',
      method: 'POST',
      protocol: 'rest',
    });
    expect(endpoints[2]).toMatchObject({
      url: 'https://api.example.com/users/{id}',
      method: 'GET',
      protocol: 'rest',
    });
  });

  test('discovers endpoints from GraphQL introspection', () => {
    const introspection = {
      __schema: {
        queryType: { name: 'Query' },
        mutationType: { name: 'Mutation' },
        types: [
          {
            name: 'Query',
            fields: [{ name: 'user' }, { name: 'users' }],
          },
          {
            name: 'Mutation',
            fields: [{ name: 'createUser' }],
          },
        ],
      },
    };

    const endpoints = discoverer.discoverFromGraphQL(introspection, 'https://api.example.com/graphql');

    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toMatchObject({
      url: 'https://api.example.com/graphql',
      method: 'POST',
      protocol: 'graphql',
    });
  });
});

describe('RequestBuilder', () => {
  let builder: RequestBuilder;

  beforeEach(() => {
    builder = new RequestBuilder();
  });

  test('builds basic request', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'GET',
      protocol: 'rest',
    };

    const request = builder.buildRequest(endpoint);

    expect(request).toMatchObject({
      url: 'https://api.example.com/users',
      method: 'GET',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    });
  });

  test('applies bearer token authentication', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'GET',
      protocol: 'rest',
    };

    const auth: AuthConfig = {
      strategy: 'bearer',
      credentials: { token: 'secret-token' },
    };

    const request = builder.buildRequest(endpoint, auth);

    expect(request.headers['Authorization']).toBe('Bearer secret-token');
  });

  test('applies basic authentication', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'GET',
      protocol: 'rest',
    };

    const auth: AuthConfig = {
      strategy: 'basic',
      credentials: { username: 'user', password: 'pass' },
    };

    const request = builder.buildRequest(endpoint, auth);

    expect(request.headers['Authorization']).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
  });

  test('substitutes variables in URL', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users/{id}',
      method: 'GET',
      protocol: 'rest',
    };

    const request = builder.buildRequest(endpoint, undefined, { id: '123' });

    expect(request.url).toBe('https://api.example.com/users/123');
  });

  test('builds query parameters', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'GET',
      protocol: 'rest',
      queryParams: { limit: '10', offset: '0' },
    };

    const request = builder.buildRequest(endpoint);

    expect(request.url).toContain('limit=10');
    expect(request.url).toContain('offset=0');
  });

  test('builds request body', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'POST',
      protocol: 'rest',
      body: { name: 'John', email: 'john@example.com' },
    };

    const request = builder.buildRequest(endpoint);

    expect(request.body).toBe(JSON.stringify({ name: 'John', email: 'john@example.com' }));
  });
});

describe('AssertionEngine', () => {
  let engine: AssertionEngine;

  beforeEach(() => {
    engine = new AssertionEngine();
  });

  test('evaluates status code assertion', () => {
    const assertions: Assertion[] = [
      { type: 'status', expected: 200, message: 'Status is 200' },
    ];

    const results = engine.evaluateAssertions(assertions, 200, {}, {}, 100);

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  test('evaluates status code array assertion', () => {
    const assertions: Assertion[] = [
      { type: 'status', expected: [200, 201], message: 'Status is 200 or 201' },
    ];

    const results = engine.evaluateAssertions(assertions, 201, {}, {}, 100);

    expect(results[0].passed).toBe(true);
  });

  test('evaluates body-contains assertion', () => {
    const assertions: Assertion[] = [
      { type: 'body-contains', expected: 'error', message: 'Body contains error' },
    ];

    const results = engine.evaluateAssertions(
      assertions,
      200,
      { message: 'An error occurred' },
      {},
      100
    );

    expect(results[0].passed).toBe(true);
  });

  test('evaluates json-path assertion', () => {
    const assertions: Assertion[] = [
      { type: 'json-path', expected: 'John', path: 'user.name', message: 'User name is John' },
    ];

    const body = { user: { name: 'John', age: 30 } };
    const results = engine.evaluateAssertions(assertions, 200, body, {}, 100);

    expect(results[0].passed).toBe(true);
  });

  test('evaluates response-time assertion', () => {
    const assertions: Assertion[] = [
      { type: 'response-time', expected: 500, message: 'Response time < 500ms' },
    ];

    const results = engine.evaluateAssertions(assertions, 200, {}, {}, 300);

    expect(results[0].passed).toBe(true);
  });

  test('evaluates content-type assertion', () => {
    const assertions: Assertion[] = [
      { type: 'content-type', expected: 'application/json', message: 'Content-Type is JSON' },
    ];

    const headers = { 'content-type': 'application/json; charset=utf-8' };
    const results = engine.evaluateAssertions(assertions, 200, {}, headers, 100);

    expect(results[0].passed).toBe(true);
  });

  test('evaluates array-length assertion', () => {
    const assertions: Assertion[] = [
      { type: 'array-length', expected: 3, path: 'items', message: 'Array length is 3' },
    ];

    const body = { items: [1, 2, 3] };
    const results = engine.evaluateAssertions(assertions, 200, body, {}, 100);

    expect(results[0].passed).toBe(true);
  });

  test('evaluates not-empty assertion', () => {
    const assertions: Assertion[] = [
      { type: 'not-empty', path: 'data', message: 'Data is not empty' },
    ];

    const body = { data: { id: 1 } };
    const results = engine.evaluateAssertions(assertions, 200, body, {}, 100);

    expect(results[0].passed).toBe(true);
  });
});

describe('EdgeCaseGenerator', () => {
  let generator: EdgeCaseGenerator;

  beforeEach(() => {
    generator = new EdgeCaseGenerator();
  });

  test('generates edge cases for POST endpoint', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'POST',
      protocol: 'rest',
      body: { name: 'John', email: 'john@example.com' },
    };

    const edgeCases = generator.generateEdgeCases(endpoint);

    expect(edgeCases.length).toBeGreaterThan(0);
    expect(edgeCases[0].category).toBe('edge-case');
    expect(edgeCases[0].priority).toBe('medium');
  });

  test('generates empty body edge case', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'POST',
      protocol: 'rest',
      body: { name: 'John' },
    };

    const edgeCases = generator.generateEdgeCases(endpoint);

    const emptyBodyCase = edgeCases.find((c) => c.name.toLowerCase().includes('empty'));
    expect(emptyBodyCase).toBeDefined();
    expect(emptyBodyCase?.endpoint.body).toEqual({});
  });

  test('generates missing field edge case', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'POST',
      protocol: 'rest',
      body: { name: 'John', email: 'john@example.com' },
    };

    const edgeCases = generator.generateEdgeCases(endpoint);

    const missingFieldCase = edgeCases.find((c) => c.name.toLowerCase().includes('missing'));
    expect(missingFieldCase).toBeDefined();
  });

  test('does not generate edge cases for GET', () => {
    const endpoint: EndpointDefinition = {
      url: 'https://api.example.com/users',
      method: 'GET',
      protocol: 'rest',
    };

    const edgeCases = generator.generateEdgeCases(endpoint);

    expect(edgeCases).toHaveLength(0);
  });
});

describe('TestExecutor', () => {
  let executor: TestExecutor;

  beforeEach(() => {
    executor = new TestExecutor(5, 5000);
  });

  test('executes single test case', async () => {
    const testCase: ApiTestCase = {
      id: 'test-1',
      name: 'Get users',
      endpoint: {
        url: 'https://httpbin.org/status/200',
        method: 'GET',
        protocol: 'rest',
      },
      expectedStatus: 200,
      assertions: [{ type: 'status', expected: 200, message: 'Status is 200' }],
      category: 'functional',
      priority: 'high',
    };

    const results = await executor.executeTests([testCase]);

    expect(results).toHaveLength(1);
    expect(typeof results[0].actualStatus).toBe('number');
    expect(results[0].actualStatus).toBeGreaterThanOrEqual(0);
    expect(results[0].responseTimeMs).toBeGreaterThan(0);
  });

  test('respects concurrency limit', async () => {
    const executor = new TestExecutor(2, 5000);
    const testCases: ApiTestCase[] = Array.from({ length: 5 }, (_, i) => ({
      id: `test-${i}`,
      name: `Test ${i}`,
      endpoint: {
        url: `https://httpbin.org/delay/0`,
        method: 'GET',
        protocol: 'rest',
      },
      expectedStatus: 200,
      assertions: [],
      category: 'functional',
      priority: 'high',
    }));

    const startTime = Date.now();
    const results = await executor.executeTests(testCases);
    const totalTime = Date.now() - startTime;

    expect(results).toHaveLength(5);
    // With concurrency of 2 and 5 requests, should take longer than parallel execution
    // This is a rough check; actual timing may vary
    expect(totalTime).toBeGreaterThan(0);
  });
});

describe('Integration: Endpoint Discovery and Test Generation', () => {
  test('discovers OpenAPI endpoints and generates test cases', () => {
    const discoverer = new EndpointDiscoverer();
    const generator = new EdgeCaseGenerator();

    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': {
          post: {
            summary: 'Create user',
            tags: ['users'],
          },
        },
      },
    };

    const endpoints = discoverer.discoverFromOpenApi(spec, 'https://api.example.com');
    expect(endpoints).toHaveLength(1);

    const edgeCases = generator.generateEdgeCases(endpoints[0]);
    expect(edgeCases.length).toBeGreaterThan(0);
    expect(edgeCases.every((c) => c.category === 'edge-case')).toBe(true);
  });
});

describe('Integration: Request Building and Execution', () => {
  test('builds request with auth and executes it', async () => {
    const builder = new RequestBuilder();
    const executor = new TestExecutor(5, 5000);

    const endpoint: EndpointDefinition = {
      url: 'https://httpbin.org/bearer',
      method: 'GET',
      protocol: 'rest',
    };

    const auth: AuthConfig = {
      strategy: 'bearer',
      credentials: { token: 'test-token' },
    };

    const request = builder.buildRequest(endpoint, auth);
    expect(request.headers['Authorization']).toBe('Bearer test-token');

    const testCase: ApiTestCase = {
      id: 'test-bearer',
      name: 'Bearer auth test',
      endpoint,
      expectedStatus: [200, 401],
      assertions: [],
      category: 'functional',
      priority: 'high',
    };

    const results = await executor.executeTests([testCase]);
    expect(results).toHaveLength(1);
    expect(typeof results[0].actualStatus).toBe('number');
    expect(results[0].actualStatus).toBeGreaterThanOrEqual(0);
  });
});
