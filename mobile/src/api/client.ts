import { callEndpoint, ServerpodClientError, SERVERPOD_BASE_URL } from './serverpodClient';
import type { BrainMapData } from '../components/BrainCanvas';
import type { QuizQuestion, QuizStats, ReadingItem, ReadingSlice, WorkHit, WorkPartInfo,
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
  GrowthRange,
  JudgementReport,
  TrustReport,
  FilterReport,
  LearningStats,
  Firing,
  Thought,
  NeuralNetwork,
  ConceptExample,
  Sighting,
  ConceptDetail,
  LexiconStats,
  LexiconWord,
  Mind,
  NextTick,
  Profile,
  ReasoningNote,
  SelfConfig,
  DroneMission,
  GameMatch,
  PlayerRating,
  DronePlanResult,
  DroneState,
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
  id?: number;
  rating?: number | null;
  authUserId: string;
  userText: string;
  botText: string;
  timestamp: string;
}
function adaptConversationTurn(t: SpConversationTurn): ConversationTurn {
  return { id: t.id, rating: t.rating ?? null, userText: t.userText, botText: t.botText, timestamp: t.timestamp };
}

interface SpChatAction {
  type: string;
  country: string | null;
  html: string | null; // preview_app only
}
interface SpChatReply {
  reply: string;
  fromMemory?: boolean | null;
  turnId?: number | null;
  judgement?: string | null;
  mind: SpMind;
  action: SpChatAction | null;
}
function adaptChatResult(r: SpChatReply): ChatResult {
  return {
    reply: r.reply,
    fromMemory: r.fromMemory ?? false,
    turnId: r.turnId ?? undefined,
    judgement: r.judgement ?? undefined,
    block: { timestamp: r.mind.updatedAt },
    comparison: '',
    candidateCount: 1,
    chosenPath: 'serverpod',
    mind: adaptMind(r.mind),
    netFetched: false,
    action: r.action && (r.action.type === 'open_world_map' || r.action.type === 'preview_app' || r.action.type === 'open_drone' || r.action.type === 'open_book')
      ? (r.action as ChatResult['action'])
      : null,
  };
}

interface SpReasoningNote {
  timestamp: string;
  kind: 'reasoning' | 'self' | 'firing' | 'sleep' | 'thought';
  content: string;
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
interface SpDreamEntry { id?: number; timestamp: string; content: string; sourceBlockIds: number[] }
function adaptDreamEntry(d: SpDreamEntry): DreamEntry {
  return { id: d.id, timestamp: d.timestamp, content: d.content, sourceBlockIds: d.sourceBlockIds.map(String) };
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
  /** [passages]: the parts of a file open in this browser relevant to the message. */
  chat: (text: string, passages?: string[]) =>
    callEndpoint<SpChatReply>('chat', 'sendMessage', passages?.length ? { text, passages } : { text }).then(adaptChatResult),
  /** One camera frame (base64 JPEG), described by WYRD's vision model. */
  /** What WYRD remembers seeing of the signed-in person (descriptions only), newest first. */
  sightings: (limit = 3) => callEndpoint<Sighting[]>('photo', 'getSightings', { limit }),
  photo: (imageBase64Jpeg: string, caption?: string, trackingNote?: string) =>
    callEndpoint<SpChatReply>('photo', 'describe', { imageBase64Jpeg, caption: caption || null, trackingNote: trackingNote || null }).then(adaptChatResult),
  /** 👍 1, 👎 -1, or 0 to clear, on one of WYRD's replies to you. */
  rateReply: (turnId: number, rating: 1 | -1 | 0) => callEndpoint<void>('chat', 'rate', { turnId, rating }),
  conversations: async (limit = 50) => {
    const turns = await callEndpoint<SpConversationTurn[]>('chat', 'getHistory', { limit });
    return { total: turns.length, turns: turns.map(adaptConversationTurn) };
  },

  // ---- profile / account ----
  profile: () => callEndpoint<SpUserProfile>('profile', 'getProfile', {}).then(adaptProfile),
  // records a visit; also creates the WYRD profile row and stores the sign-in email on it
  touchVisit: () => callEndpoint<SpUserProfile>('profile', 'touchVisit', {}).then(adaptProfile),
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
  // Rows replacing server.js's reasoning/*.md trace files; `file` is rebuilt in the same
  // timestamp-plus-kind shape the old filenames had, since the UI keys and labels by it.
  reasoning: (limit = 50): Promise<ReasoningNote[]> =>
    callEndpoint<SpReasoningNote[]>('reasoning', 'getNotes', { limit }, { authenticated: false }).then((ns) =>
      ns.map((n) => {
        let firing: Firing | undefined;
        let thought: Thought | undefined;
        if (n.kind === 'firing') { try { firing = JSON.parse(n.content) as Firing; } catch { /* malformed: shown as text */ } }
        if (n.kind === 'thought') { try { thought = JSON.parse(n.content) as Thought; } catch { /* malformed: shown as text */ } }
        return { file: `${n.timestamp.replace(/[:.]/g, '-')}${n.kind === 'reasoning' ? '' : `-${n.kind}`}.md`, content: n.content, kind: n.kind, timestamp: n.timestamp, firing, thought };
      }),
    ),
  reasoningNetwork: (limit = 60) =>
    callEndpoint<NeuralNetwork>('reasoning', 'getNetwork', { limit }, { authenticated: false }),
  /** The memories a dream was made of: its stars. */
  dreamStars: (dreamId: number) =>
    callEndpoint<ConceptExample[]>('dream', 'getStars', { dreamId }, { authenticated: false }),
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
  // WYRD's real brain: neurons, synapses and its latest thoughts (public, shared from a 20 s cache)
  brainMap: () => callEndpoint<BrainMapData>('brain', 'getMap', {}, { authenticated: false }),
  concepts: () => callEndpoint<SpConceptGraph>('memory', 'getConcepts', {}, { authenticated: false }).then(adaptConceptsGraph),
  /** Growth averaged over a readable span; see GrowthEndpoint.getHistory. */
  learning: () => callEndpoint<LearningStats>('growth', 'getLearning', {}, { authenticated: false }),
  libraryList: () => callEndpoint<ReadingItem[]>('library', 'list', {}),
  libraryReadOn: (id: number, restart = false, part?: number) =>
    callEndpoint<ReadingSlice>('library', 'readOn', part == null ? { id, restart } : { id, restart, part }),
  libraryCurrent: (id: number) => callEndpoint<ReadingSlice>('library', 'current', { id }),
  libraryQuiz: (id: number, passage: string) => callEndpoint<QuizQuestion[]>('library', 'quiz', { id, passage }),
  libraryQuizDone: (id: number, correct: number, total: number, missed: string[]) =>
    callEndpoint<QuizStats>('library', 'quizDone', { id, correct, total, missed }),
  libraryQuizStats: () => callEndpoint<QuizStats>('library', 'quizStats', {}),
  libraryContents: (id: number) => callEndpoint<WorkPartInfo[]>('library', 'contents', { id }),
  libraryOpenWork: (source: string, id: string) => callEndpoint<ReadingSlice | null>('library', 'openWork', { source, id }),
  libraryTextbooks: () => callEndpoint<WorkHit[]>('library', 'textbooks', {}),
  librarySearchWikisource: (lang: string, query: string) => callEndpoint<WorkHit[]>('library', 'searchWikisource', { lang, query }),
  librarySearchBooks: (query: string) => callEndpoint<WorkHit[]>('library', 'searchBooks', { query }),
  libraryOpenBook: (query: string) => callEndpoint<ReadingSlice | null>('library', 'openBook', { query }),
  libraryRemove: (id: number) => callEndpoint<void>('library', 'remove', { id }),
  // ---- shared files (their text, read in the browser) ----
  /** `staged`: the file waits for the message sent with it (no first-look reply of its own). */
  /** [sample]: the file's opening and pieces from throughout (never the whole file); [words]: its full length. */
  documentUpload: (name: string, kind: string, sample: string, words: number, pages?: number, staged = false) =>
    callEndpoint<{ id: number; name: string; kind: string; words: number; pages: number | null; reply: string; turnId: number | null }>(
      'document', 'upload', pages == null ? { name, kind, text: sample, words, staged } : { name, kind, text: sample, words, pages, staged },
    ),
  judgementReport: () => callEndpoint<JudgementReport>('feed', 'getJudgementReport', {}, { authenticated: false }),
  trust: () => callEndpoint<TrustReport>('feed', 'getTrust', {}, { authenticated: false }),
  filterReport: () => callEndpoint<FilterReport>('feed', 'getFilterReport', {}, { authenticated: false }),
  growthHistory: (range: GrowthRange) =>
    callEndpoint<SpGrowthSnapshot[]>('growth', 'getHistory', { range }, { authenticated: false }).then((es) => es.map(adaptGrowthSnapshot)),
  conceptDetail: (topic: string) =>
    callEndpoint<ConceptDetail>('memory', 'getConceptDetail', { topic }, { authenticated: false }),

  // ---- world map ----
  countries: (): Promise<CountryListItem[]> =>
    callEndpoint<CountryListItem[]>('world', 'getCountries', {}, { authenticated: false }),
  country: async (cca3: string): Promise<CountryDetail> => {
    const detail = await callEndpoint<CountryDetail | null>('world', 'getCountry', { code: cca3 }, { authenticated: false });
    if (!detail) throw new ServerpodClientError(404, 'unknown country code');
    return detail;
  },

  // ---- misc ----
  alerts: (): Promise<AlertNote[]> => callEndpoint<AlertNote[]>('alerts', 'getAlerts', {}, { authenticated: false }),

  // ---- drone ---- (any signed-in user can watch; plan/abort are operator-only on the server)
  droneState: () => callEndpoint<DroneState | null>('drone', 'getState', {}),
  droneMissions: (limit = 10) => callEndpoint<DroneMission[]>('drone', 'getMissions', { limit }),
  droneIsOperator: () => callEndpoint<boolean>('drone', 'isOperator', {}),
  dronePlan: (instruction: string) => callEndpoint<DronePlanResult>('drone', 'plan', { instruction }),
  droneAbort: () => callEndpoint<DroneMission>('drone', 'abort', {}),

  // ---- games ---- (the server holds every position and checks every move)
  gameRatings: () => callEndpoint<PlayerRating[]>('games', 'myRatings', {}),
  gameLeaderboard: (game: string) => callEndpoint<PlayerRating[]>('games', 'leaderboard', { game }),
  gameActive: (game: string) => callEndpoint<GameMatch | null>('games', 'active', { game }),
  chessStart: (side: 'w' | 'b' | 'random') => callEndpoint<GameMatch>('games', 'startChess', { side }),
  chessMove: (matchId: number, from: string, to: string, promotion?: string) =>
    callEndpoint<GameMatch>('games', 'moveChess', { matchId, from, to, promotion: promotion ?? null }),
  gameResign: (matchId: number) => callEndpoint<GameMatch>('games', 'resign', { matchId }),
};
