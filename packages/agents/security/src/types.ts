/**
 * Severity levels for security findings, ordered from most to least critical.
 * Based on OWASP Risk Rating Methodology.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/**
 * A security vulnerability or issue discovered during scanning.
 */
export interface Finding {
  /** Unique identifier for deduplication */
  id: string;
  /** OWASP category or vulnerability class */
  category: string;
  /** Short, descriptive title */
  title: string;
  /** Detailed explanation of the vulnerability */
  description: string;
  /** Severity rating */
  severity: Severity;
  /** Where the vulnerability was found (URL, header name, parameter, etc.) */
  location?: string;
  /** Evidence or payload that triggered the finding */
  evidence?: string;
  /** Actionable steps to remediate the vulnerability */
  remediation: string;
}

/**
 * Target for security scanning.
 */
export interface ScanTarget {
  /** Base URL to scan */
  url: string;
  /** Optional HTTP headers to include in all requests */
  headers?: Record<string, string>;
  /** Optional cookies to include in all requests */
  cookies?: Record<string, string>;
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
}

/**
 * Result from a single scanner module.
 */
export interface ScanResult {
  /** The scan target */
  target: ScanTarget;
  /** Discovered findings */
  findings: Finding[];
  /** When the scan completed */
  scannedAt: Date;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Aggregated security report from all scanner modules.
 */
export interface SecurityReport {
  /** The scan target */
  target: ScanTarget;
  /** All findings across all scanners */
  findings: Finding[];
  /** Summary statistics */
  summary: {
    /** Total finding count */
    total: number;
    /** Count grouped by severity */
    bySeverity: Record<Severity, number>;
  };
  /** When the report was generated */
  scannedAt: Date;
  /** Total scan duration in milliseconds */
  duration: number;
}

/**
 * Minimal browser page interface compatible with Playwright's Page API.
 * Allows XSS/SQLi scanners to work with real browsers without requiring
 * Playwright as a hard dependency — any compatible implementation works.
 */
export interface BrowserPage {
  goto(
    url: string,
    options?: { waitUntil?: string; timeout?: number },
  ): Promise<unknown>;
  content(): Promise<string>;
  evaluate<T>(
    pageFunction: string | ((...args: unknown[]) => T),
  ): Promise<T>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * HTTP response wrapper for scanner consumption.
 */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
}

/**
 * Injectable fetch function type — enables mocking in tests.
 */
export type FetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<HttpResponse>;

/**
 * TLS certificate details extracted during SSL validation.
 */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  protocol: string;
  cipher: string;
  bits: number;
}

/**
 * Injectable TLS connect function type — enables mocking in tests.
 */
export type TlsConnectFn = (
  hostname: string,
  port: number,
) => Promise<CertificateInfo>;

/**
 * CSRF token validation result for a single page.
 */
export interface CsrfValidationResult {
  /** Whether a CSRF token was found on the page */
  hasToken: boolean;
  /** The name of the CSRF token field, if found */
  tokenFieldName?: string;
  /** Security findings related to CSRF protection */
  findings: Finding[];
}
