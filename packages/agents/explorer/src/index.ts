/**
 * @semkiest/explorer — Explorer Agent package.
 *
 * Public API surface for authentication handling, session management,
 * site crawling, and sitemap building.
 */

export { AuthHandler } from './auth-handler';
export { SessionManager } from './session-manager';
export { SiteCrawler } from './site-crawler';
export { SitemapBuilder } from './sitemap-builder';

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

  // Site crawling & sitemap
  CrawlConfig,
  CrawledPage,
  CrawlResult,
  SitemapNode,

  // Playwright compatibility shims (for consumers that need to type-check)
  PlaywrightBrowserContext,
  PlaywrightPage,

  // Logger
  Logger,
} from './types';
