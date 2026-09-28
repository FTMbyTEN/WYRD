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
  id?: number;
  timestamp: string;
  content: string;
  sourceBlockIds: string[];
}

/** One neural firing (see the server's ReasoningService): the idea that fired, the path the
 *  signal took, the synapses it crossed (strength before/after) and a plain-English summary. */
export interface Firing {
  seed: string;
  path: string[];
  activated: { id: string; a: number }[];
  synapses: { a: string; b: string; before: number; after: number }[];
  degree: number;
  meaning?: string;
  summary: string;
}

export interface ReasoningNote {
  file: string;
  content: string; // raw markdown, or JSON for kind 'firing'
  kind?: 'reasoning' | 'self' | 'firing' | 'sleep';
  timestamp?: string;
  firing?: Firing;
}

export interface Synapse { a: string; b: string; weight: number; fires: number; lastFired: string }
export interface NeuralNetwork { neurons: ConceptNode[]; synapses: Synapse[]; totalSynapses: number }

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

export interface Sighting {
  timestamp: string;
  description: string;
  question: string | null;
}

export interface LearningStats { answers: number; shared: number; reuses: number; improved: number }

export interface QuarantinedItem {
  id?: number;
  timestamp: string;
  source: string;
  title: string;
  url: string | null;
  extract: string | null;
  score: number;
  reasons: string[];
}
export interface FilterReport {
  day: string;
  kept: number;
  duplicates: number;
  quarantined: number;
  reasons: Record<string, number>;
  categories: Record<string, number>;
  recent: QuarantinedItem[];
}

export type GrowthRange = 'day' | 'week' | 'month' | 'all';

export interface ConceptExample {
  source: string;
  title: string;
  snippet: string | null;
  url: string | null;
  timestamp: string;
}
export interface ConceptDetail {
  topic: string;
  mentions: number;
  definition: string | null;
  partOfSpeech: string | null;
  related: ConceptNode[];
  examples: ConceptExample[];
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
  | { type: 'open_drone' }
  | null;

export interface ChatResult {
  reply: string;
  /** answered from a learned answer, without calling the AI */
  fromMemory?: boolean;
  /** the conversation turn, so this reply can be rated */
  turnId?: number;
  block: { timestamp: string; [k: string]: unknown };
  comparison: string;
  candidateCount: number;
  chosenPath: string;
  mind: Mind;
  netFetched: boolean;
  action: ChatAction;
}

export interface ConversationTurn {
  id?: number;
  rating?: number | null;
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

// Server-synthesized from diary/dreams/cop_log/digest — nothing new stored (see GET /api/alerts).
export interface AlertNote {
  tag: 'DIARY' | 'DREAM' | 'COP' | 'DIGEST';
  ago: string;
  body: string;
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

// ---- drone (Serverpod drone / droneBridge endpoints) ----
export interface DroneState {
  droneId: string;
  connected: boolean;
  armed: boolean;
  mode: string | null;
  lat: number | null;
  lon: number | null;
  relativeAltM: number | null;
  headingDeg: number | null;
  groundSpeedMs: number | null;
  batteryPct: number | null;
  gpsFix: number | null;
  satellites: number | null;
  homeLat: number | null;
  homeLon: number | null;
  missionStatus: string | null;
  missionStep: number | null;
  missionError: string | null;
  updatedAt: string;
}
export interface DroneMission {
  id: number;
  droneId: string;
  kind: 'mission' | 'abort';
  instruction: string;
  summary: string;
  stepsJson: string;
  status: 'pending' | 'sent' | 'running' | 'done' | 'aborted' | 'rejected';
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface DronePlanResult {
  accepted: boolean;
  reason: string | null;
  mission: DroneMission | null;
}
