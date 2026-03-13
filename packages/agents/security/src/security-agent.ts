import { BaseAgent } from './base-agent';
import { auditSecurityHeaders } from './header-auditor';
import { validateSsl } from './ssl-validator';
import { scanUrlParametersForXss, scanFormInputsForXss } from './xss-scanner';
import { scanUrlParametersForSqli, scanFormInputsForSqli } from './sqli-scanner';
import type {
  BrowserPage,
  CsrfValidationResult,
  Finding,
  FetchFn,
  HttpResponse,
  ScanTarget,
  SecurityReport,
  Severity,
  TlsConnectFn,
} from './types';

/** Known CSRF token field name patterns (case-insensitive substring match). */
const CSRF_TOKEN_PATTERNS = [
  'csrf',
  '_token',
  'xsrf',
  'authenticity_token',
  'csrfmiddlewaretoken',
  '__requestverificationtoken',
];

/**
 * Default fetch implementation wrapping the global fetch API.
 */
const defaultFetch: FetchFn = async (
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
 * Extract the hostname from a URL string.
 * Returns null if the URL cannot be parsed.
 */
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Extract the protocol from a URL string ("http:" | "https:" | null).
 */
function extractProtocol(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

/**
 * Build the cookie header string from a cookies map.
 */
function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Build RequestInit from a ScanTarget's headers and cookies.
 */
function buildRequestInit(target: ScanTarget): RequestInit {
  const headers: Record<string, string> = { ...target.headers };
  if (target.cookies && Object.keys(target.cookies).length > 0) {
    headers['Cookie'] = buildCookieHeader(target.cookies);
  }
  return { headers };
}

/**
 * Detect whether HTML contains a CSRF protection token.
 */
function detectCsrfToken(html: string): { found: boolean; fieldName?: string } {
  // Match hidden inputs whose name matches a CSRF pattern
  const hiddenInputPattern =
    /<input[^>]+type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = hiddenInputPattern.exec(html)) !== null) {
    const name = match[1].toLowerCase();
    if (CSRF_TOKEN_PATTERNS.some((p) => name.includes(p))) {
      return { found: true, fieldName: match[1] };
    }
  }

  // Also check inputs where the name attribute comes before type
  const nameFirstPattern =
    /<input[^>]+name=["']([^"']+)["'][^>]+type=["']hidden["'][^>]*>/gi;

  while ((match = nameFirstPattern.exec(html)) !== null) {
    const name = match[1].toLowerCase();
    if (CSRF_TOKEN_PATTERNS.some((p) => name.includes(p))) {
      return { found: true, fieldName: match[1] };
    }
  }

  // Check for meta tag CSRF token (common in SPAs)
  const metaPattern = /<meta[^>]+name=["']([^"']+)["'][^>]*content=["'][^"']+["'][^>]*>/gi;
  while ((match = metaPattern.exec(html)) !== null) {
    const name = match[1].toLowerCase();
    if (CSRF_TOKEN_PATTERNS.some((p) => name.includes(p))) {
      return { found: true, fieldName: match[1] };
    }
  }

  return { found: false };
}

/**
 * Check if HTML has any forms that could submit data (POST forms).
 */
function hasSubmittableForms(html: string): boolean {
  return /<form[^>]+method=["']post["'][^>]*>/i.test(html) ||
    /<form[^>]*>[^<]*<[^>]+type=["']submit["']/i.test(html);
}

/**
 * Validate CSRF protection on the given target URL.
 */
async function validateCsrf(
  target: ScanTarget,
  fetchFn: FetchFn,
): Promise<CsrfValidationResult> {
  const findings: Finding[] = [];

  let response: HttpResponse;
  try {
    response = await fetchFn(target.url, buildRequestInit(target));
  } catch (err) {
    return { hasToken: false, findings };
  }

  const html = response.body;

  if (!hasSubmittableForms(html)) {
    return { hasToken: true, findings }; // No forms to protect
  }

  const { found, fieldName } = detectCsrfToken(html);

  if (!found) {
    findings.push({
      id: 'CSRF-TOKEN-MISSING',
      category: 'CSRF',
      title: 'CSRF token missing on form(s)',
      description:
        'One or more HTML forms on this page do not include a CSRF token. ' +
        'Without CSRF protection, an attacker can trick authenticated users ' +
        "into submitting requests on the application's behalf " +
        '(Cross-Site Request Forgery).',
      severity: 'high',
      location: target.url,
      remediation:
        'Add a unique, unpredictable CSRF token to every state-changing form ' +
        'as a hidden input. Validate the token server-side on every POST/PUT/DELETE request. ' +
        'Use the SameSite=Strict or SameSite=Lax cookie attribute as an additional layer. ' +
        'For SPAs, use the Double Submit Cookie or Synchronizer Token pattern.',
    });
  }

  // Check for SameSite cookie attribute
  const setCookieHeader = response.headers['set-cookie'] ?? '';
  if (setCookieHeader && !setCookieHeader.toLowerCase().includes('samesite')) {
    findings.push({
      id: 'CSRF-COOKIE-NO-SAMESITE',
      category: 'CSRF',
      title: 'Session cookie missing SameSite attribute',
      description:
        'A cookie is set without the SameSite attribute. The SameSite attribute ' +
        'prevents cross-origin requests from including the cookie, providing ' +
        'defense-in-depth against CSRF attacks.',
      severity: 'medium',
      location: 'Set-Cookie header',
      evidence: setCookieHeader,
      remediation:
        "Add 'SameSite=Strict' or 'SameSite=Lax' to all session cookies. " +
        'Example: Set-Cookie: session=...; SameSite=Strict; Secure; HttpOnly',
    });
  }

  return {
    hasToken: found,
    tokenFieldName: fieldName,
    findings,
  };
}

/**
 * Build a SecurityReport summary from a list of findings.
 */
function buildSummary(
  findings: Finding[],
): SecurityReport['summary'] {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };

  for (const finding of findings) {
    bySeverity[finding.severity]++;
  }

  return { total: findings.length, bySeverity };
}

/**
 * Configuration for the SecurityAgent.
 */
export interface SecurityAgentOptions {
  /**
   * Injectable fetch function for HTTP requests (defaults to global fetch).
   * Override in tests or when custom request handling is needed.
   */
  fetchFn?: FetchFn;

  /**
   * Injectable TLS connect function for SSL validation.
   * Override in tests or air-gapped environments.
   */
  tlsConnectFn?: TlsConnectFn;

  /**
   * Optional Playwright-compatible browser page for browser-based scanning.
   * When provided, enables form input testing via real browser automation.
   */
  browserPage?: BrowserPage;
}

/**
 * Security agent implementing OWASP vulnerability scanning.
 *
 * **Disabled by default** — call `agent.enable()` before running.
 *
 * Scans for:
 * - Reflected XSS in URL parameters and form inputs
 * - SQL injection in URL parameters and form inputs
 * - CSRF token validation
 * - HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
 * - SSL/TLS configuration (protocol version, cipher suite, certificate validity)
 *
 * @example
 * ```typescript
 * const agent = new SecurityAgent();
 * agent.enable();
 *
 * const report = await agent.run({
 *   url: 'https://example.com/search?q=test',
 * });
 *
 * console.log(`Found ${report.summary.total} issues`);
 * report.findings.forEach(f => console.log(`[${f.severity}] ${f.title}`));
 * ```
 */
export class SecurityAgent extends BaseAgent {
  readonly name = 'SecurityAgent';

  private readonly fetchFn: FetchFn;
  private readonly tlsConnectFn: TlsConnectFn | undefined;
  private readonly browserPage: BrowserPage | undefined;

  constructor(options: SecurityAgentOptions = {}) {
    super();
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.tlsConnectFn = options.tlsConnectFn;
    this.browserPage = options.browserPage;
  }

  /**
   * Run the full security scan against the target.
   *
   * @param target - URL and optional configuration for the scan.
   * @returns Aggregated SecurityReport with all findings and remediation guidance.
   * @throws {Error} If the agent has not been enabled.
   */
  async run(target: ScanTarget): Promise<SecurityReport> {
    if (!this.isEnabled()) {
      throw new Error(
        'SecurityAgent is disabled. Call agent.enable() before running a scan.',
      );
    }

    const startTime = Date.now();
    const allFindings: Finding[] = [];

    // 1. Fetch the target page to get headers and HTML
    let pageResponse: HttpResponse | null = null;
    try {
      pageResponse = await this.fetchFn(target.url, buildRequestInit(target));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      allFindings.push({
        id: 'AGENT-FETCH-FAILED',
        category: 'Reachability',
        title: 'Target URL is unreachable',
        description: `Could not fetch target URL: ${message}`,
        severity: 'informational',
        location: target.url,
        remediation:
          'Verify the target URL is correct and accessible from the scanner.',
      });

      return this.buildReport(target, allFindings, startTime);
    }

    // 2. Audit HTTP security headers
    const headerFindings = auditSecurityHeaders(pageResponse.headers);
    allFindings.push(...headerFindings);

    // 3. Check if using HTTP (not HTTPS)
    const protocol = extractProtocol(target.url);
    if (protocol === 'http:') {
      allFindings.push({
        id: 'SSL-HTTP-USED',
        category: 'SSL/TLS',
        title: 'Site is served over unencrypted HTTP',
        description:
          'The target URL uses HTTP, meaning all data is transmitted in plaintext. ' +
          'This exposes users to eavesdropping, man-in-the-middle attacks, and ' +
          'credential theft.',
        severity: 'high',
        location: target.url,
        remediation:
          'Configure HTTPS for all endpoints. Obtain a TLS certificate (e.g., via ' +
          "Let's Encrypt) and redirect all HTTP traffic to HTTPS. " +
          'Add Strict-Transport-Security to prevent future HTTP access.',
      });
    } else if (protocol === 'https:') {
      // 4. SSL/TLS validation
      const hostname = extractHostname(target.url);
      if (hostname) {
        const sslFindings = await validateSsl(
          hostname,
          443,
          this.tlsConnectFn,
        );
        allFindings.push(...sslFindings);
      }
    }

    // 5. CSRF validation
    const csrfResult = await validateCsrf(target, this.fetchFn);
    allFindings.push(...csrfResult.findings);

    // 6. XSS scanning — URL parameters
    const xssUrlFindings = await scanUrlParametersForXss(
      target.url,
      this.fetchFn,
    );
    allFindings.push(...xssUrlFindings);

    // 7. SQL injection scanning — URL parameters
    const sqliUrlFindings = await scanUrlParametersForSqli(
      target.url,
      this.fetchFn,
    );
    allFindings.push(...sqliUrlFindings);

    // 8. Browser-based form scanning (if Playwright page is provided)
    if (this.browserPage) {
      const xssFormFindings = await scanFormInputsForXss(
        this.browserPage,
        target.url,
      );
      allFindings.push(...xssFormFindings);

      const sqliFormFindings = await scanFormInputsForSqli(
        this.browserPage,
        target.url,
      );
      allFindings.push(...sqliFormFindings);
    }

    return this.buildReport(target, allFindings, startTime);
  }

  private buildReport(
    target: ScanTarget,
    findings: Finding[],
    startTime: number,
  ): SecurityReport {
    // Deduplicate findings by ID
    const seen = new Set<string>();
    const deduped = findings.filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

    return {
      target,
      findings: deduped,
      summary: buildSummary(deduped),
      scannedAt: new Date(),
      duration: Date.now() - startTime,
    };
  }
}
