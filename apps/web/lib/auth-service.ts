import type {
  LoginInput,
  LoginResponse,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateProfileInput,
  NotificationPreferences,
  ApiKey,
  ApiKeyCreated,
  Session,
  AuthTokens,
  User,
} from '../types/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Token storage keys */
const TOKEN_KEY = 'auth_tokens';

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

export function storeTokens(tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  // Also set cookie for middleware to read
  const maxAge = Math.floor((tokens.expiresAt - Date.now()) / 1000);
  document.cookie = `auth_token=${tokens.accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearStoredTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
}

export function isTokenExpired(tokens: AuthTokens): boolean {
  // Consider expired 60s before actual expiry for safety margin
  return Date.now() >= tokens.expiresAt - 60_000;
}

/** Pending refresh promise to queue concurrent requests */
let refreshPromise: Promise<AuthTokens | null> | null = null;

async function authRequest<T>(
  path: string,
  options?: RequestInit & { skipAuth?: boolean },
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const tokens = getStoredTokens();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (!options?.skipAuth && tokens) {
    // Refresh token if close to expiry
    if (isTokenExpired(tokens)) {
      if (!refreshPromise) {
        refreshPromise = authApi.refreshTokens(tokens.refreshToken).finally(() => {
          refreshPromise = null;
        });
      }
      const refreshed = await refreshPromise;
      if (refreshed) {
        headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      }
    } else {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `HTTP error ${response.status}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { message?: string; code?: string };
      if (body.message) message = body.message;
      if (body.code) code = body.code;
    } catch {
      // ignore parse errors
    }

    // On 401, redirect to login (handled by callers)
    throw new AuthError(response.status, message, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const authApi = {
  /** POST /api/auth/login */
  login(input: LoginInput): Promise<LoginResponse> {
    return authRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  /** POST /api/auth/register */
  register(input: RegisterInput): Promise<{ message: string }> {
    return authRequest<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  /** POST /api/auth/forgot-password */
  forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
    return authRequest<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  /** POST /api/auth/reset-password */
  resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    return authRequest<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
  },

  /** POST /api/auth/refresh */
  async refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
    try {
      const tokens = await authRequest<AuthTokens>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        skipAuth: true,
      });
      storeTokens(tokens);
      return tokens;
    } catch {
      clearStoredTokens();
      return null;
    }
  },

  /** POST /api/auth/logout */
  logout(): Promise<void> {
    return authRequest<void>('/api/auth/logout', { method: 'POST' });
  },

  /** GET /api/auth/me */
  me(): Promise<User> {
    return authRequest<User>('/api/auth/me');
  },
};

export const userApi = {
  /** PUT /api/users/profile */
  updateProfile(input: UpdateProfileInput): Promise<User> {
    return authRequest<User>('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** GET /api/users/notifications */
  getNotificationPreferences(): Promise<NotificationPreferences> {
    return authRequest<NotificationPreferences>('/api/users/notifications');
  },

  /** PUT /api/users/notifications */
  updateNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
    return authRequest<NotificationPreferences>('/api/users/notifications', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  },

  /** GET /api/users/api-keys */
  listApiKeys(): Promise<ApiKey[]> {
    return authRequest<ApiKey[]>('/api/users/api-keys');
  },

  /** POST /api/users/api-keys */
  createApiKey(name: string): Promise<ApiKeyCreated> {
    return authRequest<ApiKeyCreated>('/api/users/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  /** DELETE /api/users/api-keys/:id */
  deleteApiKey(id: string): Promise<void> {
    return authRequest<void>(`/api/users/api-keys/${id}`, { method: 'DELETE' });
  },

  /** PUT /api/users/password */
  changePassword(input: ChangePasswordInput): Promise<void> {
    return authRequest<void>('/api/users/password', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** GET /api/users/sessions */
  listSessions(): Promise<Session[]> {
    return authRequest<Session[]>('/api/users/sessions');
  },

  /** DELETE /api/users/sessions */
  revokeOtherSessions(): Promise<void> {
    return authRequest<void>('/api/users/sessions/others', { method: 'DELETE' });
  },

  /** DELETE /api/users/account */
  deleteAccount(): Promise<void> {
    return authRequest<void>('/api/users/account', { method: 'DELETE' });
  },
};

export { AuthError };
