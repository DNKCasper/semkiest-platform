/**
 * @semkiest/explorer — Explorer Agent package.
 *
 * Public API surface for authentication handling and session management.
 */

export { AuthHandler } from './auth-handler';
export { SessionManager } from './session-manager';

export type {
  // Authentication configuration
  AuthType,
  AuthConfig,
  NoAuthConfig,
  FormAuthConfig,
  CookieAuthConfig,
  BearerTokenAuthConfig,
  OAuthAuthConfig,
  CookieEntry,

  // Credential sets (multi-role)
  CredentialSet,

  // Session state & results
  SessionState,
  AuthResult,

  // Crawl options
  CrawlAuthOptions,

  // Playwright compatibility shims (for consumers that need to type-check)
  PlaywrightBrowserContext,
  PlaywrightPage,

  // Logger
  Logger,
} from './types';
