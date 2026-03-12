import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { optionalAuth, requireAuth } from './auth.js';

const ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32chars';

beforeEach(() => {
  process.env['JWT_ACCESS_SECRET'] = ACCESS_SECRET;
});

afterEach(() => {
  delete process.env['JWT_ACCESS_SECRET'];
});

function makeToken(overrides: Record<string, unknown> = {}, expired = false) {
  const payload = { email: 'test@example.com', role: 'viewer', ...overrides };
  if (expired) {
    // Create an already-expired token by backdating iat/exp manually
    return jwt.sign(
      { ...payload, iat: Math.floor(Date.now() / 1000) - 3600, exp: Math.floor(Date.now() / 1000) - 1800 },
      ACCESS_SECRET,
      { algorithm: 'HS256', subject: 'user-1' },
    );
  }
  return jwt.sign(payload, ACCESS_SECRET, { subject: 'user-1', expiresIn: '15m', algorithm: 'HS256' });
}

function mockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as Partial<Request>;
}

function mockRes(): { status: jest.Mock; json: jest.Mock } & Partial<Response> {
  const res: { status: jest.Mock; json: jest.Mock } & Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('optionalAuth', () => {
  it('calls next with no user when Authorization header is absent', () => {
    const req = mockReq() as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('attaches user to req when a valid Bearer token is provided', () => {
    const token = makeToken();
    const req = mockReq(`Bearer ${token}`) as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe('user-1');
    expect(req.user?.email).toBe('test@example.com');
  });

  it('calls next without error when an invalid token is provided', () => {
    const req = mockReq('Bearer invalid.token.here') as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });
});

describe('requireAuth', () => {
  it('returns 401 when Authorization header is absent', () => {
    const req = mockReq() as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches user and calls next for a valid Bearer token', () => {
    const token = makeToken();
    const req = mockReq(`Bearer ${token}`) as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe('user-1');
  });

  it('returns 401 for an expired token', () => {
    const token = makeToken({}, true);
    const req = mockReq(`Bearer ${token}`) as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('expired') }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token', () => {
    const req = mockReq('Bearer bad.token.value') as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
