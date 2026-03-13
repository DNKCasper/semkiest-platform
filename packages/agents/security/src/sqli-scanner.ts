import type { BrowserPage, Finding, FetchFn, HttpResponse } from './types';

/**
 * SQL injection test payloads covering error-based, boolean-based,
 * and UNION-based vectors. Used only in authorized security testing contexts.
 */
const SQLI_PAYLOADS = [
  "'",
  '"',
  "' OR '1'='1",
  '" OR "1"="1',
  "' OR 1=1--",
  "1'; SELECT 1--",
  "' UNION SELECT null--",
  "1 ORDER BY 1--",
  "1 AND 1=1",
  "1 AND 1=2",
] as const;

/**
 * Patterns in response bodies that indicate a SQL error was triggered.
 * These strings are emitted by database engines on unhandled SQL exceptions.
 */
const SQL_ERROR_PATTERNS = [
  'you have an error in your sql syntax',
  'warning: mysql',
  'unclosed quotation mark after the character string',
  'quoted string not properly terminated',
  'sql syntax',
  'ora-',
  'microsoft ole db provider for sql server',
  'sqlite_error',
  'pg_query():',
  'pgsql error',
  'syntax error at or near',
  'invalid input syntax',
  'division by zero',
  'unterminated string literal',
  'column not found',
  'table or view does not exist',
] as const;

/**
 * Checks if a response body contains SQL error signatures.
 */
function containsSqlError(body: string): boolean {
  const lower = body.toLowerCase();
  return SQL_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Parses URL parameters from a URL string.
 */
function parseUrlParams(url: string): Map<string, string> {
  try {
    const parsed = new URL(url);
    return new Map(parsed.searchParams.entries());
  } catch {
    return new Map();
  }
}

/**
 * Builds a URL with one parameter replaced by the given payload.
 */
function buildPayloadUrl(
  url: string,
  paramName: string,
  payload: string,
): string {
  const parsed = new URL(url);
  parsed.searchParams.set(paramName, payload);
  return parsed.toString();
}

/**
 * Default fetch implementation wrapping the global fetch API.
 */
export const defaultFetch: FetchFn = async (
  url: string,
  init?: RequestInit,
): Promise<HttpResponse> => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body: await response.text(),
    url: response.url,
  };
};

/**
 * Scans URL query parameters for SQL injection vulnerabilities.
 *
 * Injects standard SQLi payloads into each URL parameter and inspects the
 * response for:
 * - Database error messages (error-based SQLi)
 * - HTTP 500 errors (unhandled exceptions)
 *
 * @param url - The URL to test (must have query parameters).
 * @param fetchFn - Injectable fetch function (defaults to global fetch wrapper).
 * @returns List of SQL injection findings with remediation guidance.
 *
 * @example
 * ```typescript
 * const findings = await scanUrlParametersForSqli(
 *   'https://example.com/products?id=1&category=electronics',
 * );
 * ```
 */
export async function scanUrlParametersForSqli(
  url: string,
  fetchFn: FetchFn = defaultFetch,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const params = parseUrlParams(url);

  if (params.size === 0) return findings;

  // Fetch baseline response to compare against
  let baselineResponse: HttpResponse | null = null;
  try {
    baselineResponse = await fetchFn(url, { method: 'GET' });
  } catch {
    // Baseline fetch failed; proceed without it
  }

  for (const [paramName] of params) {
    let found = false;

    for (const payload of SQLI_PAYLOADS) {
      if (found) break;

      const testUrl = buildPayloadUrl(url, paramName, payload);

      let response: HttpResponse;
      try {
        response = await fetchFn(testUrl, { method: 'GET' });
      } catch {
        continue;
      }

      // Error-based detection: database error strings in response body
      if (containsSqlError(response.body)) {
        findings.push({
          id: `SQLI-URL-PARAM-${paramName.toUpperCase()}-ERROR`,
          category: 'SQL Injection',
          title: `SQL injection (error-based) in URL parameter: ${paramName}`,
          description:
            `The URL parameter '${paramName}' appears to be vulnerable to ` +
            'SQL injection. A database error message was returned when a ' +
            "malformed SQL payload was injected, indicating the input is " +
            'passed directly to a SQL query without parameterization.',
          severity: 'critical',
          location: `URL parameter: ${paramName} at ${url}`,
          evidence: `Payload '${payload}' triggered a database error in the response.`,
          remediation:
            'Use parameterized queries or prepared statements for ALL database queries. ' +
            'Never concatenate user input into SQL strings. ' +
            'Use an ORM (Prisma, TypeORM, Sequelize) that parameterizes by default. ' +
            'Implement an allowlist for expected input values where possible. ' +
            'Suppress detailed database error messages in production responses.',
        });
        found = true;
        break;
      }

      // HTTP 500 may indicate unhandled SQL exception leaking through
      if (
        response.status === 500 &&
        baselineResponse &&
        baselineResponse.status !== 500
      ) {
        findings.push({
          id: `SQLI-URL-PARAM-${paramName.toUpperCase()}-500`,
          category: 'SQL Injection',
          title: `Possible SQL injection (HTTP 500) in URL parameter: ${paramName}`,
          description:
            `Injecting a SQL payload into URL parameter '${paramName}' caused ` +
            'the server to return HTTP 500, which may indicate an unhandled ' +
            'SQL exception. Manual verification is recommended.',
          severity: 'high',
          location: `URL parameter: ${paramName} at ${url}`,
          evidence: `Payload '${payload}' returned HTTP 500 (baseline: ${baselineResponse.status}).`,
          remediation:
            'Use parameterized queries or prepared statements. ' +
            'Add global error handling to return consistent error responses ' +
            'that do not leak internal implementation details.',
        });
        found = true;
        break;
      }
    }
  }

  return findings;
}

/**
 * Scans form inputs for SQL injection vulnerabilities using a browser page.
 *
 * Uses the provided BrowserPage (Playwright-compatible) to:
 * 1. Navigate to the URL.
 * 2. Identify form inputs.
 * 3. Inject SQL payloads and submit.
 * 4. Check the resulting page for SQL error signatures.
 *
 * @param page - A Playwright-compatible browser page instance.
 * @param url - The URL containing forms to test.
 * @returns List of SQL injection findings with remediation guidance.
 */
export async function scanFormInputsForSqli(
  page: BrowserPage,
  url: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  const baseHtml = await page.content();
  const inputNames = extractFormInputNames(baseHtml);

  if (inputNames.length === 0) return findings;

  for (const inputName of inputNames) {
    let found = false;

    for (const payload of SQLI_PAYLOADS) {
      if (found) break;

      // Inject payload into the specific input
      const resultHtml = await page.evaluate<string>(
        `(function() {
          var el = document.querySelector('[name="${inputName}"]');
          if (!el) return '';
          el.value = ${JSON.stringify(payload)};
          var form = el.closest('form');
          if (form) {
            try { form.submit(); } catch(e) {}
          }
          return document.body ? document.body.innerHTML : '';
        })()`,
      );

      if (containsSqlError(resultHtml)) {
        findings.push({
          id: `SQLI-FORM-INPUT-${inputName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
          category: 'SQL Injection',
          title: `SQL injection in form input: ${inputName}`,
          description:
            `The form input '${inputName}' appears to be vulnerable to SQL injection. ` +
            'A database error was triggered when a SQL payload was submitted.',
          severity: 'critical',
          location: `Form input: ${inputName} at ${url}`,
          evidence: `Payload '${payload}' triggered a database error.`,
          remediation:
            'Use parameterized queries or prepared statements for all database operations. ' +
            'Validate and sanitize all form inputs on the server side. ' +
            'Suppress verbose database error messages from production responses.',
        });
        found = true;
      }
    }
  }

  return findings;
}

/**
 * Extracts `name` attribute values from HTML form inputs using regex.
 * Handles input, textarea, and select elements.
 */
export function extractFormInputNames(html: string): string[] {
  const names: string[] = [];
  const pattern =
    /<(?:input|textarea|select)[^>]+name=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const name = match[1];
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}
