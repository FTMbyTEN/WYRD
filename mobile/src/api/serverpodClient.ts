import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Reverse-engineered from the generated Dart client (wyrd_client) and serverpod_client's own
// source (serverpod_client_shared.dart / serverpod_client_io.dart) -- there is no JS/TS
// Serverpod client, so this is a from-scratch implementation of its wire protocol:
//   POST {host}/{endpointName}/{methodName}
//   body: JSON.stringify(argsMap)            (plain JSON, no wrapper)
//   headers: Content-Type: application/json, Authorization: Bearer <accessToken> (if authenticated)
//   response: 200 -> raw JSON of the return value; non-200 -> JSON or plain-text error body
const DEFAULT_PORT = 8080;
function defaultBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_WYRD_SERVERPOD_URL) return process.env.EXPO_PUBLIC_WYRD_SERVERPOD_URL;
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:${DEFAULT_PORT}`;
}
export const SERVERPOD_BASE_URL = defaultBaseUrl().replace(/\/$/, '');

const ACCESS_TOKEN_KEY = 'wyrd_sp_access_token';
const REFRESH_TOKEN_KEY = 'wyrd_sp_refresh_token';

let cachedAccessToken: string | null | undefined;
let cachedRefreshToken: string | null | undefined;

async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken !== undefined) return cachedAccessToken;
  cachedAccessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  return cachedAccessToken;
}

async function getRefreshToken(): Promise<string | null> {
  if (cachedRefreshToken !== undefined) return cachedRefreshToken;
  cachedRefreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  return cachedRefreshToken;
}

export interface AuthSuccess {
  authStrategy: string;
  token: string;
  refreshToken: string | null;
}

export async function storeAuthSuccess(auth: AuthSuccess): Promise<void> {
  cachedAccessToken = auth.token;
  cachedRefreshToken = auth.refreshToken ?? null;
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, auth.token);
  if (auth.refreshToken) await AsyncStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
  else await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function clearAuthTokens(): Promise<void> {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function hasStoredSession(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}

export class ServerpodClientError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/// Refreshes the access token using the stored refresh token. Serverpod's JWT refresh endpoint
/// is itself unauthenticated (it takes the refresh token as an argument, not a bearer header).
async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;
    try {
      const auth = await callEndpoint<AuthSuccess>('jwtRefresh', 'refreshAccessToken', { refreshToken }, { authenticated: false });
      await storeAuthSuccess(auth);
      return true;
    } catch {
      await clearAuthTokens();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function callEndpoint<T>(
  endpoint: string,
  method: string,
  args: Record<string, unknown>,
  opts: { authenticated?: boolean } = {},
): Promise<T> {
  const authenticated = opts.authenticated ?? true;

  const doCall = async (): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authenticated) {
      const token = await getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${SERVERPOD_BASE_URL}/${endpoint}/${method}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    });
  };

  let res = await doCall();

  // A 401 on an authenticated call may mean the access token expired -- retry once after a
  // refresh, same policy as serverpod_client's own JwtAuthKeyProvider.
  if (res.status === 401 && authenticated) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doCall();
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'message' in data && String((data as { message: unknown }).message)) || `${res.status} ${res.statusText}`;
    throw new ServerpodClientError(res.status, message, data);
  }
  return data as T;
}
