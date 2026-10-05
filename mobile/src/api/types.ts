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
  content: string; // raw markdown, or JSON for kinds 'firing' and 'thought'
  kind?: 'reasoning' | 'self' | 'firing' | 'sleep' | 'thought';
  timestamp?: string;
  firing?: Firing;
  thought?: Thought;
}

/** One act of WYRD's own thinking: forming a belief from evidence, re-testing one, or asking. */
export interface Thought {
  op: 'connect' | 'test' | 'question';
  a: string;
  b: string;
  claim: string | null;
  before: number | null;
  after: number | null;
  status: 'hypothesis' | 'held' | 'doubted' | 'dream' | 'dropped' | 'open';
  sources: number;
  against: number;
  evidence: { text: string; source: string; trust: number; against: boolean }[];
  summary: string;
}

/** The one line to show for a note, whatever its kind. */
export function noteLine(n: ReasoningNote): string {
  if (n.thought) return n.thought.summary;
  if (n.firing) return n.firing.summary;
  const q = n.content.match(/^Q:\s*(.+)$/m)?.[1];
  return q ?? n.content.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '';
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

export interface TrustScore { id?: number; kind: string; key: string; good: number; bad: number; score: number; updatedAt: string }
export interface TrustReport {
  trustedSources: TrustScore[];
  doubtedSources: TrustScore[];
  trustedTopics: TrustScore[];
  doubtedTopics: TrustScore[];
  tracked: number;
  evidence: number;
}

export interface JudgementReport { checked: number; passed: number; softened: number; corrected: number; blocked: number; reasons: Record<string, number> }

export type WorkSource = 'gutenberg' | 'openstax' | 'wikisource' | 'page';
export interface ReadingItem {
  id: number; url: string; title: string; kind: 'book' | 'page' | 'textbook'; nextOffset: number | null; total: number;
  source?: WorkSource | null; author?: string | null; partIndex?: number | null; partCount?: number | null;
  partTitle?: string | null; partUrl?: string | null; startedAt: string; updatedAt: string;
}
export interface WorkHit { source: WorkSource; id: string; title: string; author?: string | null; subjects: string[]; coverUrl?: string | null; language?: string | null; blurb?: string | null }
export interface QuizQuestion { kind: 'cloze' | 'truefalse'; prompt: string; options: string[]; answer: number; explanation: string; keyword: string }
export interface QuizStats { rounds: number; correct: number; total: number }
export interface WorkPartInfo { index: number; title: string; url: string }
export interface ReadingSlice { item: ReadingItem; text: string; offset: number; finished: boolean }

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
  | { type: 'open_book'; readingItemId: number }
  | { type: 'open_tasks' }
  | null;

export interface ChatResult {
  reply: string;
  /** answered from a learned answer, without calling the AI */
  fromMemory?: boolean;
  /** the conversation turn, so this reply can be rated */
  turnId?: number;
  /** set when the reply gate changed the reply: softened, corrected or blocked */
  judgement?: string;
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

// ---- games ----
export interface PlayerRating {
  id: number;
  game: string;
  name: string;
  rating: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
}
export interface GameMatch {
  id: number;
  game: string;
  state: string; // chess: FEN
  moves: string[];
  playerSide: 'w' | 'b';
  status: 'active' | 'won' | 'lost' | 'draw' | 'resigned' | 'waiting' | 'over';
  wyrdLevel: number;
  ratingBefore: number;
  ratingAfter: number | null;
  remark: string | null;
  mode: 'wyrd' | 'pvp';
  opponentId: string | null;
  playerName: string | null;
  opponentName: string | null;
  result: string | null; // pvp, once over: 'starter:how', 'opponent:how' or 'draw:how'
  version: number;
  viewerSide: 'w' | 'b' | null; // the side of whoever asked
}

// ---- agent tasks ----
export interface AgentTask {
  id: number;
  goal: string;
  everyHours: number | null;
  status: 'queued' | 'running' | 'waiting_approval' | 'scheduled' | 'done' | 'failed' | 'cancelled';
  result: string | null;
  previousResult: string | null;
  notes: string | null;
  pendingAction: string | null; // JSON: { kind, summary, url?, ... }
  stepsUsed: number;
  maxSteps: number;
  runs: number;
  unread: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AgentStep {
  id: number;
  taskId: number;
  run: number;
  at: string;
  kind: 'tool' | 'note' | 'ask' | 'approved' | 'declined' | 'result' | 'error';
  tool: string | null;
  detail: string;
  output: string | null;
}

/** A mission from WYRD, the open world's Authority: on a real street (or at x/z, metres from Ojuelegba). */
export interface CityMission { id?: string; kind: 'reach' | 'deliver' | 'find' | 'greet'; title: string; brief: string; street: string | null; x?: number | null; z?: number | null; reward: number; minStanding?: number }
export type CityAction =
  | ({ type: 'mission' } & CityMission)
  | { type: 'mission_done' }
  | { type: 'standing'; delta: number; reason: string }
  | { type: 'weather'; weather: 'clear' | 'rain' | 'harmattan' | 'storm' }
  | { type: 'traffic'; mode: 'normal' | 'stop' | 'rush' }
  | { type: 'drone'; toPlayer: boolean; x: number | null; z: number | null; purpose: string }
  | { type: 'broadcast'; text: string }
  | { type: 'danfo'; destination: string | null };
/** What the Authority said and did, and where you stand with it. */
export interface CityDecree { say: string; actions: CityAction[]; standing: number; rank: string; missionsDone: number; mission: CityMission | null; trainingOptIn?: boolean; trainingAsked?: boolean }
/** WYRD's charter for the city, in its words, and its mission board (those open to you). */
export interface CityCharter { charter: string; author: 'wyrd' | 'seed'; writtenAt: string; missions: CityMission[] }

/** A design proposal for the open world, from WYRD (or the owner) in the design studio. */
export interface CityDesignNote { id: number; author: 'wyrd' | 'owner'; kind: 'idea' | 'rule' | 'mission' | 'npc_lines' | 'tuning' | 'event'; title: string; body: string; payload: Record<string, unknown> | null; status: 'proposed' | 'approved' | 'rejected'; createdAt: string }
/** The approved, live part of the design the game applies. */
export interface CityLiveDesign { traffic: number; crowd: number; npcLines: string[]; events: { title: string; startHour: number; endHour: number; weather?: 'clear' | 'rain' | 'harmattan' | 'storm'; traffic?: 'normal' | 'stop' | 'rush'; broadcast?: string }[]; missions: CityMission[] }

/** A player's character in NAIJA 2099, from the character creator. Proportions and skin are -1..1. */
export interface CharacterLook { base: 'ten' | 'ama'; outfit?: number; name: string; height: number; build: number; shoulders: number; hips: number; skin: number; outfitHue: number; neon: number }

/** Who is in NAIJA 2099 right now and overall. */
export interface CityStats { online: number; joined: number; joinedToday: number; citizens: number; missionsDone: number; talksToday: number; bodies: { ten: number; ama: number }; leaders: { name: string; standing: number; missions: number }[]; at: string }

/** A home in NAIJA 2099 (rent per week, price to buy). */
export interface CityHome { slug: string; name: string; district: string; kind: string; x: number; z: number; rent: number; price: number; taken?: boolean; mine?: boolean; mode?: 'rent' | 'own'; paidUntil?: string | null }
/** Something to do at a place: cost (negative naira) or pay, health given back, standing, cooldown. */
export interface CityActivity { id: string; label: string; naira: number; heal: number; standing: number; againS: number }
/** Your naira and your home. */
export interface CityWallet { naira: number; home: CityHome | null; paid?: number }
