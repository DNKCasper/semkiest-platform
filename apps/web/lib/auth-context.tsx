'use client';

import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthContextValue, User } from '../types/auth';
import type { LoginInput, RegisterInput } from '../types/auth';
import {
  authApi,
  clearStoredTokens,
  getStoredTokens,
  isTokenExpired,
  storeTokens,
} from './auth-service';

export const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_INTERVAL_MS = 4 * 60 * 1000; // Check every 4 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(async () => {
      const tokens = getStoredTokens();
      if (tokens && isTokenExpired(tokens)) {
        const refreshed = await authApi.refreshTokens(tokens.refreshToken);
        if (!refreshed) {
          setUser(null);
          clearStoredTokens();
        }
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  const stopRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  /** Try to load existing session on mount */
  useEffect(() => {
    async function initAuth() {
      const tokens = getStoredTokens();
      if (!tokens) {
        setIsLoading(false);
        return;
      }

      try {
        // Refresh if expired before fetching user
        if (isTokenExpired(tokens)) {
          const refreshed = await authApi.refreshTokens(tokens.refreshToken);
          if (!refreshed) {
            setIsLoading(false);
            return;
          }
        }

        const me = await authApi.me();
        setUser(me);
        scheduleRefresh();
      } catch {
        clearStoredTokens();
      } finally {
        setIsLoading(false);
      }
    }

    void initAuth();

    return () => stopRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const { user: loggedInUser, tokens } = await authApi.login(input);
      storeTokens(tokens);
      setUser(loggedInUser);
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { user: newUser, tokens } = await authApi.register(input);
      storeTokens(tokens);
      setUser(newUser);
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Proceed even if server logout fails
    } finally {
      clearStoredTokens();
      setUser(null);
      stopRefresh();
    }
  }, [stopRefresh]);

  const refreshTokens = useCallback(async (): Promise<boolean> => {
    const tokens = getStoredTokens();
    if (!tokens) return false;
    const refreshed = await authApi.refreshTokens(tokens.refreshToken);
    return refreshed !== null;
  }, []);

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      refreshTokens,
      updateUser,
    }),
    [user, isLoading, login, register, logout, refreshTokens, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
