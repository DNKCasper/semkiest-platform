import * as jwt from 'jsonwebtoken';
import { createAuthMiddleware } from './auth';
import type { SocketData } from '../types/websocket';

const SECRET = 'test-secret-that-is-long-enough-for-hmac';

/** Minimal socket mock used across tests */
function makeSocket(token?: string, authHeader?: string): {
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, string>;
  };
  data: Partial<SocketData>;
} {
  return {
    handshake: {
      auth: token ? { token } : {},
      headers: authHeader ? { authorization: authHeader } : {},
    },
    data: {},
  };
}

function validToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'member',
      projectIds: ['proj-a', 'proj-b'],
      ...overrides,
    },
    SECRET,
    { expiresIn: '1h' },
  );
}

describe('createAuthMiddleware', () => {
  const middleware = createAuthMiddleware(SECRET);

  it('calls next() and populates socket.data for a valid token in auth.token', () => {
    const socket = makeSocket(validToken());
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe('user-1');
    expect(socket.data.orgId).toBe('org-1');
    expect(socket.data.role).toBe('member');
    expect(socket.data.projectIds).toEqual(['proj-a', 'proj-b']);
  });

  it('accepts a token from the Authorization header', () => {
    const socket = makeSocket(undefined, `Bearer ${validToken()}`);
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe('user-1');
  });

  it('defaults projectIds to [] when absent from the token', () => {
    const socket = makeSocket(validToken({ projectIds: undefined }));
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.projectIds).toEqual([]);
  });

  it('calls next(Error) when no token is provided', () => {
    const socket = makeSocket();
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    const [err] = next.mock.calls[0] as [Error];
    expect(err.message).toMatch(/No token provided/);
  });

  it('calls next(Error) for an expired token', () => {
    const expiredToken = jwt.sign(
      { userId: 'u', orgId: 'o', role: 'member' },
      SECRET,
      { expiresIn: -1 },
    );
    const socket = makeSocket(expiredToken);
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    const [err] = next.mock.calls[0] as [Error];
    expect(err.message).toMatch(/Invalid or expired token/);
  });

  it('calls next(Error) for a token signed with a different secret', () => {
    const token = jwt.sign({ userId: 'u', orgId: 'o', role: 'member' }, 'wrong-secret');
    const socket = makeSocket(token);
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls next(Error) when the payload is missing required fields', () => {
    // Token without orgId
    const token = jwt.sign({ userId: 'u', role: 'member' }, SECRET);
    const socket = makeSocket(token);
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    const [err] = next.mock.calls[0] as [Error];
    expect(err.message).toMatch(/Malformed token payload/);
  });

  it('calls next(Error) for an unknown role value', () => {
    const token = jwt.sign({ userId: 'u', orgId: 'o', role: 'superuser' }, SECRET);
    const socket = makeSocket(token);
    const next = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
