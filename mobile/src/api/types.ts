// Types mirror the real consciousness-bot Express API (FTMbyTEN/WYRD `server.js`), not the
// mocked-up shape used by the design prototype — field names/types were confirmed by reading
// the handlers directly (see publicMind, computeDigest, loadSelfConfig, etc).

export interface DigestInfo {
  totalTopics: number;
  answeredTopics: number;
  backlog: number;
  percent: number;
  ratePerMin: number | null;
  etaMinutes: number | null;
  etaAt: string | null;
}

export interface Mind {
  mood: string;
  focusTopic: string | null;
  activeGoal: string | null;
  curiosity: number; // 0-1
  confidence: number; // 0-1
  digest: DigestInfo;
  lastEvent: string | null;
  explorationCount?: number;
  updatedAt: string;
}

export interface DiaryEntry {
  date: string; // YYYY-MM-DD
  timestamp: string;
  content: string;
}

export interface DreamEntry {
  timestamp: string;
  content: string;
  sourceBlockIds: string[];
}

export interface ReasoningNote {
  file: string;
  content: string; // raw markdown
}

export interface SelfConfigChange {
  key: 'toneNote' | 'replyLengthMax' | 'curiosityLevel';
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

export interface SelfConfigHistoryEntry extends SelfConfigChange {
  timestamp: string;
}

export interface SelfConfig {
  toneNote: string;
  replyLengthMax: number;
  curiosityLevel: 'low' | 'moderate' | 'high';
  history: SelfConfigHistoryEntry[];
}

export interface CopLogEntry {
  timestamp: string;
  change: SelfConfigChange;
  verdict: string; // free text — backend has no REASONABLE/FLAGGED enum
}

export interface ConceptNode {
  id: string;
  count: number;
}
export interface ConceptEdge {
  a: string;
  b: string;
  weight: number;
}
export interface ConceptsGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

export interface GrowthSnapshot {
  timestamp: string;
  vocabCount: number;
  blockCount: number;
  digestPercent: number;
  curiosity: number;
  confidence: number;
}

export interface LexiconWord {
  word: string;
  definition: string;
  partOfSpeech: string;
}
export interface LexiconStats {
  learned: number;
  attempted: number;
  dictionarySize: number | null;
  recent: LexiconWord[];
  nextTickAt: number;
  cycleMs: number;
}

export interface FeedItem {
  title: string;
  feedSource: string;
  url: string;
  timestamp: string;
}

export interface CountryListItem {
  name: string;
  cca2: string;
  cca3: string;
  region: string;
  lat: number;
  lng: number;
}

export interface CountryDetail {
  name: string;
  capital: string | null;
  region: string;
  subregion: string;
  languages: string[];
  currencies: string[];
  flag: string | null;
  weather: { tempC: number; code: number } | null;
}

export type ChatAction =
  | { type: 'open_world_map'; country: string | null }
  | { type: 'preview_app'; html: string }
  | null;

export interface ChatResult {
  reply: string;
  block: { timestamp: string; [k: string]: unknown };
  comparison: string;
  candidateCount: number;
  chosenPath: string;
  mind: Mind;
  netFetched: boolean;
  action: ChatAction;
}

export interface ConversationTurn {
  userText?: string;
  botText?: string;
  timestamp: string;
  [k: string]: unknown;
}

export interface AuthResult {
  ok: boolean;
  username?: string;
  error?: string;
}

export interface Profile {
  facts: string[];
  visitCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface NextTick {
  nextTickAt: number;
  cycleMs: number;
}

// ---- SSE event payloads (GET /api/stream) ----
export type StreamEvent =
  | { event: 'mind'; data: Mind }
  | { event: 'thinking'; data: unknown }
  | { event: 'idle'; data: unknown }
  | { event: 'thought'; data: unknown }
  | { event: 'self_modify'; data: SelfConfigChange }
  | { event: 'cop_report'; data: CopLogEntry }
  | { event: 'diary'; data: DiaryEntry }
  | { event: 'dream'; data: DreamEntry }
  | { event: 'ingesting'; data: unknown }
  | { event: 'ingested'; data: FeedItem }
  | { event: 'ingest_error'; data: unknown }
  | { event: 'profile'; data: Profile }
  | { event: 'chat'; data: { userText: string; botText: string; timestamp: string; nonce: string | null } };
