import { callEndpoint, ServerpodClientError, SERVERPOD_BASE_URL } from './serverpodClient';
import type {
  AlertNote,
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

// Ports every read/write in this file from the old Node REST API (server.js) onto the real
// Serverpod backend, via the raw RPC client in serverpodClient.ts. Auth (register/login/logout/
// me) moved entirely to AuthContext.tsx + serverpodAuth.ts -- this file is data only now.
export const BASE_URL = SERVERPOD_BASE_URL;
export const ApiError = ServerpodClientError;

// ---- Serverpod's raw shapes, only where they differ from what the UI expects (types.ts) ----
interface SpDigestInfo {
  totalTopics: number;
  answeredTopics: number;
  backlog: number;
  percent: number;
  ratePerMin: number | null;
  etaMinutes: number | null;
  etaAt: string | null;
}
interface SpMind {
  mood: string;
  focusTopic: string | null;
  activeGoal: string | null;
  curiosity: number;
  confidence: number;
  digest: SpDigestInfo;
  lastEvent: string | null;
  explorationCount: number;
  updatedAt: string;
}
function adaptMind(m: SpMind): Mind {
  return { ...m };
}

interface SpUserFact {
  text: string;
  category: string;
  timestamp: string;
  lastMentioned: string;
}
interface SpUserProfile {
  authUserId: string;
  username: string | null;
  facts: SpUserFact[];
  visitCount: number;
  firstSeen: string;
  lastSeen: string;
}
function adaptProfile(p: SpUserProfile): Profile {
  return {
    facts: p.facts.map((f) => f.text),
    visitCount: p.visitCount,
    firstSeen: p.firstSeen,
    lastSeen: p.lastSeen,
  };
}

interface SpConversationTurn {
  authUserId: string;
  userText: string;
  botText: string;
  timestamp: string;
}
function adaptConversationTurn(t: SpConversationTurn): ConversationTurn {
  return { userText: t.userText, botText: t.botText, timestamp: t.timestamp };
}

interface SpChatAction {
  type: string;
  country: string | null;
}
interface SpChatReply {
  reply: string;
  mind: SpMind;
  action: SpChatAction | null;
}
function adaptChatResult(r: SpChatReply): ChatResult {
  return {
    reply: r.reply,
    block: { timestamp: r.mind.updatedAt },
    comparison: '',
    candidateCount: 1,
    chosenPath: 'serverpod',
    mind: adaptMind(r.mind),
    netFetched: false,
    action: r.action && (r.action.type === 'open_world_map' || r.action.type === 'preview_app')
      ? (r.action as ChatResult['action'])
      : null,
  };
}

interface SpSelfConfigChange {
  timestamp: string;
  key: string;
  oldValueJson: string;
  newValueJson: string;
  reason: string;
}
function parseJsonSafe(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}
interface SpSelfConfig {
  toneNote: string;
  replyLengthMax: number;
  curiosityLevel: 'low' | 'moderate' | 'high';
  history: SpSelfConfigChange[];
}
function adaptSelfConfig(c: SpSelfConfig): SelfConfig {
  return {
    toneNote: c.toneNote,
    replyLengthMax: c.replyLengthMax,
    curiosityLevel: c.curiosityLevel,
    history: c.history.map((h) => ({
      timestamp: h.timestamp,
      key: h.key as SelfConfig['history'][number]['key'],
      oldValue: parseJsonSafe(h.oldValueJson),
      newValue: parseJsonSafe(h.newValueJson),
      reason: h.reason,
    })),
  };
}

interface SpCopLogEntry {
  timestamp: string;
  kind: string;
  configKey: string;
  oldValueJson: string;
  newValueJson: string;
  reason: string;
  verdict: string;
}
function adaptCopLogEntry(e: SpCopLogEntry): CopLogEntry {
  return {
    timestamp: e.timestamp,
    change: {
      key: e.configKey as CopLogEntry['change']['key'],
      oldValue: parseJsonSafe(e.oldValueJson),
      newValue: parseJsonSafe(e.newValueJson),
      reason: e.reason,
    },
    verdict: e.verdict,
  };
}

interface SpLexiconWordSummary { word: string; definition: string | null; partOfSpeech: string | null }
interface SpLexiconStats { learned: number; attempted: number; recentWords: SpLexiconWordSummary[] }
function adaptLexiconStats(s: SpLexiconStats): LexiconStats {
  return {
    learned: s.learned,
    attempted: s.attempted,
    dictionarySize: null, // not tracked on this backend
    recent: s.recentWords.map((w) => ({ word: w.word, definition: w.definition || '', partOfSpeech: w.partOfSpeech || '' })),
    nextTickAt: Date.now(), // no lexicon tick ported yet -- see LexiconEndpoint on the backend
    cycleMs: 0,
  };
}

interface SpFeedIngest {
  title: string;
  feedSource: string;
  url: string | null;
  timestamp: string;
  curriculumSubject: string | null;
  curriculumLevel: string | null;
}
function adaptFeedItem(f: SpFeedIngest): FeedItem {
  return { title: f.title, feedSource: f.feedSource, url: f.url || '', timestamp: f.timestamp };
}

interface SpGrowthSnapshot {
  timestamp: string;
  vocabCount: number;
  blockCount: number;
  digestPercent: number;
  curiosity: number;
  confidence: number;
}
function adaptGrowthSnapshot(g: SpGrowthSnapshot): GrowthSnapshot {
  return { ...g };
}

interface SpDiaryEntry { date: string; timestamp: string; content: string }
interface SpDreamEntry { timestamp: string; content: string; sourceBlockIds: number[] }
function adaptDreamEntry(d: SpDreamEntry): DreamEntry {
  return { timestamp: d.timestamp, content: d.content, sourceBlockIds: d.sourceBlockIds.map(String) };
}

interface SpConceptNode { id: string; count: number }
interface SpConceptEdge { a: string; b: string; weight: number }
interface SpConceptGraph { nodes: SpConceptNode[]; edges: SpConceptEdge[] }
function adaptConceptsGraph(g: SpConceptGraph): ConceptsGraph {
  return g;
}

interface SpAccountExport {
  email: string | null;
  facts: SpUserFact[];
  visitCount: number;
  firstSeen: string;
  lastSeen: string;
  conversation: SpConversationTurn[];
}

export const api = {
  baseUrl: BASE_URL,

  // ---- mind / vitals ----
  mind: () => callEndpoint<SpMind>('mind', 'getMind', {}, { authenticated: false }).then(adaptMind),

  // ---- chat / dialogue link ----
  chat: (text: string, _nonce?: string) =>
    callEndpoint<SpChatReply>('chat', 'sendMessage', { text }).then(adaptChatResult),
  conversations: async (limit = 50) => {
    const turns = await callEndpoint<SpConversationTurn[]>('chat', 'getHistory', { limit });
    return { total: turns.length, turns: turns.map(adaptConversationTurn) };
  },

  // ---- profile / account ----
  profile: () => callEndpoint<SpUserProfile>('profile', 'getProfile', {}).then(adaptProfile),
  exportAccount: () => callEndpoint<SpAccountExport>('account', 'exportData', {}),
  deleteAccount: () => callEndpoint<void>('account', 'deleteMyData', {}).then(() => ({ ok: true })),

  // ---- journal: diary / dreams / reasoning ----
  diary: (limit = 20) =>
    callEndpoint<SpDiaryEntry[]>('diary', 'getEntries', { limit }, { authenticated: false }).then((es) => [...es].reverse()),
  triggerDiary: () =>
    callEndpoint<SpDiaryEntry>('diary', 'trigger', {}, { authenticated: false }).then((entry) => ({ entry })),
  dreams: (limit = 20) =>
    callEndpoint<SpDreamEntry[]>('dream', 'getEntries', { limit }, { authenticated: false }).then((es) =>
      [...es].reverse().map(adaptDreamEntry),
    ),
  triggerDream: () =>
    callEndpoint<SpDreamEntry | null>('dream', 'trigger', {}, { authenticated: false }).then((entry) => ({
      entry: entry ? adaptDreamEntry(entry) : null,
    })),
  // No reasoning-log read endpoint on this backend (server.js's human-readable .md trace files
  // were intentionally not ported) -- the reasoning tick itself is real, just not browsable here.
  reasoning: (): Promise<ReasoningNote[]> => Promise.resolve([]),
  triggerReasoning: () =>
    callEndpoint<boolean>('reasoning', 'trigger', {}, { authenticated: false }).then((ran) => ({ ran })),
  reasoningNext: (): Promise<NextTick> => Promise.resolve({ nextTickAt: Date.now() + 30000, cycleMs: 30000 }),

  // ---- COP oversight ----
  selfConfig: () => callEndpoint<SpSelfConfig>('selfConfig', 'getConfig', {}, { authenticated: false }).then(adaptSelfConfig),
  copLog: (limit = 20) =>
    callEndpoint<SpCopLogEntry[]>('selfConfig', 'getCopLog', { limit }, { authenticated: false }).then((es) =>
      es.map(adaptCopLogEntry),
    ),
  triggerSelfModify: () =>
    callEndpoint<SpSelfConfigChange | null>('selfConfig', 'trigger', {}, { authenticated: false }).then((change) => ({
      change: change
        ? { key: change.key, oldValue: parseJsonSafe(change.oldValueJson), newValue: parseJsonSafe(change.newValueJson), reason: change.reason }
        : null,
    })),

  // ---- vocabulary / feed ----
  lexiconStats: () => callEndpoint<SpLexiconStats>('lexicon', 'getStats', {}, { authenticated: false }).then(adaptLexiconStats),
  lexiconWord: (word: string) =>
    callEndpoint<{ word: string; understood: boolean; definition: string | null; partOfSpeech: string | null } | null>(
      'lexicon',
      'getWord',
      { word },
      { authenticated: false },
    ).then((w): { found: boolean } & Partial<LexiconWord> =>
      w && w.understood ? { found: true, word: w.word, definition: w.definition || '', partOfSpeech: w.partOfSpeech || '' } : { found: false },
    ),
  feedRecent: () => callEndpoint<SpFeedIngest[]>('feed', 'getRecent', {}, { authenticated: false }).then((es) => es.map(adaptFeedItem)),
  feedNext: (): Promise<NextTick> => Promise.resolve({ nextTickAt: Date.now() + 60000, cycleMs: 60000 }),
  triggerFeed: () => callEndpoint<boolean>('feed', 'trigger', {}, { authenticated: false }).then((ran) => ({ ran })),

  // ---- growth / concepts ----
  growth: (limit = 500) =>
    callEndpoint<SpGrowthSnapshot[]>('growth', 'getSnapshots', { limit }, { authenticated: false }).then((es) =>
      es.map(adaptGrowthSnapshot),
    ),
  // No manual growth trigger on this backend (snapshots are purely wall-clock, every 30 real
  // minutes) -- return the most recent real snapshot rather than fabricate one.
  triggerGrowth: async (): Promise<GrowthSnapshot> => {
    const snaps = await callEndpoint<SpGrowthSnapshot[]>('growth', 'getSnapshots', { limit: 1 }, { authenticated: false });
    if (!snaps.length) throw new ServerpodClientError(404, 'no growth snapshot exists yet');
    return adaptGrowthSnapshot(snaps[0]);
  },
  concepts: () => callEndpoint<SpConceptGraph>('memory', 'getConcepts', {}, { authenticated: false }).then(adaptConceptsGraph),

  // ---- world map ---- (not ported on this backend yet -- see AGENTS notes on world/countries)
  countries: (): Promise<CountryListItem[]> => Promise.resolve([]),
  country: (_cca3: string): Promise<CountryDetail> =>
    Promise.reject(new ServerpodClientError(404, 'world map data is not available on this backend yet')),

  // ---- misc ----
  alerts: (): Promise<AlertNote[]> => Promise.resolve([]),
};
