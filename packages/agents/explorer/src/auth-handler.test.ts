import { AuthHandler } from './auth-handler';
import type {
  BearerTokenAuthConfig,
  CookieAuthConfig,
  FormAuthConfig,
  Logger,
  OAuthAuthConfig,
  PlaywrightBrowserContext,
  PlaywrightPage,
} from './types';

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function makePage(overrides: Partial<PlaywrightPage> = {}): PlaywrightPage {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForNavigation: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue('https://app.example.com/dashboard'),
    $: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeContext(overrides: Partial<PlaywrightBrowserContext> = {}): PlaywrightBrowserContext {
  return {
    addCookies: jest.fn().mockResolvedValue(undefined),
    cookies: jest.fn().mockResolvedValue([]),
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined),
    newPage: jest.fn().mockResolvedValue(makePage()),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthHandler', () => {
  let logger: Logger;
  let handler: AuthHandler;

  beforeEach(() => {
    logger = makeLogger();
    handler = new AuthHandler(logger);
  });

  // -------------------------------------------------------------------------
  // none
  // -------------------------------------------------------------------------

  describe('authenticate — type: none', () => {
    it('returns a successful unauthenticated session', async () => {
      const context = makeContext();
      const result = await handler.authenticate(context, { type: 'none' });

      expect(result.success).toBe(true);
      expect(result.session?.isAuthenticated).toBe(false);
      expect(result.session?.authType).toBe('none');
    });
  });

  // -------------------------------------------------------------------------
  // cookie
  // -------------------------------------------------------------------------

  describe('authenticate — type: cookie', () => {
    const cookieConfig: CookieAuthConfig = {
      type: 'cookie',
      cookies: [
        { name: 'session', value: 'abc123', domain: '.example.com' },
        { name: 'csrf', value: 'xyz456', domain: '.example.com' },
      ],
    };

    it('injects cookies into the context and returns success', async () => {
      const storedCookies = [
        { name: 'session', value: 'abc123', domain: '.example.com' },
        { name: 'csrf', value: 'xyz456', domain: '.example.com' },
      ];
      const context = makeContext({ cookies: jest.fn().mockResolvedValue(storedCookies) });

      const result = await handler.authenticate(context, cookieConfig);

      expect(context.addCookies).toHaveBeenCalledWith(cookieConfig.cookies);
      expect(result.success).toBe(true);
      expect(result.session?.isAuthenticated).toBe(true);
      expect(result.session?.authType).toBe('cookie');
      expect(result.session?.cookies).toEqual(storedCookies);
    });

    it('warns when fewer cookies are verified than injected', async () => {
      // Only one cookie comes back from context.cookies().
      const context = makeContext({
        cookies: jest.fn().mockResolvedValue([
          { name: 'session', value: 'abc123', domain: '.example.com' },
        ]),
      });

      const result = await handler.authenticate(context, cookieConfig);

      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Some cookies could not be verified'),
        expect.objectContaining({ missing: ['csrf'] }),
      );
    });

    it('returns failure when addCookies throws', async () => {
      const context = makeContext({
        addCookies: jest.fn().mockRejectedValue(new Error('Cookies rejected')),
      });

      const result = await handler.authenticate(context, cookieConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cookie injection failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // bearer
  // -------------------------------------------------------------------------

  describe('authenticate — type: bearer', () => {
    const bearerConfig: BearerTokenAuthConfig = {
      type: 'bearer',
      token: 'supersecret-token',
    };

    it('sets the Authorization header and returns success', async () => {
      const context = makeContext();

      const result = await handler.authenticate(context, bearerConfig);

      expect(context.setExtraHTTPHeaders).toHaveBeenCalledWith({
        Authorization: 'Bearer supersecret-token',
      });
      expect(result.success).toBe(true);
      expect(result.session?.authType).toBe('bearer');
      expect(result.session?.bearerToken).toBe('supersecret-token');
    });

    it('uses a custom header name and prefix', async () => {
      const context = makeContext();
      const config: BearerTokenAuthConfig = {
        type: 'bearer',
        token: 'mytoken',
        headerName: 'X-Auth-Token',
        prefix: 'Token ',
      };

      await handler.authenticate(context, config);

      expect(context.setExtraHTTPHeaders).toHaveBeenCalledWith({
        'X-Auth-Token': 'Token mytoken',
      });
    });

    it('returns failure when setExtraHTTPHeaders throws', async () => {
      const context = makeContext({
        setExtraHTTPHeaders: jest.fn().mockRejectedValue(new Error('Header error')),
      });

      const result = await handler.authenticate(context, bearerConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bearer token injection failed');
    });
  });

  // -------------------------------------------------------------------------
  // form
  // -------------------------------------------------------------------------

  describe('authenticate — type: form', () => {
    const formConfig: FormAuthConfig = {
      type: 'form',
      loginUrl: 'https://app.example.com/login',
      usernameSelector: '#username',
      passwordSelector: '#password',
      username: 'testuser',
      password: 'testpassword',
      successIndicator: '/dashboard',
    };

    it('fills form fields and submits, returning success when URL matches indicator', async () => {
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/dashboard'),
      });
      const context = makeContext({ newPage: jest.fn().mockResolvedValue(page) });

      const result = await handler.authenticate(context, formConfig);

      expect(page.goto).toHaveBeenCalledWith(formConfig.loginUrl, expect.any(Object));
      expect(page.fill).toHaveBeenCalledWith('#username', 'testuser');
      expect(page.fill).toHaveBeenCalledWith('#password', 'testpassword');
      expect(page.click).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.session?.authType).toBe('form');
    });

    it('returns failure when success indicator is not matched', async () => {
      const page = makePage({
        // Still on login page — login failed.
        url: jest.fn().mockReturnValue('https://app.example.com/login?error=1'),
        $: jest.fn().mockResolvedValue(null),
      });
      const context = makeContext({ newPage: jest.fn().mockResolvedValue(page) });

      const result = await handler.authenticate(context, formConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Form login did not reach');
    });

    it('succeeds when successIndicator matches a CSS selector in the DOM', async () => {
      const configWithSelector: FormAuthConfig = {
        ...formConfig,
        successIndicator: '.dashboard-header',
      };
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/dashboard'),
        // The selector is found.
        $: jest.fn().mockResolvedValue({}),
      });
      const context = makeContext({ newPage: jest.fn().mockResolvedValue(page) });

      const result = await handler.authenticate(context, configWithSelector);

      expect(result.success).toBe(true);
    });

    it('succeeds without successIndicator when URL changes away from loginUrl', async () => {
      const configNoIndicator: FormAuthConfig = {
        ...formConfig,
        successIndicator: undefined,
      };
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/home'),
      });
      const context = makeContext({ newPage: jest.fn().mockResolvedValue(page) });

      const result = await handler.authenticate(context, configNoIndicator);

      expect(result.success).toBe(true);
    });

    it('closes the page even when an error is thrown', async () => {
      const page = makePage({
        goto: jest.fn().mockRejectedValue(new Error('Navigation failed')),
      });
      const context = makeContext({ newPage: jest.fn().mockResolvedValue(page) });

      const result = await handler.authenticate(context, formConfig);

      expect(page.close).toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // oauth
  // -------------------------------------------------------------------------

  describe('authenticate — type: oauth', () => {
    const oauthConfig: OAuthAuthConfig = {
      type: 'oauth',
      loginUrl: 'https://auth.example.com/oauth/login',
      usernameSelector: '#email',
      passwordSelector: '#password',
      username: 'user@example.com',
      password: 'secret',
    };

    it('performs OAuth login and returns a session with cookies', async () => {
      const cookies = [{ name: 'oauth_session', value: 'token123', domain: '.example.com' }];
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/callback'),
      });
      const context = makeContext({
        newPage: jest.fn().mockResolvedValue(page),
        cookies: jest.fn().mockResolvedValue(cookies),
      });

      const result = await handler.authenticate(context, oauthConfig);

      expect(result.success).toBe(true);
      expect(result.session?.authType).toBe('oauth');
      expect(result.session?.cookies).toEqual(cookies);
    });

    it('calls tokenExtractor and injects the returned token', async () => {
      const extractedToken = 'extracted-jwt-token';
      const config: OAuthAuthConfig = {
        ...oauthConfig,
        tokenExtractor: jest.fn().mockResolvedValue(extractedToken),
      };
      const context = makeContext({
        newPage: jest.fn().mockResolvedValue(makePage()),
        cookies: jest.fn().mockResolvedValue([]),
      });

      const result = await handler.authenticate(context, config);

      expect(config.tokenExtractor).toHaveBeenCalledWith(context);
      expect(context.setExtraHTTPHeaders).toHaveBeenCalledWith({
        Authorization: `Bearer ${extractedToken}`,
      });
      expect(result.session?.bearerToken).toBe(extractedToken);
    });
  });

  // -------------------------------------------------------------------------
  // isAuthRequired
  // -------------------------------------------------------------------------

  describe('isAuthRequired', () => {
    it('returns false for a regular non-login page', async () => {
      const page = makePage({ url: jest.fn().mockReturnValue('https://app.example.com/products') });

      const required = await handler.isAuthRequired(page);

      expect(required).toBe(false);
    });

    it('returns true when URL contains a common login pattern', async () => {
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/login?redirect=/products'),
      });

      const required = await handler.isAuthRequired(page);

      expect(required).toBe(true);
    });

    it('returns true when current URL matches the provided loginUrl', async () => {
      const page = makePage({
        url: jest.fn().mockReturnValue('https://auth.example.com/signin'),
      });

      const required = await handler.isAuthRequired(page, [], 'https://auth.example.com/signin');

      expect(required).toBe(true);
    });

    it('returns true when a custom URL indicator is present', async () => {
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/session-expired'),
      });

      const required = await handler.isAuthRequired(page, ['session-expired']);

      expect(required).toBe(true);
    });

    it('returns true when a custom CSS selector indicator is found on the page', async () => {
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/protected'),
        $: jest.fn().mockResolvedValue({}), // selector found
      });

      const required = await handler.isAuthRequired(page, ['.login-required-banner']);

      expect(required).toBe(true);
    });

    it('returns false when CSS selector indicator is not found', async () => {
      const page = makePage({
        url: jest.fn().mockReturnValue('https://app.example.com/products'),
        $: jest.fn().mockResolvedValue(null),
      });

      const required = await handler.isAuthRequired(page, ['.login-required-banner']);

      expect(required).toBe(false);
    });
  });
});
