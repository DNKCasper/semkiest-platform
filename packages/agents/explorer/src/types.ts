/**
 * Authentication and session types for the Explorer Agent.
 *
 * Supports form-based, cookie-based, bearer token, and OAuth authentication
 * mechanisms for crawling protected areas of applications.
 */

// ---------------------------------------------------------------------------
// Authentication configuration types
// ---------------------------------------------------------------------------

/**
 * Supported authentication mechanisms for the Explorer Agent.
 */
export type AuthType = 'form' | 'cookie' | 'bearer' | 'oauth' | 'none';

/**
 * A single browser cookie to inject into a Playwright browser context.
 */
export interface CookieEntry {
  name: string;
  value: string;
  /** Cookie domain (e.g. ".example.com"). Required for Playwright injection. */
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  /** Expiry timestamp in seconds since Unix epoch. */
  expires?: number;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Form-based login configuration.
 * The agent navigates to `loginUrl`, fills in username/password fields,
 * and submits the form before starting the crawl.
 */
export interface FormAuthConfig {
  type: 'form';
  /** URL of the login page (absolute). */
  loginUrl: string;
  /** CSS selector for the username/email input field. */
  usernameSelector: string;
  /** CSS selector for the password input field. */
  passwordSelector: string;
  /** CSS selector for the submit button. Defaults to `[type="submit"]`. */
  submitSelector?: string;
  /** Username / email credential. Prefer reading from env at call-site. */
  username: string;
  /** Password credential. Prefer reading from env at call-site. */
  password: string;
  /**
   * A URL pattern or CSS selector that the agent checks after login to
   * confirm the login was successful. If the URL contains this string
   * (or the selector is present in the DOM) the login is considered
   * successful.  When omitted the agent checks that the page URL changed
   * away from `loginUrl`.
   */
  successIndicator?: string;
  /** Wait for full navigation after submit. Defaults to true. */
  waitForNavigation?: boolean;
  /**
   * Maximum milliseconds to wait for the post-login page to settle.
   * Defaults to 10 000 ms.
   */
  loginTimeoutMs?: number;
}

/**
 * Cookie injection configuration.
 * Cookies are injected into the Playwright browser context before crawling
 * begins — no login UI interaction required.
 */
export interface CookieAuthConfig {
  type: 'cookie';
  cookies: CookieEntry[];
}

/**
 * Bearer token authentication configuration.
 * The token is sent as an HTTP header on every request intercepted by
 * the Playwright browser context.
 */
export interface BearerTokenAuthConfig {
  type: 'bearer';
  token: string;
  /** HTTP header name. Defaults to `"Authorization"`. */
  headerName?: string;
  /** Header value prefix. Defaults to `"Bearer "`. */
  prefix?: string;
}

/**
 * OAuth / OpenID Connect configuration.
 * The agent performs a browser-based OAuth login flow before crawling.
 */
export interface OAuthAuthConfig {
  type: 'oauth';
  /** URL where the OAuth provider presents the login UI. */
  loginUrl: string;
  /** CSS selector for the username/email input field. */
  usernameSelector: string;
  /** CSS selector for the password input field. */
  passwordSelector: string;
  /** CSS selector for the submit/continue button. */
  submitSelector?: string;
  /** Username credential. Prefer reading from env at call-site. */
  username: string;
  /** Password credential. Prefer reading from env at call-site. */
  password: string;
  /**
   * Optional callback that extracts the access token from the page after
   * successful OAuth login (e.g. from localStorage / sessionStorage).
   */
  tokenExtractor?: (context: PlaywrightBrowserContext) => Promise<string>;
  /** Maximum milliseconds for the OAuth flow. Defaults to 30 000 ms. */
  loginTimeoutMs?: number;
}

/**
 * No authentication required; crawl public pages only.
 */
export interface NoAuthConfig {
  type: 'none';
}

/** Union of all supported authentication configuration types. */
export type AuthConfig =
  | FormAuthConfig
  | CookieAuthConfig
  | BearerTokenAuthConfig
  | OAuthAuthConfig
  | NoAuthConfig;

// ---------------------------------------------------------------------------
// Credential sets (multi-role support)
// ---------------------------------------------------------------------------

/**
 * A named credential set that associates a user role with authentication
 * configuration.  This allows the crawler to test the same application
 * as multiple user roles (e.g. "admin", "editor", "viewer").
 */
export interface CredentialSet {
  /** Human-readable role name (e.g. "admin", "guest"). */
  role: string;
  /** Authentication configuration for this role. */
  auth: AuthConfig;
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/**
 * Snapshot of the current authentication session maintained by the
 * SessionManager.
 */
export interface SessionState {
  /** Whether the session is currently authenticated. */
  isAuthenticated: boolean;
  /** Which authentication mechanism was used to establish the session. */
  authType: AuthType;
  /** Cookies present in the browser context after authentication. */
  cookies?: CookieEntry[];
  /** Active bearer token (if bearer or oauth auth was used). */
  bearerToken?: string;
  /**
   * Timestamp after which the session should be considered expired and
   * re-authentication attempted.
   */
  expiresAt?: Date;
  /** Identifier for the authenticated user (if discoverable). */
  userId?: string;
  /** Role that was used to create this session. */
  role?: string;
}

// ---------------------------------------------------------------------------
// Authentication results
// ---------------------------------------------------------------------------

/**
 * Result returned by AuthHandler after an authentication attempt.
 */
export interface AuthResult {
  /** Whether the authentication was successful. */
  success: boolean;
  /** Session state established by the successful authentication. */
  session?: SessionState;
  /** Human-readable error message (only present when `success` is false). */
  error?: string;
}

// ---------------------------------------------------------------------------
// Crawl authentication options
// ---------------------------------------------------------------------------

/**
 * Options controlling authentication behaviour during a crawl operation.
 */
export interface CrawlAuthOptions {
  /**
   * Authentication configuration.  Supply a single `AuthConfig` to use one
   * set of credentials, or an array of `CredentialSet` objects to test
   * multiple user roles.
   */
  credentials?: AuthConfig | CredentialSet[];
  /**
   * How long (in milliseconds) an established session is considered valid
   * before the agent will attempt re-authentication.  Defaults to 3 600 000
   * (1 hour).
   */
  sessionTimeoutMs?: number;
  /**
   * Whether to attempt re-authentication automatically when the agent detects
   * that it has been redirected to a login page mid-crawl.  Defaults to true.
   */
  retryOnAuthFailure?: boolean;
  /**
   * Maximum number of re-authentication attempts before giving up.
   * Defaults to 3.
   */
  maxAuthRetries?: number;
  /**
   * CSS selectors or URL patterns that indicate a page requires
   * authentication.  The agent uses these to detect mid-crawl auth failures.
   */
  authRequiredIndicators?: string[];
}

// ---------------------------------------------------------------------------
// Playwright compatibility shim
// ---------------------------------------------------------------------------

/**
 * Minimal interface representing a Playwright BrowserContext so that callers
 * do not need to import the full playwright package at the type level.
 * The actual Playwright BrowserContext is structurally compatible.
 */
export interface PlaywrightBrowserContext {
  addCookies(cookies: CookieEntry[]): Promise<void>;
  cookies(urls?: string[]): Promise<CookieEntry[]>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

/**
 * Minimal interface representing a Playwright Page so that auth handler
 * logic can be unit-tested without requiring a real browser.
 */
export interface PlaywrightPage {
  goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
  waitForNavigation(options?: { timeout?: number }): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  url(): string;
  $(selector: string): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

/**
 * Minimal logging interface accepted by AuthHandler and SessionManager.
 * Compatible with console, pino, winston, etc.
 */
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Site crawling types
// ---------------------------------------------------------------------------

/**
 * Configuration for a site crawl operation.
 *
 * Controls URL discovery, concurrency, depth, and filtering behavior.
 */
export interface CrawlConfig {
  /** Starting URL for the crawl (absolute, must be valid HTTP/HTTPS). */
  startUrl: string;

  /** Maximum depth from the starting URL. Defaults to 5. */
  maxDepth?: number;

  /** Maximum number of pages to crawl before stopping. Defaults to 100. */
  maxPages?: number;

  /** Number of concurrent browser pages. Defaults to 3. */
  concurrency?: number;

  /** Per-page navigation timeout in milliseconds. Defaults to 30 000 ms. */
  timeout?: number;

  /** Regex patterns — only crawl URLs matching at least one. Optional. */
  includePatterns?: RegExp[];

  /** Regex patterns — skip URLs matching any of these. Optional. */
  excludePatterns?: RegExp[];

  /** Whether to respect robots.txt directives. Defaults to false. */
  respectRobotsTxt?: boolean;

  /** Whether to follow links to external domains. Defaults to false. */
  followExternalLinks?: boolean;

  /** Authentication configuration for crawling protected pages. Optional. */
  auth?: CrawlAuthOptions;
}

/**
 * Metadata about a single page discovered during a crawl.
 */
export interface CrawledPage {
  /** The original URL as discovered on a parent page. */
  url: string;

  /** Normalized URL (trailing slash, query params removed). */
  normalizedUrl: string;

  /** Page title from <title> tag or Open Graph. */
  title: string;

  /** HTTP status code (200, 404, 500, etc.). */
  statusCode: number;

  /** Content type from HTTP headers (e.g. "text/html"). */
  contentType: string;

  /** Depth from the starting URL (0 = start page). */
  depth: number;

  /** All unique links discovered on this page. */
  links: string[];

  /** Timestamp when the page was crawled. */
  discoveredAt: Date;

  /** Time taken to load the page (milliseconds). */
  loadTimeMs: number;

  /** URL of the page that linked to this one (if not the start URL). */
  parentUrl?: string;
}

/**
 * Hierarchical node in a sitemap tree.
 */
export interface SitemapNode {
  /** The page URL. */
  url: string;

  /** The page title. */
  title: string;

  /** Depth from the starting URL. */
  depth: number;

  /** Child pages (pages linked from this page). */
  children: SitemapNode[];
}

/**
 * Complete result of a site crawl operation.
 */
export interface CrawlResult {
  /** All pages discovered during the crawl. */
  pages: CrawledPage[];

  /** Hierarchical sitemap built from discovered pages. */
  sitemap: SitemapNode[];

  /** Crawl statistics and summary. */
  statistics: {
    /** Total pages crawled (not including skipped/failed). */
    totalPages: number;

    /** Total unique links found across all pages. */
    totalLinks: number;

    /** Maximum depth reached during the crawl. */
    maxDepthReached: number;

    /** Average page load time in milliseconds. */
    avgLoadTimeMs: number;

    /** Number of pages that failed to load. */
    errorCount: number;

    /** Total crawl duration in milliseconds. */
    durationMs: number;
  };
}
