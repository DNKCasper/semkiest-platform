import type { BrowserPage, Finding, FetchFn, HttpResponse } from './types';

/**
 * Standard XSS probe payloads covering reflected and DOM-based vectors.
 * These are OWASP-recommended test strings for authorized security testing.
 */
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  "'><script>alert(1)</script>",
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '"><img src=x onerror=alert(1)>',
  '<body onload=alert(1)>',
  '{{7*7}}',          // Template injection probe
  '${7*7}',           // Template injection probe
] as const;

/** Marker text embedded in payloads to detect reflection without script execution. */
const REFLECTION_MARKER = 'xss-probe-semkiest';

/** Safe reflection-only payloads that won't execute but confirm reflection. */
const REFLECTION_PAYLOADS = XSS_PAYLOADS.map(
  (p, i) => `${p}${REFLECTION_MARKER}-${i}`,
);

/**
 * Checks if a response body likely reflects an XSS payload.
 */
function isPayloadReflected(body: string, payload: string): boolean {
  // Check for exact reflection or partial dangerous reflection
  if (body.includes(payload)) return true;
  // Check if the marker is reflected (without HTML encoding)
  if (payload.includes(REFLECTION_MARKER) && body.includes(REFLECTION_MARKER)) {
    return true;
  }
  return false;
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
function buildPayloadUrl(url: string, paramName: string, payload: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(paramName, payload);
  return parsed.toString();
}

/**
 * Default fetch implementation wrapping the global fetch API.
 * Normalizes the response to the internal HttpResponse type.
 */
export const defaultFetch: FetchFn = async (
  url: string,
  init?: RequestInit,
): Promise<HttpResponse> => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
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
 * Scans URL query parameters for reflected XSS vulnerabilities.
 *
 * For each parameter, injects XSS payloads and checks whether the payload
 * appears unencoded in the response body.
 *
 * @param url - The URL to test (must have query parameters to be meaningful).
 * @param fetchFn - Injectable fetch function (defaults to global fetch wrapper).
 * @returns List of XSS findings with remediation guidance.
 *
 * @example
 * ```typescript
 * const findings = await scanUrlParametersForXss(
 *   'https://example.com/search?q=test&page=1',
 * );
 * ```
 */
export async function scanUrlParametersForXss(
  url: string,
  fetchFn: FetchFn = defaultFetch,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const params = parseUrlParams(url);

  if (params.size === 0) return findings;

  for (const [paramName] of params) {
    for (let i = 0; i < REFLECTION_PAYLOADS.length; i++) {
      const payload = REFLECTION_PAYLOADS[i];
      const testUrl = buildPayloadUrl(url, paramName, payload);

      let response: HttpResponse;
      try {
        response = await fetchFn(testUrl, { method: 'GET' });
      } catch {
        // Network error — skip this payload
        continue;
      }

      if (isPayloadReflected(response.body, payload)) {
        findings.push({
          id: `XSS-URL-PARAM-${paramName.toUpperCase()}`,
          category: 'XSS',
          title: `Reflected XSS in URL parameter: ${paramName}`,
          description:
            `The URL parameter '${paramName}' reflects unsanitized user input ` +
            'directly into the HTML response. An attacker can craft a malicious ' +
            'URL that executes arbitrary JavaScript in a victim\'s browser.',
          severity: 'high',
          location: `URL parameter: ${paramName} at ${url}`,
          evidence: `Payload reflected: ${XSS_PAYLOADS[i]}`,
          remediation:
            'HTML-encode all user-supplied values before rendering them in HTML output. ' +
            'Use a context-aware output encoding library. ' +
            'Implement a strict Content-Security-Policy to mitigate impact. ' +
            'Validate and whitelist allowed input on the server side.',
        });
        break; // One confirmed finding per parameter is sufficient
      }
    }
  }

  return findings;
}

/**
 * Scans form inputs for XSS vulnerabilities using a browser page.
 *
 * Uses the provided BrowserPage (Playwright-compatible) to:
 * 1. Navigate to the URL.
 * 2. Find all form input fields.
 * 3. Inject XSS payloads and submit forms.
 * 4. Detect script execution or payload reflection.
 *
 * @param page - A Playwright-compatible browser page instance.
 * @param url - The URL containing forms to test.
 * @returns List of XSS findings with remediation guidance.
 */
export async function scanFormInputsForXss(
  page: BrowserPage,
  url: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const detectedInputs: string[] = [];

  // Track alert dialogs as evidence of script execution
  page.on('dialog', (...args: unknown[]) => {
    const dialog = args[0] as { message: () => string; dismiss: () => Promise<void> };
    detectedInputs.push(dialog.message());
    void dialog.dismiss();
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  const html = await page.content();

  // Extract form input names via simple regex (no DOM parser dependency)
  const inputNames = extractFormInputNames(html);

  if (inputNames.length === 0) return findings;

  // Use evaluation to inject payloads into inputs and check for reflection
  for (const inputName of inputNames) {
    for (let i = 0; i < XSS_PAYLOADS.length; i++) {
      const payload = XSS_PAYLOADS[i];

      const reflected = await page.evaluate<boolean>(
        `(function() {
          var el = document.querySelector('[name="${inputName}"]');
          if (!el) return false;
          el.value = ${JSON.stringify(payload)};
          return document.body.innerHTML.includes(${JSON.stringify(payload.slice(0, 20))});
        })()`,
      );

      if (reflected || detectedInputs.length > 0) {
        findings.push({
          id: `XSS-FORM-INPUT-${inputName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
          category: 'XSS',
          title: `Potential XSS in form input: ${inputName}`,
          description:
            `The form input '${inputName}' may reflect unsanitized values ` +
            'into the page DOM, enabling cross-site scripting attacks.',
          severity: 'high',
          location: `Form input: ${inputName} at ${url}`,
          evidence: `Payload: ${payload}`,
          remediation:
            'Sanitize and HTML-encode all user input before rendering. ' +
            'Use a trusted HTML sanitization library (e.g., DOMPurify). ' +
            'Implement a strict Content-Security-Policy.',
        });
        break;
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
  const pattern = /<(?:input|textarea|select)[^>]+name=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const name = match[1];
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}
