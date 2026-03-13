/**
 * AuthHandler — responsible for authenticating against a target application
 * before the Explorer Agent begins crawling.
 *
 * Supported mechanisms:
 *  - Form-based login (username/password in HTML form fields)
 *  - Cookie injection (pre-baked session cookies)
 *  - Bearer token (injected as an HTTP header)
 *  - OAuth browser-based login flow
 *
 * Credentials are NEVER logged. The handler redacts sensitive values before
 * writing any diagnostic output.
 */

import type {
  AuthConfig,
  AuthResult,
  BearerTokenAuthConfig,
  CookieAuthConfig,
  CookieEntry,
  FormAuthConfig,
  Logger,
  OAuthAuthConfig,
  PlaywrightBrowserContext,
  PlaywrightPage,
  SessionState,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LOGIN_TIMEOUT_MS = 10_000;
const DEFAULT_OAUTH_TIMEOUT_MS = 30_000;
const DEFAULT_SUBMIT_SELECTOR = '[type="submit"]';

// ---------------------------------------------------------------------------
// AuthHandler
// ---------------------------------------------------------------------------

/**
 * Handles pre-crawl authentication against a target application.
 *
 * Usage:
 * ```ts
 * const handler = new AuthHandler(logger);
 * const result = await handler.authenticate(context, authConfig);
 * if (!result.success) throw new Error(result.error);
 * ```
 */
export class AuthHandler {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Authenticates the provided Playwright browser context using the supplied
   * configuration.  Returns an `AuthResult` indicating success or failure
   * along with the resulting `SessionState`.
   *
   * Credentials are never written to logs.
   */
  async authenticate(
    context: PlaywrightBrowserContext,
    config: AuthConfig,
  ): Promise<AuthResult> {
    switch (config.type) {
      case 'none':
        return this.handleNone();
      case 'cookie':
        return this.handleCookie(context, config);
      case 'bearer':
        return this.handleBearer(context, config);
      case 'form':
        return this.handleForm(context, config);
      case 'oauth':
        return this.handleOAuth(context, config);
      default: {
        // Exhaustive check — TypeScript narrows `config` to `never` here.
        const exhaustive: never = config;
        return {
          success: false,
          error: `Unknown auth type: ${(exhaustive as AuthConfig).type}`,
        };
      }
    }
  }

  /**
   * Detects whether a page appears to require authentication by examining
   * its URL and DOM against the provided indicators.
   *
   * @param page         - The Playwright page to inspect.
   * @param indicators   - URL substrings or CSS selectors that signal auth is required.
   * @param loginUrl     - Optional known login page URL for an exact match.
   */
  async isAuthRequired(
    page: PlaywrightPage,
    indicators: string[] = [],
    loginUrl?: string,
  ): Promise<boolean> {
    const currentUrl = page.url();

    // Direct URL match against a known login page.
    if (loginUrl && currentUrl.includes(loginUrl)) {
      this.logger.debug('Auth required: page URL matches login URL', { currentUrl });
      return true;
    }

    // Common login-page URL patterns.
    const commonLoginPatterns = ['/login', '/signin', '/sign-in', '/auth', '/authenticate'];
    if (commonLoginPatterns.some((p) => currentUrl.toLowerCase().includes(p))) {
      this.logger.debug('Auth required: URL matches common login pattern', { currentUrl });
      return true;
    }

    // Custom indicators (URL substrings or CSS selectors).
    for (const indicator of indicators) {
      if (currentUrl.includes(indicator)) {
        this.logger.debug('Auth required: URL matches custom indicator', {
          indicator,
          currentUrl,
        });
        return true;
      }

      // Try as a CSS selector.
      try {
        const element = await page.$(indicator);
        if (element) {
          this.logger.debug('Auth required: CSS selector found on page', { indicator });
          return true;
        }
      } catch {
        // Not a valid CSS selector — ignore.
      }
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** No authentication — return an anonymous session. */
  private handleNone(): AuthResult {
    this.logger.info('Auth type is "none"; proceeding without authentication.');
    return {
      success: true,
      session: {
        isAuthenticated: false,
        authType: 'none',
      },
    };
  }

  /**
   * Cookie injection: add the provided cookies to the browser context so
   * that subsequent requests are sent with the appropriate session cookie(s).
   */
  private async handleCookie(
    context: PlaywrightBrowserContext,
    config: CookieAuthConfig,
  ): Promise<AuthResult> {
    this.logger.info('Injecting cookies into browser context.', {
      cookieCount: config.cookies.length,
      cookieNames: config.cookies.map((c) => c.name),
    });

    try {
      await context.addCookies(config.cookies);

      const storedCookies = await context.cookies();
      const injectedNames = new Set(config.cookies.map((c) => c.name));
      const verified = storedCookies.filter((c) => injectedNames.has(c.name));

      if (verified.length !== config.cookies.length) {
        const missing = config.cookies
          .filter((c) => !verified.find((v) => v.name === c.name))
          .map((c) => c.name);
        this.logger.warn('Some cookies could not be verified after injection.', { missing });
      }

      const session: SessionState = {
        isAuthenticated: true,
        authType: 'cookie',
        cookies: storedCookies as CookieEntry[],
      };

      this.logger.info('Cookie authentication succeeded.');
      return { success: true, session };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Cookie injection failed.', { error: message });
      return { success: false, error: `Cookie injection failed: ${message}` };
    }
  }

  /**
   * Bearer token injection: set an extra HTTP header on every request made
   * by the browser context so that protected API/page requests carry the
   * Authorization (or custom) header.
   */
  private async handleBearer(
    context: PlaywrightBrowserContext,
    config: BearerTokenAuthConfig,
  ): Promise<AuthResult> {
    const headerName = config.headerName ?? 'Authorization';
    const prefix = config.prefix ?? 'Bearer ';

    this.logger.info('Injecting bearer token into browser context.', { headerName });

    try {
      await context.setExtraHTTPHeaders({
        [headerName]: `${prefix}${config.token}`,
      });

      const session: SessionState = {
        isAuthenticated: true,
        authType: 'bearer',
        bearerToken: config.token,
      };

      this.logger.info('Bearer token authentication succeeded.');
      return { success: true, session };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Bearer token injection failed.', { error: message });
      return { success: false, error: `Bearer token injection failed: ${message}` };
    }
  }

  /**
   * Form-based login: navigate to the login page, fill in credentials, and
   * submit the form.  Verifies success using `successIndicator` or by
   * checking that the URL has changed away from the login page.
   */
  private async handleForm(
    context: PlaywrightBrowserContext,
    config: FormAuthConfig,
  ): Promise<AuthResult> {
    const timeoutMs = config.loginTimeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
    const submitSelector = config.submitSelector ?? DEFAULT_SUBMIT_SELECTOR;
    const waitForNav = config.waitForNavigation !== false;

    this.logger.info('Starting form-based authentication.', {
      loginUrl: config.loginUrl,
      usernameSelector: config.usernameSelector,
      passwordSelector: config.passwordSelector,
      submitSelector,
    });

    let page: PlaywrightPage | undefined;

    try {
      page = await context.newPage();

      // Navigate to login page.
      await page.goto(config.loginUrl, { timeout: timeoutMs, waitUntil: 'networkidle' });

      // Wait for username field.
      await page.waitForSelector(config.usernameSelector, { timeout: timeoutMs });

      // Fill credentials — values are NOT logged.
      await page.fill(config.usernameSelector, config.username);
      await page.fill(config.passwordSelector, config.password);

      // Submit the form.
      if (waitForNav) {
        const [, ] = await Promise.all([
          page.waitForNavigation({ timeout: timeoutMs }),
          page.click(submitSelector),
        ]);
      } else {
        await page.click(submitSelector);
      }

      // Verify login success.
      const success = await this.verifyFormLogin(page, config);
      if (!success) {
        this.logger.warn('Form login completed but success indicator not detected.', {
          currentUrl: page.url(),
          successIndicator: config.successIndicator,
        });
        return {
          success: false,
          error:
            'Form login did not reach the expected post-login state. ' +
            'Check credentials and selectors.',
        };
      }

      const cookies = (await context.cookies()) as CookieEntry[];
      const session: SessionState = {
        isAuthenticated: true,
        authType: 'form',
        cookies,
      };

      this.logger.info('Form-based authentication succeeded.', { postLoginUrl: page.url() });
      return { success: true, session };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Form-based authentication failed.', { error: message });
      return { success: false, error: `Form login failed: ${message}` };
    } finally {
      if (page) {
        await page.close().catch(() => undefined);
      }
    }
  }

  /**
   * OAuth browser-based login: similar to form login but designed for OAuth
   * provider pages that may redirect multiple times.  Optionally extracts an
   * access token from the page after login.
   */
  private async handleOAuth(
    context: PlaywrightBrowserContext,
    config: OAuthAuthConfig,
  ): Promise<AuthResult> {
    const timeoutMs = config.loginTimeoutMs ?? DEFAULT_OAUTH_TIMEOUT_MS;
    const submitSelector = config.submitSelector ?? DEFAULT_SUBMIT_SELECTOR;

    this.logger.info('Starting OAuth authentication flow.', {
      loginUrl: config.loginUrl,
      usernameSelector: config.usernameSelector,
    });

    let page: PlaywrightPage | undefined;

    try {
      page = await context.newPage();

      await page.goto(config.loginUrl, { timeout: timeoutMs, waitUntil: 'networkidle' });
      await page.waitForSelector(config.usernameSelector, { timeout: timeoutMs });

      // Fill credentials — values are NOT logged.
      await page.fill(config.usernameSelector, config.username);
      await page.fill(config.passwordSelector, config.password);

      await Promise.all([
        page.waitForNavigation({ timeout: timeoutMs }),
        page.click(submitSelector),
      ]);

      // Extract token if a custom extractor was provided.
      let bearerToken: string | undefined;
      if (config.tokenExtractor) {
        bearerToken = await config.tokenExtractor(context);
        if (bearerToken) {
          await context.setExtraHTTPHeaders({
            Authorization: `Bearer ${bearerToken}`,
          });
        }
      }

      const cookies = (await context.cookies()) as CookieEntry[];
      const session: SessionState = {
        isAuthenticated: true,
        authType: 'oauth',
        cookies,
        bearerToken,
      };

      this.logger.info('OAuth authentication succeeded.', { postLoginUrl: page.url() });
      return { success: true, session };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('OAuth authentication failed.', { error: message });
      return { success: false, error: `OAuth login failed: ${message}` };
    } finally {
      if (page) {
        await page.close().catch(() => undefined);
      }
    }
  }

  /**
   * Verifies that a form login was successful by checking the post-login URL
   * or DOM against the `successIndicator` configured by the caller.
   */
  private async verifyFormLogin(page: PlaywrightPage, config: FormAuthConfig): Promise<boolean> {
    const currentUrl = page.url();

    if (!config.successIndicator) {
      // Default: accept if we are no longer on the login URL.
      return !currentUrl.includes(config.loginUrl);
    }

    // Check if the indicator is a URL substring.
    if (currentUrl.includes(config.successIndicator)) {
      return true;
    }

    // Try as a CSS selector.
    try {
      const element = await page.$(config.successIndicator);
      return element !== null;
    } catch {
      return false;
    }
  }
}
