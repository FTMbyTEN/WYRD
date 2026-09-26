import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as serverpodAuth from './serverpodAuth';
import { ServerpodClientError } from './serverpodClient';
import { hasStoredSession, clearAuthTokens } from './serverpodClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './client';

// The signed-in email isn't part of the stored tokens, so it's kept alongside them; otherwise a
// reload keeps you signed in but forgets who you are (the YOU tab showed "—").
const EMAIL_KEY = 'wyrd_email';
const rememberEmail = (e: string | null) =>
  (e ? AsyncStorage.setItem(EMAIL_KEY, e) : AsyncStorage.removeItem(EMAIL_KEY)).catch(() => {});

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
  /** Password reset: 'none' until started, then 'code' (enter the emailed code), then
   *  'password' (choose a new one). Finishing signs the person in with the new password. */
  resetStage: 'none' | 'code' | 'password';
  startReset: (email: string) => Promise<boolean>;
  verifyResetCode: (code: string) => Promise<boolean>;
  finishReset: (password: string) => Promise<boolean>;
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
  const [resetStage, setResetStage] = useState<'none' | 'code' | 'password'>('none');
  const [resetRequestId, setResetRequestId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState<string | null>(null);

  // Every sign-in (and session restore) records a visit, which is also what creates the person's
  // WYRD profile and stores their email on it. Best-effort: never blocks signing in.
  const recordVisit = () => { api.touchVisit().catch(() => {}); };

  React.useEffect(() => {
    (async () => {
      // Phase 1: trust a stored token pair without a live round-trip. A proper "is this token
      // still actually valid" check happens once profile.getProfile() (or similar) is wired up
      // in the next batch -- for now a stale/expired token just surfaces as an error on the
      // first real API call, same as any session-expiry case.
      const has = await hasStoredSession();
      if (has) {
        const stored = await AsyncStorage.getItem(EMAIL_KEY).catch(() => null);
        if (stored) {
          setEmail(stored);
        } else {
          // a session from before the email was remembered: look it up once
          api.exportAccount()
            .then((a) => { if (a?.email) { setEmail(a.email); rememberEmail(a.email); } })
            .catch(() => {});
        }
      }
      if (has) recordVisit();
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
      rememberEmail(e);
      recordVisit();
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
        rememberEmail(pendingEmail);
        recordVisit();
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

  const startReset = useCallback(async (e: string) => {
    setBusy(true);
    setError(null);
    try {
      setResetRequestId(await serverpodAuth.startPasswordReset(e));
      setResetEmail(e);
      setResetStage('code');
      return true;
    } catch (err) {
      setError(messageFrom(err, 'could not start the reset'));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyResetCode = useCallback(
    async (code: string) => {
      if (!resetRequestId) {
        setError('start the reset again');
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        setResetToken(await serverpodAuth.verifyPasswordResetCode(resetRequestId, code));
        setResetStage('password');
        return true;
      } catch (err) {
        setError(messageFrom(err, 'invalid or expired code'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [resetRequestId],
  );

  const finishReset = useCallback(
    async (password: string) => {
      if (!resetToken || !resetEmail) {
        setError('verify your reset code again');
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        await serverpodAuth.finishPasswordReset(resetToken, password);
      } catch (err) {
        setError(messageFrom(err, 'could not set the new password'));
        setBusy(false);
        return false;
      }
      setBusy(false);
      setResetStage('none');
      setResetRequestId(null);
      setResetToken(null);
      return login(resetEmail, password); // straight in with the new password
    },
    [resetToken, resetEmail, login],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await serverpodAuth.signOutDevice().catch(() => clearAuthTokens());
    } finally {
      setEmail(null);
      rememberEmail(null);
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
    setResetStage('none');
    setResetRequestId(null);
    setResetToken(null);
    setError(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({
      status, email, error, busy, login, startRegister, verifyCode, finishRegister, logout, clearError, resetToLogin,
      resetStage, startReset, verifyResetCode, finishReset,
    }),
    [status, email, error, busy, login, startRegister, verifyCode, finishRegister, logout, clearError, resetToLogin,
      resetStage, startReset, verifyResetCode, finishReset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
