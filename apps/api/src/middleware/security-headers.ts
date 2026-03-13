import helmet from 'helmet';
import cors from 'cors';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface SecurityMiddlewareOptions {
  /** Comma-separated or pre-split list of allowed CORS origins. */
  corsOrigins: string | string[];
  /** Whether the app is running in production (enables stricter settings). */
  isProduction?: boolean;
  /**
   * HSTS max-age in seconds.
   * Default: 1 year (31 536 000 s).
   */
  hstsMaxAge?: number;
}

/**
 * Returns Helmet middleware configured with sensible production defaults.
 *
 * Enabled headers:
 *  - Content-Security-Policy (restrictive default-src)
 *  - X-DNS-Prefetch-Control
 *  - X-Frame-Options (DENY)
 *  - X-Content-Type-Options (nosniff)
 *  - Referrer-Policy (no-referrer)
 *  - Permissions-Policy
 *  - HSTS (in production, with 1-year max-age and preload)
 */
export function createHelmetMiddleware(options: SecurityMiddlewareOptions): RequestHandler {
  const { isProduction = process.env['NODE_ENV'] === 'production', hstsMaxAge = 31_536_000 } =
    options;

  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding where needed
    hsts: isProduction
      ? { maxAge: hstsMaxAge, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
  });
}

/**
 * Returns CORS middleware configured for the given allowed origins.
 *
 * In production only the explicit allow-list is accepted; in development
 * localhost origins are also permitted. Credentials (cookies / auth headers)
 * are supported.
 */
export function createCorsMiddleware(options: SecurityMiddlewareOptions): RequestHandler {
  const { isProduction = process.env['NODE_ENV'] === 'production' } = options;

  const rawOrigins = Array.isArray(options.corsOrigins)
    ? options.corsOrigins
    : options.corsOrigins.split(',').map((o) => o.trim()).filter(Boolean);

  // In non-production, also allow localhost variants if not already included
  const allowedOrigins: (string | RegExp)[] = [...rawOrigins];
  if (!isProduction) {
    allowedOrigins.push(/^http:\/\/localhost(:\d+)?$/);
    allowedOrigins.push(/^http:\/\/127\.0\.0\.1(:\d+)?$/);
  }

  return cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header)
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = allowedOrigins.some((o) =>
        typeof o === 'string' ? o === origin : o.test(origin),
      );
      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: origin '${origin}' is not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Organization-Id',
      'X-Request-Id',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
    maxAge: 86_400, // preflight cache: 24 h
  });
}

/**
 * Middleware that enforces HTTPS in production by redirecting plain HTTP
 * requests to their HTTPS equivalent. Trusts the X-Forwarded-Proto header
 * set by load balancers / reverse proxies.
 *
 * In non-production environments this middleware is a no-op.
 */
export function createTlsEnforcementMiddleware(
  options: Pick<SecurityMiddlewareOptions, 'isProduction'>,
): RequestHandler {
  const isProduction = options.isProduction ?? process.env['NODE_ENV'] === 'production';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isProduction) {
      next();
      return;
    }

    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    if (proto === 'https') {
      next();
      return;
    }

    const httpsUrl = `https://${req.hostname}${req.originalUrl}`;
    res.redirect(301, httpsUrl);
  };
}

/**
 * Adds a unique request identifier to every incoming request and response.
 * Downstream handlers can read `req.id` to correlate logs.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'] as string | undefined;
  const id = existingId ?? generateRequestId();
  (req as Request & { id: string }).id = id;
  res.set('X-Request-Id', id);
  next();
}

function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
