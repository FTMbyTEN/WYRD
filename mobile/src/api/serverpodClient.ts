import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Reverse-engineered from the generated Dart client (wyrd_client) and serverpod_client's own
// source (serverpod_client_shared.dart / serverpod_client_io.dart) -- there is no JS/TS
// Serverpod client, so this is a from-scratch implementation of its wire protocol:
//   POST {host}/{endpointName}/{methodName}
//   body: JSON.stringify(argsMap)            (plain JSON, no wrapper)
//   headers: Content-Type: application/json, Authorization: Bearer <accessToken> (if authenticated)
//   response: 200 -> raw JSON of the return value; non-200 -> JSON or plain-text error body
// Local dev default: `dart bin/main.dart` in wyrd_server listens on 8080. For a Serverpod Cloud
// deployment, EXPO_PUBLIC_WYRD_SERVERPOD_URL must point at the API subdomain
// (https://<project>.api.serverpod.space), NOT the web/static-hosting domain
// (https://<project>.serverpod.space) -- the latter only serves the built Flutter web app and
// returns a bare 405 on any POST, which looks identical to a CORS failure in a browser's
// console. Confirmed live: GET https://<project>.serverpod.space/assets/assets/config.json
// returns the real {"apiUrl": "..."} the Flutter web app itself uses to find the API.
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
    throw new ServerpodClientError(res.status, messageFromErrorBody(data, res), data);
  }
  return data as T;
}

// Serverpod exceptions serialize as {className, data: {__className__, ...fields}} rather than
// a plain {message}. `reason` is the field every exception in serverpod_auth_idp_server actually
// uses (e.g. EmailAccountLoginException, EmailAccountRequestException) -- fall back to the raw
// HTTP status when the body doesn't match that shape (a plain 500, a proxy error page, etc.).
function messageFromErrorBody(data: unknown, res: Response): string {
  if (data && typeof data === 'object') {
    const reason = (data as { data?: { reason?: unknown } }).data?.reason;
    if (typeof reason === 'string') return humanizeReason(reason);
  }
  return `${res.status} ${res.statusText}`;
}

function humanizeReason(reason: string): string {
  // camelCase enum values (invalidCredentials, tooManyAttempts, expired, policyViolation,
  // invalid, ...) -> "invalid credentials", etc.
  return reason.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
