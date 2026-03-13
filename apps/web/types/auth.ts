/**
 * Authentication and user account domain types for the SemkiEst platform.
 */

export type UserRole = 'admin' | 'member' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp (ms) when the access token expires */
  expiresAt: number;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdateProfileInput {
  name?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface NotificationPreferences {
  emailNotifications: boolean;
  testCompletion: boolean;
  testFailure: boolean;
  weeklySummary: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  /** Masked key prefix shown to user, e.g. "sk_live_abc..." */
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** Only returned once at creation time */
export interface ApiKeyCreated extends ApiKey {
  secret: string;
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  ipAddress: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  updateUser: (user: User) => void;
}
