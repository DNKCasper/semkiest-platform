import type { Finding, Severity } from './types';

/** Normalized header map (lowercase keys). */
type NormalizedHeaders = Record<string, string>;

/**
 * Parsed Content-Security-Policy directive map.
 */
interface CspDirectives {
  [directive: string]: string[];
}

/**
 * Normalize raw HTTP response headers to lowercase keys.
 * Handles both string and string-array header values.
 */
function normalizeHeaders(
  headers: Record<string, string | string[]>,
): NormalizedHeaders {
  const result: NormalizedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}

/**
 * Parse a Content-Security-Policy header value into its directives.
 */
function parseCsp(cspValue: string): CspDirectives {
  const directives: CspDirectives = {};
  for (const directive of cspValue.split(';')) {
    const parts = directive.trim().split(/\s+/);
    if (parts.length > 0 && parts[0]) {
      directives[parts[0].toLowerCase()] = parts.slice(1);
    }
  }
  return directives;
}

/**
 * Audit the Content-Security-Policy header for common weaknesses.
 */
function auditCsp(cspValue: string | undefined, findings: Finding[]): void {
  if (!cspValue) {
    findings.push({
      id: 'HDR-CSP-MISSING',
      category: 'Security Headers',
      title: 'Content-Security-Policy header missing',
      description:
        'The Content-Security-Policy (CSP) header is absent. Without CSP, ' +
        'browsers cannot prevent cross-site scripting (XSS) attacks that ' +
        'inject malicious scripts into page content.',
      severity: 'high',
      location: 'Content-Security-Policy',
      remediation:
        "Add a strict Content-Security-Policy header. Start with " +
        "'Content-Security-Policy: default-src \\'self\\'; " +
        "script-src \\'self\\'; object-src \\'none\\'; " +
        "base-uri \\'self\\'' and tighten from there.",
    });
    return;
  }

  const directives = parseCsp(cspValue);

  // Unsafe inline script check
  const scriptSrc = directives['script-src'] ?? directives['default-src'] ?? [];
  if (scriptSrc.includes("'unsafe-inline'")) {
    findings.push({
      id: 'HDR-CSP-UNSAFE-INLINE',
      category: 'Security Headers',
      title: 'CSP allows unsafe-inline scripts',
      description:
        "The Content-Security-Policy includes 'unsafe-inline' in script-src, " +
        'which allows inline JavaScript execution and negates XSS protection.',
      severity: 'medium',
      location: 'Content-Security-Policy: script-src',
      evidence: cspValue,
      remediation:
        "Remove 'unsafe-inline' from script-src. Use nonces or hashes for " +
        'legitimate inline scripts instead.',
    });
  }

  // Unsafe eval check
  if (scriptSrc.includes("'unsafe-eval'")) {
    findings.push({
      id: 'HDR-CSP-UNSAFE-EVAL',
      category: 'Security Headers',
      title: "CSP allows 'unsafe-eval'",
      description:
        "The Content-Security-Policy includes 'unsafe-eval' in script-src, " +
        'which allows dynamic code execution via eval() and similar APIs.',
      severity: 'medium',
      location: 'Content-Security-Policy: script-src',
      evidence: cspValue,
      remediation:
        "Remove 'unsafe-eval' from script-src. Refactor code that relies on " +
        'eval(), new Function(), or similar dynamic execution.',
    });
  }

  // Wildcard source check
  const hasWildcard = Object.values(directives).some((values) =>
    values.some((v) => v === '*'),
  );
  if (hasWildcard) {
    findings.push({
      id: 'HDR-CSP-WILDCARD',
      category: 'Security Headers',
      title: 'CSP uses wildcard (*) source',
      description:
        'One or more CSP directives allow resources from any origin (*), ' +
        'which effectively disables the restriction for those resource types.',
      severity: 'medium',
      location: 'Content-Security-Policy',
      evidence: cspValue,
      remediation:
        'Replace wildcard sources with explicit, trusted domains. Audit each ' +
        'resource type and restrict to the minimum set of origins needed.',
    });
  }
}

/**
 * Audit the Strict-Transport-Security header.
 */
function auditHsts(hstsValue: string | undefined, findings: Finding[]): void {
  if (!hstsValue) {
    findings.push({
      id: 'HDR-HSTS-MISSING',
      category: 'Security Headers',
      title: 'Strict-Transport-Security header missing',
      description:
        'The HTTP Strict-Transport-Security (HSTS) header is absent. Without ' +
        'HSTS, browsers may send requests over unencrypted HTTP, exposing ' +
        'users to protocol downgrade and man-in-the-middle attacks.',
      severity: 'high',
      location: 'Strict-Transport-Security',
      remediation:
        'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload. ' +
        'Ensure the site is fully served over HTTPS before enabling.',
    });
    return;
  }

  const maxAgeMatch = /max-age=(\d+)/i.exec(hstsValue);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;

  if (maxAge < 31536000) {
    findings.push({
      id: 'HDR-HSTS-SHORT-MAX-AGE',
      category: 'Security Headers',
      title: 'HSTS max-age is too short',
      description:
        `Strict-Transport-Security max-age is ${maxAge} seconds ` +
        '(less than 1 year / 31536000 seconds). A short max-age reduces the ' +
        'protection window and allows browsers to fall back to HTTP sooner.',
      severity: 'low',
      location: 'Strict-Transport-Security',
      evidence: hstsValue,
      remediation:
        'Set max-age to at least 31536000 (1 year): ' +
        'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload.',
    });
  }

  if (!hstsValue.toLowerCase().includes('includesubdomains')) {
    findings.push({
      id: 'HDR-HSTS-NO-SUBDOMAINS',
      category: 'Security Headers',
      title: 'HSTS does not include subdomains',
      description:
        'The Strict-Transport-Security header is missing the includeSubDomains ' +
        'directive, leaving subdomains unprotected from protocol downgrade attacks.',
      severity: 'low',
      location: 'Strict-Transport-Security',
      evidence: hstsValue,
      remediation:
        'Add the includeSubDomains directive: ' +
        'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload.',
    });
  }
}

/**
 * Audit the X-Frame-Options header.
 */
function auditXFrameOptions(
  value: string | undefined,
  findings: Finding[],
): void {
  if (!value) {
    findings.push({
      id: 'HDR-XFO-MISSING',
      category: 'Security Headers',
      title: 'X-Frame-Options header missing',
      description:
        'The X-Frame-Options header is absent. Without it, the page can be ' +
        'embedded in iframes on malicious sites, enabling clickjacking attacks ' +
        "that trick users into performing unintended actions on the page.",
      severity: 'medium',
      location: 'X-Frame-Options',
      remediation:
        "Add 'X-Frame-Options: DENY' or 'X-Frame-Options: SAMEORIGIN'. " +
        "Alternatively, use CSP's frame-ancestors directive for more granular control.",
    });
    return;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized !== 'DENY' && normalized !== 'SAMEORIGIN') {
    findings.push({
      id: 'HDR-XFO-INVALID',
      category: 'Security Headers',
      title: 'X-Frame-Options has an invalid or permissive value',
      description:
        `X-Frame-Options value '${value}' is not one of the valid options ` +
        "(DENY or SAMEORIGIN). The ALLOW-FROM directive is deprecated and " +
        'not supported by all browsers.',
      severity: 'medium',
      location: 'X-Frame-Options',
      evidence: value,
      remediation:
        "Use 'X-Frame-Options: DENY' to block all framing, or " +
        "'X-Frame-Options: SAMEORIGIN' to allow only same-origin framing.",
    });
  }
}

/**
 * Audit the X-Content-Type-Options header.
 */
function auditXContentTypeOptions(
  value: string | undefined,
  findings: Finding[],
): void {
  if (!value) {
    findings.push({
      id: 'HDR-XCTO-MISSING',
      category: 'Security Headers',
      title: 'X-Content-Type-Options header missing',
      description:
        'The X-Content-Type-Options header is absent. Without "nosniff", ' +
        'browsers may MIME-sniff responses and execute files as a different ' +
        'content type, enabling MIME-type confusion attacks.',
      severity: 'medium',
      location: 'X-Content-Type-Options',
      remediation: "Add 'X-Content-Type-Options: nosniff' to all responses.",
    });
    return;
  }

  if (value.trim().toLowerCase() !== 'nosniff') {
    findings.push({
      id: 'HDR-XCTO-INVALID',
      category: 'Security Headers',
      title: "X-Content-Type-Options is not 'nosniff'",
      description:
        `X-Content-Type-Options value '${value}' is not the expected 'nosniff'. ` +
        'Only the nosniff directive provides MIME-type sniffing protection.',
      severity: 'low',
      location: 'X-Content-Type-Options',
      evidence: value,
      remediation: "Set X-Content-Type-Options: nosniff exactly.",
    });
  }
}

/**
 * Audit the Referrer-Policy header.
 */
function auditReferrerPolicy(
  value: string | undefined,
  findings: Finding[],
): void {
  if (!value) {
    findings.push({
      id: 'HDR-RP-MISSING',
      category: 'Security Headers',
      title: 'Referrer-Policy header missing',
      description:
        'The Referrer-Policy header is absent. By default, browsers may send ' +
        'the full URL (including path and query string) as the Referer header ' +
        'to third-party sites, potentially leaking sensitive URL parameters.',
      severity: 'low',
      location: 'Referrer-Policy',
      remediation:
        "Add 'Referrer-Policy: strict-origin-when-cross-origin' or " +
        "'no-referrer' to prevent URL leakage to third parties.",
    });
  }
}

/**
 * Audit the Permissions-Policy header (formerly Feature-Policy).
 */
function auditPermissionsPolicy(
  value: string | undefined,
  findings: Finding[],
): void {
  if (!value) {
    findings.push({
      id: 'HDR-PP-MISSING',
      category: 'Security Headers',
      title: 'Permissions-Policy header missing',
      description:
        'The Permissions-Policy header is absent. Without it, the browser ' +
        'may grant access to powerful APIs (camera, microphone, geolocation) ' +
        'to embedded iframes and third-party scripts by default.',
      severity: 'informational',
      location: 'Permissions-Policy',
      remediation:
        "Add 'Permissions-Policy: camera=(), microphone=(), geolocation=()' " +
        'to disable browser APIs not required by the application.',
    });
  }
}

/**
 * Audits HTTP response headers for security misconfigurations.
 *
 * Checks for: CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
 * Referrer-Policy, and Permissions-Policy.
 *
 * @param headers - Raw HTTP response headers (case-insensitive).
 * @returns List of security findings with remediation guidance.
 *
 * @example
 * ```typescript
 * const response = await fetch('https://example.com');
 * const headers = Object.fromEntries(response.headers.entries());
 * const findings = auditSecurityHeaders(headers);
 * ```
 */
export function auditSecurityHeaders(
  headers: Record<string, string | string[]>,
): Finding[] {
  const findings: Finding[] = [];
  const normalized = normalizeHeaders(headers);

  auditCsp(normalized['content-security-policy'], findings);
  auditHsts(normalized['strict-transport-security'], findings);
  auditXFrameOptions(normalized['x-frame-options'], findings);
  auditXContentTypeOptions(normalized['x-content-type-options'], findings);
  auditReferrerPolicy(normalized['referrer-policy'], findings);
  auditPermissionsPolicy(normalized['permissions-policy'], findings);

  return findings;
}

/**
 * Returns the highest severity found in a list of findings, or null
 * if the findings list is empty.
 */
export function getHighestSeverity(findings: Finding[]): Severity | null {
  const order: Severity[] = [
    'critical',
    'high',
    'medium',
    'low',
    'informational',
  ];
  for (const severity of order) {
    if (findings.some((f) => f.severity === severity)) {
      return severity;
    }
  }
  return null;
}
