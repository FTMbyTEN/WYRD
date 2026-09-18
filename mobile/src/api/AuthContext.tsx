import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as serverpodAuth from './serverpodAuth';
import { ServerpodClientError } from './serverpodClient';
import { hasStoredSession, clearAuthTokens } from './serverpodClient';

type Status = 'checking' | 'signedOut' | 'awaitingVerification' | 'awaitingPassword' | 'signedIn';

interface AuthState {
  status: Status;
  email: string | null;
  error: string | null;
  busy: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  startRegister: (email: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<boolean>;
  finishRegister: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  resetToLogin: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ServerpodClientError) return err.message || fallback;
  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(() => 'checking');
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountRequestId, setAccountRequestId] = useState<string | null>(null);
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      // Phase 1: trust a stored token pair without a live round-trip. A proper "is this token
      // still actually valid" check happens once profile.getProfile() (or similar) is wired up
      // in the next batch -- for now a stale/expired token just surfaces as an error on the
      // first real API call, same as any session-expiry case.
      const has = await hasStoredSession();
      setStatus(has ? 'signedIn' : 'signedOut');
    })();
  }, []);

  const login = useCallback(async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      const auth = await serverpodAuth.login(e, p);
      await serverpodAuth.persistAuth(auth);
      setEmail(e);
      setStatus('signedIn');
      return true;
    } catch (err) {
      setError(messageFrom(err, 'could not reach WYRD'));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const startRegister = useCallback(async (e: string) => {
    setBusy(true);
    setError(null);
    try {
      const requestId = await serverpodAuth.startRegistration(e);
      setAccountRequestId(requestId);
      setPendingEmail(e);
      setStatus('awaitingVerification');
      return true;
    } catch (err) {
      setError(messageFrom(err, 'could not start registration'));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!accountRequestId) {
        setError('start registration again');
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const token = await serverpodAuth.verifyRegistrationCode(accountRequestId, code);
        setRegistrationToken(token);
        setStatus('awaitingPassword');
        return true;
      } catch (err) {
        setError(messageFrom(err, 'invalid or expired code'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accountRequestId],
  );

  const finishRegister = useCallback(
    async (password: string) => {
      if (!registrationToken) {
        setError('verify your email code again');
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const auth = await serverpodAuth.finishRegistration(registrationToken, password);
        await serverpodAuth.persistAuth(auth);
        setEmail(pendingEmail);
        setStatus('signedIn');
        return true;
      } catch (err) {
        setError(messageFrom(err, 'registration failed'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [registrationToken, pendingEmail],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await serverpodAuth.signOutDevice().catch(() => clearAuthTokens());
    } finally {
      setEmail(null);
      setAccountRequestId(null);
      setRegistrationToken(null);
      setPendingEmail(null);
      setStatus('signedOut');
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const resetToLogin = useCallback(() => {
    setAccountRequestId(null);
    setRegistrationToken(null);
    setPendingEmail(null);
    setError(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({ status, email, error, busy, login, startRegister, verifyCode, finishRegister, logout, clearError, resetToLogin }),
    [status, email, error, busy, login, startRegister, verifyCode, finishRegister, logout, clearError, resetToLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
