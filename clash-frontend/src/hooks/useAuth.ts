/**
 * useAuth.ts
 *
 * Central auth hook:
 *  - Hydrates AuthUser from localStorage on mount
 *  - After login, auto-creates and registers a session key on-chain
 *  - Bridges into walletStore so existing ClashGame code still works
 */

import { useState, useEffect, useCallback } from 'react';
import type { AuthUser, SessionKey } from '@/services/passkeyService';
import {
  loadAuthUser,
  clearAuthUser,
  saveAuthUser,
  createSessionKey,
  loadSessionKey,
} from '@/services/passkeyService';

export interface UseAuthReturn {
  user:          AuthUser | null;
  sessionKey:    SessionKey | null;
  isLoggedIn:    boolean;
  isLoading:     boolean;
  userAddress:   string;
  login:         (user: AuthUser) => Promise<void>;
  logout:        () => void;
}

export function useAuth(): UseAuthReturn {
  const [user,       setUser]       = useState<AuthUser | null>(null);
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);

  // Re-hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadAuthUser();
    if (saved) {
      setUser(saved);
      const existingKey = loadSessionKey();
      if (existingKey) setSessionKey(existingKey);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (authUser: AuthUser) => {
    setUser(authUser);
    saveAuthUser(authUser);
    try {
      const sk = await createSessionKey(authUser, 60);
      setSessionKey(sk);
    } catch (err) {
      console.warn('[useAuth] Could not create session key:', err);
      setSessionKey(null);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setSessionKey(null);
    clearAuthUser();
  }, []);

  return {
    user,
    sessionKey,
    isLoggedIn:  !!user,
    isLoading,
    userAddress: user?.address ?? '',
    login,
    logout,
  };
}