/**
 * SessionManager — maintains authentication state across multiple page
 * requests during a crawl.
 *
 * Responsibilities:
 *  - Store the active session state after authentication.
 *  - Detect session expiration (time-based or redirect-based).
 *  - Trigger re-authentication when the session has expired.
 *  - Support multiple concurrent credential sets (multi-role crawls).
 *  - Clear sessions cleanly when the crawl is complete.
 */

import { AuthHandler } from './auth-handler';
import type {
  AuthConfig,
  AuthResult,
  CrawlAuthOptions,
  CredentialSet,
  Logger,
  PlaywrightBrowserContext,
  PlaywrightPage,
  SessionState,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_AUTH_RETRIES = 3;
const DEFAULT_RETRY_ON_AUTH_FAILURE = true;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RoleSession {
  role: string;
  auth: AuthConfig;
  state: SessionState | null;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

/**
 * Manages authentication sessions for the Explorer Agent.
 *
 * Usage:
 * ```ts
 * const manager = new SessionManager(logger, authHandler, options);
 * await manager.initialize(context);
 *
 * // Before navigating to a page:
 * const ok = await manager.ensureAuthenticated(context, page);
 * if (!ok) { skip page; }
 *
 * // After crawl:
 * await manager.clearSessions(context);
 * ```
 */
export class SessionManager {
  private readonly logger: Logger;
  private readonly authHandler: AuthHandler;
  private readonly options: Required<
    Pick<
      CrawlAuthOptions,
      'sessionTimeoutMs' | 'retryOnAuthFailure' | 'maxAuthRetries' | 'authRequiredIndicators'
    >
  >;

  /** Sessions keyed by role name. 'default' is used for single-credential crawls. */
  private sessions: Map<string, RoleSession> = new Map();

  /** The currently active role. */
  private activeRole: string = 'default';

  constructor(logger: Logger, authHandler: AuthHandler, options: CrawlAuthOptions = {}) {
    this.logger = logger;
    this.authHandler = authHandler;
    this.options = {
      sessionTimeoutMs: options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
      retryOnAuthFailure: options.retryOnAuthFailure ?? DEFAULT_RETRY_ON_AUTH_FAILURE,
      maxAuthRetries: options.maxAuthRetries ?? DEFAULT_MAX_AUTH_RETRIES,
      authRequiredIndicators: options.authRequiredIndicators ?? [],
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialises sessions from the provided credential options and
   * authenticates the browser context for the default (first) role.
   *
   * @param context     - Playwright browser context to authenticate.
   * @param credentials - Auth configuration or array of role credential sets.
   */
  async initialize(
    context: PlaywrightBrowserContext,
    credentials?: AuthConfig | CredentialSet[],
  ): Promise<AuthResult> {
    this.sessions.clear();

    if (!credentials) {
      // No credentials supplied — treat as anonymous.
      const noAuthSession: SessionState = { isAuthenticated: false, authType: 'none' };
      this.sessions.set('default', {
        role: 'default',
        auth: { type: 'none' },
        state: noAuthSession,
        retryCount: 0,
      });
      this.activeRole = 'default';
      this.logger.info('No credentials provided; crawling without authentication.');
      return { success: true, session: noAuthSession };
    }

    // Normalise to an array of CredentialSets.
    const credentialSets: CredentialSet[] = Array.isArray(credentials)
      ? credentials
      : [{ role: 'default', auth: credentials }];

    // Populate session map without authenticating yet.
    for (const cs of credentialSets) {
      this.sessions.set(cs.role, { role: cs.role, auth: cs.auth, state: null, retryCount: 0 });
    }

    // Authenticate using the first credential set.
    const firstRole = credentialSets[0].role;
    this.activeRole = firstRole;
    return this.authenticateRole(context, firstRole);
  }

  /**
   * Ensures the browser context is authenticated for the active role before
   * a page is crawled.
   *
   * - If no session exists: authenticate.
   * - If session is expired: re-authenticate.
   * - If the page appears to require auth mid-crawl and retries are
   *   enabled: re-authenticate.
   *
   * Returns `false` if authentication failed and the page should be skipped.
   */
  async ensureAuthenticated(
    context: PlaywrightBrowserContext,
    page: PlaywrightPage,
  ): Promise<boolean> {
    const session = this.sessions.get(this.activeRole);

    if (!session) {
      this.logger.warn('No session found for active role.', { role: this.activeRole });
      return false;
    }

    // If no auth is required, succeed immediately.
    if (session.auth.type === 'none') {
      return true;
    }

    // Check whether the current page signals a lost session.
    const authRequired = await this.authHandler.isAuthRequired(
      page,
      this.options.authRequiredIndicators,
      this.getLoginUrl(session.auth),
    );

    if (authRequired && this.options.retryOnAuthFailure) {
      this.logger.warn('Authentication required detected mid-crawl; attempting re-authentication.', {
        role: this.activeRole,
        currentUrl: page.url(),
      });
      return this.reAuthenticate(context, this.activeRole);
    }

    if (authRequired) {
      this.logger.warn('Authentication required but retries are disabled; skipping page.', {
        role: this.activeRole,
        currentUrl: page.url(),
      });
      return false;
    }

    // Check time-based expiry.
    if (this.isSessionExpired(session.state)) {
      this.logger.info('Session has expired; re-authenticating.', { role: this.activeRole });
      return this.reAuthenticate(context, this.activeRole);
    }

    return session.state?.isAuthenticated ?? false;
  }

  /**
   * Switches the active crawl role and restores the corresponding session
   * (or authenticates if not yet done) into the browser context.
   *
   * @throws If the requested role is not registered.
   */
  async switchRole(context: PlaywrightBrowserContext, role: string): Promise<AuthResult> {
    if (!this.sessions.has(role)) {
      throw new Error(`Role "${role}" is not registered in the session manager.`);
    }
    this.activeRole = role;
    this.logger.info('Switching active role.', { role });
    return this.authenticateRole(context, role);
  }

  /**
   * Returns the session state for a given role, or `null` if not yet
   * authenticated.
   */
  getSession(role: string = this.activeRole): SessionState | null {
    return this.sessions.get(role)?.state ?? null;
  }

  /**
   * Returns the names of all registered roles.
   */
  getRoles(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Returns true if there is at least one authenticated session.
   */
  isAuthenticated(role: string = this.activeRole): boolean {
    return this.sessions.get(role)?.state?.isAuthenticated === true;
  }

  /**
   * Clears all session state and removes cookies / extra headers from the
   * browser context.  Call this when the crawl is complete.
   */
  async clearSessions(context: PlaywrightBrowserContext): Promise<void> {
    this.logger.info('Clearing all sessions.');

    // Remove all cookies from the context.
    try {
      await context.addCookies([]); // Playwright does not have a clearCookies — reassign empty.
    } catch {
      // Non-fatal; context may already be closed.
    }

    // Remove extra HTTP headers (set to empty object).
    try {
      await context.setExtraHTTPHeaders({});
    } catch {
      // Non-fatal.
    }

    for (const [role, session] of this.sessions) {
      this.logger.debug('Clearing session state.', { role });
      session.state = null;
      session.retryCount = 0;
    }

    this.logger.info('All sessions cleared.');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Authenticates the browser context for a specific role and stores the
   * resulting session state.
   */
  private async authenticateRole(
    context: PlaywrightBrowserContext,
    role: string,
  ): Promise<AuthResult> {
    const session = this.sessions.get(role);
    if (!session) {
      return { success: false, error: `Role "${role}" not found.` };
    }

    this.logger.info('Authenticating role.', { role, authType: session.auth.type });

    const result = await this.authHandler.authenticate(context, session.auth);

    if (result.success && result.session) {
      const expiresAt = new Date(Date.now() + this.options.sessionTimeoutMs);
      session.state = { ...result.session, expiresAt, role };
      session.retryCount = 0;
      this.logger.info('Authentication succeeded.', { role, expiresAt });
    } else {
      this.logger.error('Authentication failed.', { role, error: result.error });
    }

    return result;
  }

  /**
   * Attempts to re-authenticate the active role, respecting the maximum
   * retry limit.  Returns `false` when retries are exhausted.
   */
  private async reAuthenticate(
    context: PlaywrightBrowserContext,
    role: string,
  ): Promise<boolean> {
    const session = this.sessions.get(role);
    if (!session) return false;

    if (session.retryCount >= this.options.maxAuthRetries) {
      this.logger.error('Max authentication retries exceeded.', {
        role,
        maxRetries: this.options.maxAuthRetries,
      });
      return false;
    }

    session.retryCount += 1;
    this.logger.info('Re-authentication attempt.', {
      role,
      attempt: session.retryCount,
      maxRetries: this.options.maxAuthRetries,
    });

    const result = await this.authenticateRole(context, role);
    return result.success;
  }

  /**
   * Returns true if the session has passed its expiry timestamp.
   */
  private isSessionExpired(state: SessionState | null): boolean {
    if (!state || !state.isAuthenticated) return false;
    if (!state.expiresAt) return false;
    return new Date() >= state.expiresAt;
  }

  /**
   * Extracts the login URL from an auth config (used by `isAuthRequired`).
   */
  private getLoginUrl(auth: AuthConfig): string | undefined {
    if (auth.type === 'form') return auth.loginUrl;
    if (auth.type === 'oauth') return auth.loginUrl;
    return undefined;
  }
}
