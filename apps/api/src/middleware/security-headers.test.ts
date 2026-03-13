import express, { type Express } from 'express';
import request from 'supertest';
import {
  createHelmetMiddleware,
  createCorsMiddleware,
  createTlsEnforcementMiddleware,
  requestIdMiddleware,
} from './security-headers';

function buildApp(corsOrigins = 'http://localhost:3000', isProduction = false): Express {
  const app = express();
  const opts = { corsOrigins, isProduction };
  app.use(requestIdMiddleware);
  app.use(createTlsEnforcementMiddleware({ isProduction }));
  app.use(createHelmetMiddleware(opts));
  app.use(createCorsMiddleware(opts));
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requestIdMiddleware', () => {
  it('generates an X-Request-Id header when none is provided', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.headers['x-request-id']).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  it('echoes an existing X-Request-Id back to the client', async () => {
    const res = await request(buildApp())
      .get('/test')
      .set('X-Request-Id', 'my-trace-id-123');
    expect(res.headers['x-request-id']).toBe('my-trace-id-123');
  });
});

describe('createHelmetMiddleware', () => {
  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('does NOT set HSTS in development', async () => {
    const res = await request(buildApp('http://localhost:3000', false)).get('/test');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('sets HSTS in production', async () => {
    const res = await request(buildApp('http://localhost:3000', true)).get('/test');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });
});

describe('createCorsMiddleware', () => {
  it('returns Access-Control-Allow-Origin for an allowed origin', async () => {
    const res = await request(buildApp('https://app.example.com'))
      .get('/test')
      .set('Origin', 'https://app.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('does NOT return ACAO header for a disallowed origin in production', async () => {
    const res = await request(buildApp('https://app.example.com', true))
      .get('/test')
      .set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes X-RateLimit-* headers', async () => {
    const res = await request(buildApp())
      .options('/test')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-expose-headers']).toContain('X-RateLimit-Limit');
  });
});

describe('createTlsEnforcementMiddleware', () => {
  it('does NOT redirect in development', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.status).toBe(200);
  });

  it('redirects HTTP to HTTPS in production', async () => {
    const app = express();
    app.use(createTlsEnforcementMiddleware({ isProduction: true }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toMatch(/^https:\/\//);
  });

  it('does NOT redirect when X-Forwarded-Proto is https', async () => {
    const app = express();
    app.use(createTlsEnforcementMiddleware({ isProduction: true }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
  });
});
