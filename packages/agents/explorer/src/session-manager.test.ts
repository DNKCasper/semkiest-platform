import { AuthHandler } from './auth-handler';
import { SessionManager } from './session-manager';
import type {
  AuthConfig,
  AuthResult,
  CookieAuthConfig,
  CredentialSet,
  CrawlAuthOptions,
  FormAuthConfig,
  Logger,
  PlaywrightBrowserContext,
  PlaywrightPage,
  SessionState,
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
    url: jest.fn().mockReturnValue('https://app.example.com/products'),
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

function makeAuthHandler(result: Partial<AuthResult> = {}): jest.Mocked<AuthHandler> {
  const defaultSession: SessionState = {
    isAuthenticated: true,
    authType: 'cookie',
    cookies: [],
  };
  const defaultResult: AuthResult = { success: true, session: defaultSession, ...result };

  return {
    authenticate: jest.fn().mockResolvedValue(defaultResult),
    isAuthRequired: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<AuthHandler>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionManager', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  // -------------------------------------------------------------------------
  // initialize
  // -------------------------------------------------------------------------

  describe('initialize', () => {
    it('returns anonymous session when no credentials are provided', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();

      const result = await manager.initialize(context, undefined);

      expect(authHandler.authenticate).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.session?.isAuthenticated).toBe(false);
      expect(result.session?.authType).toBe('none');
    });

    it('authenticates with a single AuthConfig', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      const auth: CookieAuthConfig = { type: 'cookie', cookies: [] };

      const result = await manager.initialize(context, auth);

      expect(authHandler.authenticate).toHaveBeenCalledWith(context, auth);
      expect(result.success).toBe(true);
      expect(manager.isAuthenticated()).toBe(true);
    });

    it('authenticates the first role from a CredentialSet array', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      const credentials: CredentialSet[] = [
        { role: 'admin', auth: { type: 'cookie', cookies: [] } },
        { role: 'viewer', auth: { type: 'bearer', token: 'viewer-token' } },
      ];

      await manager.initialize(context, credentials);

      // Only the first credential is authenticated at init time.
      expect(authHandler.authenticate).toHaveBeenCalledTimes(1);
      expect(authHandler.authenticate).toHaveBeenCalledWith(context, credentials[0].auth);
      expect(manager.getRoles()).toEqual(['admin', 'viewer']);
    });

    it('returns failure result when authentication fails', async () => {
      const authHandler = makeAuthHandler({ success: false, session: undefined, error: 'Bad creds' });
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();

      const result = await manager.initialize(context, { type: 'none' });

      // type:none bypasses authenticate — use cookie to trigger failure
      const authHandler2 = makeAuthHandler({ success: false, session: undefined, error: 'Bad' });
      const manager2 = new SessionManager(logger, authHandler2);
      const result2 = await manager2.initialize(context, { type: 'cookie', cookies: [] });

      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Bad');
    });
  });

  // -------------------------------------------------------------------------
  // ensureAuthenticated
  // -------------------------------------------------------------------------

  describe('ensureAuthenticated', () => {
    it('returns true for an authenticated session', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      await manager.initialize(context, { type: 'cookie', cookies: [] });

      const page = makePage();
      const ok = await manager.ensureAuthenticated(context, page);

      expect(ok).toBe(true);
    });

    it('returns true for a none-type session (no auth needed)', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      await manager.initialize(context, undefined);

      const page = makePage();
      const ok = await manager.ensureAuthenticated(context, page);

      expect(ok).toBe(true);
    });

    it('re-authenticates when isAuthRequired returns true and retries are enabled', async () => {
      const authHandler = makeAuthHandler();
      (authHandler.isAuthRequired as jest.Mock).mockResolvedValue(true);
      const manager = new SessionManager(logger, authHandler, {
        retryOnAuthFailure: true,
        maxAuthRetries: 3,
      });
      const context = makeContext();
      await manager.initialize(context, { type: 'cookie', cookies: [] });

      const page = makePage();
      const ok = await manager.ensureAuthenticated(context, page);

      // authenticate called once during init + once during re-auth
      expect(authHandler.authenticate).toHaveBeenCalledTimes(2);
      expect(ok).toBe(true);
    });

    it('returns false when isAuthRequired is true and retries are disabled', async () => {
      const authHandler = makeAuthHandler();
      (authHandler.isAuthRequired as jest.Mock).mockResolvedValue(true);
      const manager = new SessionManager(logger, authHandler, { retryOnAuthFailure: false });
      const context = makeContext();
      await manager.initialize(context, { type: 'cookie', cookies: [] });

      const page = makePage();
      const ok = await manager.ensureAuthenticated(context, page);

      expect(ok).toBe(false);
    });

    it('re-authenticates when session is expired', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler, { sessionTimeoutMs: 1 });
      const context = makeContext();
      await manager.initialize(context, { type: 'cookie', cookies: [] });

      // Force expiry.
      await new Promise((r) => setTimeout(r, 10));

      const page = makePage();
      const ok = await manager.ensureAuthenticated(context, page);

      expect(authHandler.authenticate).toHaveBeenCalledTimes(2);
      expect(ok).toBe(true);
    });

    it('returns false when max retries are exhausted', async () => {
      const failingHandler = makeAuthHandler({ success: false, session: undefined, error: 'fail' });
      (failingHandler.isAuthRequired as jest.Mock).mockResolvedValue(true);

      // We need an initial successful init, then subsequent failures.
      let callCount = 0;
      (failingHandler.authenticate as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            session: { isAuthenticated: true, authType: 'cookie' as const },
          });
        }
        return Promise.resolve({ success: false, error: 'fail' });
      });

      const manager = new SessionManager(logger, failingHandler, { maxAuthRetries: 2 });
      const context = makeContext();
      await manager.initialize(context, { type: 'cookie', cookies: [] });

      const page = makePage();

      // First retry fails.
      await manager.ensureAuthenticated(context, page);
      // Second retry fails.
      await manager.ensureAuthenticated(context, page);
      // Max exceeded.
      const ok = await manager.ensureAuthenticated(context, page);

      expect(ok).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Max authentication retries exceeded'),
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // switchRole
  // -------------------------------------------------------------------------

  describe('switchRole', () => {
    it('switches active role and authenticates with the new role credentials', async () => {
      const authHandler = makeAuthHandler();
      const credentials: CredentialSet[] = [
        { role: 'admin', auth: { type: 'cookie', cookies: [] } },
        { role: 'viewer', auth: { type: 'bearer', token: 'viewer-token' } },
      ];
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      await manager.initialize(context, credentials);

      await manager.switchRole(context, 'viewer');

      expect(authHandler.authenticate).toHaveBeenCalledWith(
        context,
        credentials[1].auth,
      );
    });

    it('throws when switching to an unregistered role', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      await manager.initialize(context, { type: 'none' });

      await expect(manager.switchRole(context, 'nonexistent')).rejects.toThrow(
        'Role "nonexistent" is not registered',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getSession / getRoles / isAuthenticated
  // -------------------------------------------------------------------------

  describe('getSession / getRoles / isAuthenticated', () => {
    it('returns null before initialization', () => {
      const manager = new SessionManager(logger, makeAuthHandler());

      expect(manager.getSession('default')).toBeNull();
      expect(manager.isAuthenticated('default')).toBe(false);
    });

    it('returns the session state after successful initialization', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      await manager.initialize(context, { type: 'cookie', cookies: [] });

      const session = manager.getSession();

      expect(session).not.toBeNull();
      expect(session?.isAuthenticated).toBe(true);
    });

    it('returns all registered role names', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      const credentials: CredentialSet[] = [
        { role: 'admin', auth: { type: 'none' } },
        { role: 'editor', auth: { type: 'none' } },
      ];
      await manager.initialize(context, credentials);

      expect(manager.getRoles()).toEqual(['admin', 'editor']);
    });
  });

  // -------------------------------------------------------------------------
  // clearSessions
  // -------------------------------------------------------------------------

  describe('clearSessions', () => {
    it('clears session state and removes cookies/headers from context', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext();
      await manager.initialize(context, { type: 'cookie', cookies: [] });

      await manager.clearSessions(context);

      expect(context.addCookies).toHaveBeenLastCalledWith([]);
      expect(context.setExtraHTTPHeaders).toHaveBeenLastCalledWith({});
      expect(manager.getSession()).toBeNull();
      expect(manager.isAuthenticated()).toBe(false);
    });

    it('does not throw when context operations fail (e.g. context is closed)', async () => {
      const authHandler = makeAuthHandler();
      const manager = new SessionManager(logger, authHandler);
      const context = makeContext({
        addCookies: jest.fn().mockRejectedValue(new Error('Context closed')),
        setExtraHTTPHeaders: jest.fn().mockRejectedValue(new Error('Context closed')),
      });

      await expect(manager.clearSessions(context)).resolves.not.toThrow();
    });
  });
});
