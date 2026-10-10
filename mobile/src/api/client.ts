import { callEndpoint, ServerpodClientError, SERVERPOD_BASE_URL } from './serverpodClient';
import type { BrainMapData } from '../components/BrainCanvas';
import type { CharacterLook, CityCharter, CityDecree, CityStats, CityHome, CityWallet, CityActivity, CityDesignNote, CityLiveDesign } from './types';
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
  AgentTask,
  AgentStep,
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
  avatar?: string | null;
  facts: SpUserFact[];
  visitCount: number;
  firstSeen: string;
  lastSeen: string;
}
function adaptProfile(p: SpUserProfile): Profile {
  return {
    username: p.username,
    avatar: p.avatar ?? null,
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
  image?: string | null;
  timestamp: string;
}
function adaptConversationTurn(t: SpConversationTurn): ConversationTurn {
  return { id: t.id, rating: t.rating ?? null, userText: t.userText, botText: t.botText, image: t.image ?? null, timestamp: t.timestamp };
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
    action: r.action && (r.action.type === 'open_world_map' || r.action.type === 'preview_app' || r.action.type === 'open_drone' || r.action.type === 'open_book' || r.action.type === 'open_tasks')
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

/** reputation by group (district / faction / social) and key, -100..100; missions by id; the city's memory of you */
export type Story = { rep: { district: Record<string, number>; faction: Record<string, number>; social: Record<string, number> };
  missions: Record<string, { step: string; at: string; moves: string[] }>; memory: { at: string; what: string }[];
  factions?: Record<string, string>; social?: Record<string, string>; naira?: number;
  /** the nine variables of each district the player has touched, 0..100, and their names */
  city?: Record<string, Record<string, number>>; cityVars?: Record<string, string>;
  /** the people who remember you: trust -100..100 and what they remember */
  people?: Record<string, { trust: number; notes: { at: string; what: string; felt: string }[] }>;
  bulletins?: { at: string; text: string }[];
  background?: string; backgrounds?: Record<string, [string, string]>;
  career?: string; careerXp?: number; careerStage?: string | null; careers?: Record<string, string>; careerStages?: string[] };

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
  photo: (imageBase64Jpeg: string, caption?: string, trackingNote?: string, thumb?: string) =>
    callEndpoint<SpChatReply>('photo', 'describe', { imageBase64Jpeg, caption: caption || null, trackingNote: trackingNote || null, thumb: thumb || null }).then(adaptChatResult),
  /** 👍 1, 👎 -1, or 0 to clear, on one of WYRD's replies to you. */
  rateReply: (turnId: number, rating: 1 | -1 | 0) => callEndpoint<void>('chat', 'rate', { turnId, rating }),
  conversations: async (limit = 50) => {
    const turns = await callEndpoint<SpConversationTurn[]>('chat', 'getHistory', { limit });
    return { total: turns.length, turns: turns.map(adaptConversationTurn) };
  },

  // ---- profile / account ----
  profile: () => callEndpoint<SpUserProfile>('profile', 'getProfile', {}).then(adaptProfile),
  // records a visit; also creates the WYRD profile row and stores the sign-in email on it
  setName: (username: string) => callEndpoint<SpUserProfile>('profile', 'setUsername', { username }).then(adaptProfile),
  setAvatar: (dataUrl: string | null) => callEndpoint<SpUserProfile>('profile', 'setAvatar', { dataUrl }).then(adaptProfile),
  touchVisit: () => callEndpoint<SpUserProfile>('profile', 'touchVisit', {}).then(adaptProfile),
  exportAccount: () => callEndpoint<SpAccountExport>('account', 'exportData', {}),
  deleteAccount: () => callEndpoint<void>('account', 'deleteMyData', {}).then(() => ({ ok: true })),

  // ---- journal: diary / dreams / reasoning ----
  diary: (limit = 20) =>
    callEndpoint<SpDiaryEntry[]>('diary', 'getEntries', { limit }).then((es) => [...es].reverse()),
  triggerDiary: () =>
    callEndpoint<SpDiaryEntry>('diary', 'trigger', {}).then((entry) => ({ entry })),
  dreams: (limit = 20) =>
    callEndpoint<SpDreamEntry[]>('dream', 'getEntries', { limit }).then((es) =>
      [...es].reverse().map(adaptDreamEntry),
    ),
  triggerDream: () =>
    callEndpoint<SpDreamEntry | null>('dream', 'trigger', {}).then((entry) => ({
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
    callEndpoint<ConceptExample[]>('dream', 'getStars', { dreamId }),
  triggerReasoning: () =>
    callEndpoint<boolean>('reasoning', 'trigger', {}, { authenticated: false }).then((ran) => ({ ran })),
  reasoningNext: (): Promise<NextTick> => Promise.resolve({ nextTickAt: Date.now() + 30000, cycleMs: 30000 }),

  // ---- COP oversight ----
  selfConfig: () => callEndpoint<SpSelfConfig>('selfConfig', 'getConfig', {}, { authenticated: false }).then(adaptSelfConfig),
  copLog: (limit = 20) =>
    callEndpoint<SpCopLogEntry[]>('selfConfig', 'getCopLog', { limit }).then((es) =>
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

  // ---- agent tasks ----
  agentTasks: () => callEndpoint<AgentTask[]>('agent', 'mine', {}),
  agentCreate: (goal: string, everyHours: number | null) => callEndpoint<AgentTask>('agent', 'create', { goal, everyHours }),
  agentSteps: (taskId: number) => callEndpoint<AgentStep[]>('agent', 'steps', { taskId }),
  agentDecide: (taskId: number, approve: boolean) => callEndpoint<AgentTask>('agent', 'decide', { taskId, approve }),
  agentCancel: (taskId: number) => callEndpoint<AgentTask>('agent', 'cancel', { taskId }),
  agentRunNow: (taskId: number) => callEndpoint<AgentTask>('agent', 'runNow', { taskId }),
  agentMarkRead: (taskId: number) => callEndpoint<AgentTask>('agent', 'markRead', { taskId }),

  // ---- the open world's Authority (WYRD) ----
  cityAddress: (channel: 'speak' | 'petition' | 'drone' | 'event', text: string, situation: object) =>
    callEndpoint<string>('city', 'address', { channel, text, situation: JSON.stringify(situation) }).then((j) => JSON.parse(j) as CityDecree),
  cityStatus: () => callEndpoint<string>('city', 'status', {}).then((j) => JSON.parse(j) as CityDecree),
  cityPulse: () => callEndpoint<void>('city', 'pulse', {}),
  /** WYRD's live wire to every player: what's happened in the city since item [since] (0: the latest few) */
  cityWire: (since: number) => callEndpoint<string>('city', 'wire', { since }).then((j) => JSON.parse(j) as { items: { id: number; at: string; kind: 'deed' | 'event' | 'pulse'; text: string }[]; online: number; last: number }),
  cityWallet: () => callEndpoint<string>('city', 'wallet', {}).then((j) => JSON.parse(j) as CityWallet),
  cityHomes: () => callEndpoint<string>('city', 'homes', {}).then((j) => JSON.parse(j) as CityHome[]),
  cityTakeHome: (slug: string, mode: 'rent' | 'own') => callEndpoint<string>('city', 'takeHome', { slug, mode }).then((j) => JSON.parse(j) as CityWallet | { error: string }),
  cityLeaveHome: () => callEndpoint<string>('city', 'leaveHome', {}).then((j) => JSON.parse(j) as CityWallet | { error: string }),
  cityPlaceActivities: (kind: string) => callEndpoint<string>('city', 'placeActivities', { kind }).then((j) => JSON.parse(j) as CityActivity[]),
  cityVisit: (kind: string, activity: string, place: string) => callEndpoint<string>('city', 'visit', { kind, activity, place }).then((j) => JSON.parse(j) as (CityWallet & { text: string; delta: number; heal: number; standing: number }) | { error: string }),
  cityJobStart: (type: 'delivery' | 'danfo' | 'chase') => callEndpoint<string>('city', 'jobStart', { type }).then((j) => JSON.parse(j) as { id: string; type: string } | { error: string }),
  cityJobFinish: (id: string, dist: number, passengers: number, limitS: number) => callEndpoint<string>('city', 'jobFinish', { id, dist, passengers, limitS }).then((j) => JSON.parse(j) as (CityWallet & { paid: number; note: string }) | { error: string }),
  cityGuideMark: (step: string) => callEndpoint<string>('city', 'guideMark', { step }).then((j) => JSON.parse(j) as { guide: string[]; paid: number; naira: number } | { error: string }),
  cityGuideSkip: () => callEndpoint<string>('city', 'guideSkip', {}).then((j) => JSON.parse(j) as { guide: string[]; paid: number; naira: number }),
  cityPay: (reason: 'maglev' | 'danfo' | 'ride' | 'air' | 'fine' | 'fine_desk' | 'lawyer' | 'lift') => callEndpoint<string>('city', 'pay', { reason }).then((j) => JSON.parse(j) as CityWallet | { error: string }),
  /** NAIJA 2099's story: reputation and branching missions (the server decides every step). */
  cityStory: () => callEndpoint<string>('city', 'story', {}).then((j) => JSON.parse(j) as Story),
  cityStoryAct: (mission: string, move: string) => callEndpoint<string>('city', 'storyAct', { mission, move }).then((j) => JSON.parse(j) as { ok?: boolean; error?: string; say?: string; step?: string; naira?: number; paid?: number; cost?: number; bulletin?: string | null; story?: Story }),
  cityMissionPaid: (id: string) => callEndpoint<string>('city', 'missionPaid', { id }).then((j) => JSON.parse(j) as CityWallet | { error: string }),
  cityStats: () => callEndpoint<string>('city', 'stats', {}).then((j) => JSON.parse(j) as CityStats),
  cityCharter: () => callEndpoint<string>('city', 'charter', {}).then((j) => JSON.parse(j) as CityCharter),
  /** Your NAIJA 2099 character, or null before you've made one. */
  myCharacter: () => callEndpoint<string>('city', 'myCharacter', {}).then((j) => JSON.parse(j) as CharacterLook | null),
  saveCharacter: (look: CharacterLook) => callEndpoint<string>('city', 'saveCharacter', { character: JSON.stringify(look) }).then((j) => JSON.parse(j) as CharacterLook),
  /** Let WYRD learn from your play in NAIJA 2099 (or stop). */
  citySetTraining: (optIn: boolean) => callEndpoint<string>('city', 'setTraining', { optIn }).then((j) => JSON.parse(j) as CityDecree),
  /** anonymous tallies of what the city saw (only kept for players who agreed to let WYRD learn): [{k, p, n, v}] */
  /** cancel your WYRD Ride or flight: the fare back (all of it in the first minute, 80% after) */
  cityRefundRide: () => callEndpoint<string>('city', 'refundRide', {}).then((j) => JSON.parse(j) as CityWallet & { error?: string }),
  /** dispute a charge on your receipts: refunded at once (small) or queued for review */
  cityDispute: (ref: string, reason: 'not_delivered' | 'wrong_amount' | 'other') => callEndpoint<string>('city', 'dispute', { ref, reason }).then((j) => JSON.parse(j) as CityWallet & { error?: string }),
  /** your latest receipts from the naira ledger, newest first */
  cityReceipts: () => callEndpoint<string>('city', 'receipts', {}).then((j) => JSON.parse(j) as { ref: string; kind: string; memo: string; amount: number; balance: number; at: string; reversed: boolean }[]),
  citySignals: (batch: string) => callEndpoint<string>('city', 'signals', { batch }).then((j) => JSON.parse(j) as { kept?: number; optIn?: boolean; error?: string }),
  cityDesign: () => callEndpoint<string>('city', 'design', {}).then((j) => JSON.parse(j) as CityLiveDesign),
  // the design studio: the owner designs the game with WYRD (operators only)
  cityCanDesign: () => callEndpoint<boolean>('city', 'canDesign', {}),
  cityDesignChat: (text: string) => callEndpoint<string>('city', 'designChat', { text }).then((j) => JSON.parse(j) as { reply: string; proposals: CityDesignNote[] }),
  cityDesignNotes: () => callEndpoint<string>('city', 'designNotes', {}).then((j) => JSON.parse(j) as CityDesignNote[]),
  cityDesignDecide: (id: number, approve: boolean) => callEndpoint<string>('city', 'designDecide', { id, approve }).then((j) => JSON.parse(j) as CityDesignNote),

  // ---- owner ---- (operator accounts only; the server checks)
  ownerUserStats: () => callEndpoint<string>('owner', 'userStats', {}),

  // ---- games ---- (the server holds every position and checks every move)
  gameRatings: () => callEndpoint<PlayerRating[]>('games', 'myRatings', {}),
  gameLeaderboard: (game: string) => callEndpoint<PlayerRating[]>('games', 'leaderboard', { game }),
  gameActive: (game: string) => callEndpoint<GameMatch | null>('games', 'active', { game }),
  chessStart: (side: 'w' | 'b' | 'random') => callEndpoint<GameMatch>('games', 'startChess', { side }),
  chessMove: (matchId: number, from: string, to: string, promotion?: string) =>
    callEndpoint<GameMatch>('games', 'moveChess', { matchId, from, to, promotion: promotion ?? null }),
  gameResign: (matchId: number) => callEndpoint<GameMatch>('games', 'resign', { matchId }),
  gameStart: (game: string, side: 'w' | 'b' | 'random') => callEndpoint<GameMatch>('games', 'start', { game, side }),
  gameMove: (matchId: number, move: string) => callEndpoint<GameMatch>('games', 'move', { matchId, move }),
  gameChallenge: (game: string) => callEndpoint<GameMatch>('games', 'challenge', { game }),
  gameOpenChallenges: (game: string) => callEndpoint<GameMatch[]>('games', 'openChallenges', { game }),
  gameAccept: (matchId: number) => callEndpoint<GameMatch>('games', 'accept', { matchId }),
  gameCancel: (matchId: number) => callEndpoint<void>('games', 'cancel', { matchId }),
  gameMyPvp: () => callEndpoint<GameMatch[]>('games', 'myPvp', {}),
  // pvp: the game if it changed since [version], else null (answered from the server's memory)
  gamePoll: (matchId: number, version: number) => callEndpoint<GameMatch | null>('games', 'poll', { matchId, version }),
};
