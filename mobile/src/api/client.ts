import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AlertNote,
  AuthResult,
  ChatResult,
  ConceptsGraph,
  ConversationTurn,
  CopLogEntry,
  CountryDetail,
  CountryListItem,
  DiaryEntry,
  DreamEntry,
  FeedItem,
  GrowthSnapshot,
  LexiconStats,
  LexiconWord,
  Mind,
  NextTick,
  Profile,
  ReasoningNote,
  SelfConfig,
} from './types';

// The backend (FTMbyTEN/WYRD server.js) listens on a hardcoded port with no env override.
// Android emulators reach the host machine at 10.0.2.2, not localhost; iOS simulator and web
// both resolve localhost directly. A physical device needs the dev machine's LAN IP — override
// via EXPO_PUBLIC_WYRD_API_URL at build/start time (e.g. EXPO_PUBLIC_WYRD_API_URL=http://192.168.1.20:4477).
const DEFAULT_PORT = 4477;
function defaultBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_WYRD_API_URL) return process.env.EXPO_PUBLIC_WYRD_API_URL;
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:${DEFAULT_PORT}`;
}
export const BASE_URL = defaultBaseUrl();

const SID_KEY = 'wyrd_sid';

// The backend's session cookie is HttpOnly + SameSite=Lax with no Secure flag (plain HTTP on a
// LAN/dev box). React Native's fetch is backed by native networking (NSURLSession / OkHttp),
// which *does* manage a cookie jar automatically per-process — but persistence of an HttpOnly
// cookie across cold app restarts is not guaranteed on every platform/RN version. As a belt-and-
// braces measure we also read any `set-cookie` response header we can see and mirror the raw
// `sid=...` value into AsyncStorage, replaying it as a `Cookie` header on every request. If the
// native layer already attached the cookie, sending it again is a harmless no-op.
let cachedSid: string | null | undefined;

async function getSid(): Promise<string | null> {
  if (cachedSid !== undefined) return cachedSid;
  cachedSid = await AsyncStorage.getItem(SID_KEY);
  return cachedSid;
}

async function setSid(sid: string | null) {
  cachedSid = sid;
  if (sid) await AsyncStorage.setItem(SID_KEY, sid);
  else await AsyncStorage.removeItem(SID_KEY);
}

function extractSid(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const m = /(?:^|,\s*)sid=([^;]*)/.exec(setCookieHeader);
  if (!m) return null;
  return m[1] || null; // logout sends `sid=; Max-Age=0` — empty value means "clear"
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sid = await getSid();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (sid) headers.set('Cookie', `sid=${sid}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' });

  const setCookie = res.headers.get('set-cookie');
  const parsedSid = extractSid(setCookie);
  if (parsedSid !== null) await setSid(parsedSid || null);

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (data && (data.error as string)) || `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });

export const api = {
  baseUrl: BASE_URL,

  // ---- auth ----
  register: (username: string, password: string) => post<AuthResult>('/api/auth/register', { username, password }),
  login: (username: string, password: string) => post<AuthResult>('/api/auth/login', { username, password }),
  logout: () => post<{ ok: boolean }>('/api/auth/logout'),
  me: () => get<AuthResult>('/api/auth/me'),
  clearLocalSession: () => setSid(null),

  // ---- mind / vitals ----
  mind: () => get<Mind>('/api/mind'),

  // ---- chat / dialogue link ----
  chat: (text: string, nonce?: string) => post<ChatResult>('/api/chat', { text, nonce }),
  conversations: (limit = 50) => get<{ total: number; turns: ConversationTurn[] }>(`/api/conversations?limit=${limit}`),

  // ---- profile / account ----
  profile: () => get<Profile>('/api/profile'),
  exportAccount: () => get<unknown>('/api/account/export'),
  deleteAccount: () => post<{ ok: boolean }>('/api/account/delete'),

  // ---- journal: diary / dreams / reasoning ----
  diary: (limit = 20) => get<DiaryEntry[]>(`/api/diary?limit=${limit}`),
  triggerDiary: () => post<{ entry: DiaryEntry | null }>('/api/diary/trigger'),
  dreams: (limit = 20) => get<DreamEntry[]>(`/api/dreams?limit=${limit}`),
  triggerDream: () => post<{ entry: DreamEntry | null }>('/api/dreams/trigger'),
  reasoning: () => get<ReasoningNote[]>('/api/reasoning'),
  triggerReasoning: () => post<{ ran: boolean }>('/api/reasoning/trigger'),
  reasoningNext: () => get<NextTick>('/api/reasoning/next'),

  // ---- COP oversight ----
  selfConfig: () => get<SelfConfig>('/api/self-config'),
  copLog: (limit = 20) => get<CopLogEntry[]>(`/api/cop-log?limit=${limit}`),
  triggerSelfModify: () => post<{ change: unknown }>('/api/self-modify/trigger'),

  // ---- vocabulary / feed ----
  lexiconStats: () => get<LexiconStats>('/api/lexicon/stats'),
  lexiconWord: (word: string) => get<{ found: boolean } & Partial<LexiconWord>>(`/api/lexicon/word/${encodeURIComponent(word)}`),
  triggerLexicon: () => post<{ ran: boolean }>('/api/lexicon/trigger'),
  feedRecent: () => get<FeedItem[]>('/api/feed/recent'),
  feedNext: () => get<NextTick>('/api/feed/next'),
  triggerFeed: () => post<{ ran: boolean }>('/api/feed/trigger'),

  // ---- growth / concepts ----
  growth: (limit = 500) => get<GrowthSnapshot[]>(`/api/growth?limit=${limit}`),
  triggerGrowth: () => post<GrowthSnapshot>('/api/growth/trigger'),
  concepts: () => get<ConceptsGraph>('/api/concepts'),

  // ---- world map ----
  countries: () => get<CountryListItem[]>('/api/world/countries'),
  country: (cca3: string) => get<CountryDetail>(`/api/world/country/${cca3}`),

  // ---- misc ----
  llmStatus: () => get<{ active: boolean; model: string | null }>('/api/llm/status'),
  alerts: () => get<AlertNote[]>('/api/alerts'),
};
