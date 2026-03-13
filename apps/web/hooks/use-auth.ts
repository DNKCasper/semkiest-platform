'use client';

import { useContext } from 'react';
import { AuthContext } from '../lib/auth-context';
import type { AuthContextValue } from '../types/auth';

/**
 * Access the global auth state and auth actions.
 * Must be used inside <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
