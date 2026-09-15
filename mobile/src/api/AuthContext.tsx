import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './client';
import { wyrdStream } from './sse';

interface AuthState {
  status: 'checking' | 'signedOut' | 'signedIn';
  username: string | null;
  error: string | null;
  busy: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('checking');
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        if (me.ok && me.username) {
          setUsername(me.username);
          setStatus('signedIn');
          wyrdStream.start();
          return;
        }
      } catch {
        // network error on boot — fall through to signed-out (gate screen), user can retry
      }
      setStatus('signedOut');
    })();
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(u, p);
      if (res.ok && res.username) {
        setUsername(res.username);
        setStatus('signedIn');
        wyrdStream.restart();
        return true;
      }
      setError(res.error || 'login failed');
      return false;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not reach WYRD');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const register = useCallback(async (u: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.register(u, p);
      if (res.ok && res.username) {
        setUsername(res.username);
        setStatus('signedIn');
        wyrdStream.restart();
        return true;
      }
      setError(res.error || 'registration failed');
      return false;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not reach WYRD');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await api.logout().catch(() => {});
    } finally {
      await api.clearLocalSession();
      wyrdStream.stop();
      setUsername(null);
      setStatus('signedOut');
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ status, username, error, busy, login, register, logout, clearError }),
    [status, username, error, busy, login, register, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
