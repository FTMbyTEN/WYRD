import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';
import type { BrainMapData } from '../components/BrainCanvas';
import { wyrdStream } from './stream';
import type {
  CopLogEntry,
  DroneMission,
  DroneState,
  DiaryEntry,
  DreamEntry,
  FeedItem,
  GrowthSnapshot,
  LexiconStats,
  Mind,
  Profile,
  ReasoningNote,
  SelfConfig,
  StreamEvent,
} from './types';

import { cache, fresh, FRESH_MS, listeners, shared } from './shared';

/** Fetch once on mount (and whenever `deps` change), re-fetch on an optional poll interval.
 *  With a `cacheKey` it goes through the shared request layer (see shared.ts). */

/** Fetches ahead into the cache, so the screen that needs it opens with its data already there. */
export function prefetch(key: string, fetcher: () => Promise<unknown>) {
  shared(key, fetcher).catch(() => {});
}

function usePolled<T>(fetcher: () => Promise<T>, pollMs: number | null, deps: unknown[] = [], cacheKey?: string) {
  const [data, setData] = useState<T | null>(() => (cacheKey ? (cache.get(cacheKey) as T | undefined) ?? null : null));
  const [loading, setLoading] = useState(() => !(cacheKey && cache.has(cacheKey)));
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const lastJson = useRef<string | null>(null);
  // unchanged since last time: keep the same object, so nothing re-renders for nothing
  const apply = useCallback((result: T) => {
    const json = JSON.stringify(result);
    if (json !== lastJson.current) {
      lastJson.current = json;
      setData(result);
    }
  }, []);
  useEffect(() => {
    if (!cacheKey) return;
    const l = (v: unknown) => apply(v as T);
    const set = listeners.get(cacheKey) ?? new Set();
    set.add(l);
    listeners.set(cacheKey, set);
    return () => { set.delete(l); };
  }, [cacheKey, apply]);

  const reload = useCallback(async () => {
    try {
      const result = cacheKey ? await shared(cacheKey, fetcherRef.current) : await fetcherRef.current();
      apply(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // just fetched by another screen (or ahead of time): show that, don't ask again
    if (fresh(cacheKey)) {
      apply(cache.get(cacheKey!) as T);
      setLoading(false);
    } else {
      setLoading(true);
      reload();
    }
    if (!pollMs) return;
    // web: don't poll a tab nobody is looking at; catch up the moment it's visible again
    const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    // another screen polled this a moment ago: its result already reached us, so skip this turn
    const due = () => !fresh(cacheKey, Math.min(FRESH_MS, pollMs * 0.8));
    const id = setInterval(() => { if (!hidden() && due()) reload(); }, pollMs);
    const onVisible = () => { if (!hidden() && due()) reload(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, pollMs, ...deps]);

  return { data, loading, error, reload, setData };
}

/** Prepend a streamed entry, skipping it if the list already has one with the same timestamp
 *  (a hook's own initial fetch can race the stream's baseline poll and already include it). */
function prependUnique<T extends { timestamp: string }>(prev: T[] | null, item: T, max: number): T[] {
  const list = prev || [];
  if (list.some((it) => it.timestamp === item.timestamp)) return list;
  return [item, ...list].slice(0, max);
}

/** Mind vitals: seeded from mind.getMind, kept live by the stream's `mind` event (polled every
 *  5s, and published immediately with each chat reply). */
/** WYRD's live state. Polled every few seconds: its mind changes constantly in the background
 *  (a reasoning firing every 30 s, new articles, self-questions), not only when someone chats. */
export function useMind() {
  const { data, loading, error, setData } = usePolled<Mind>(api.mind, null, [], 'mind'); // kept live by the stream's 5 s poll, which shares this request
  useEffect(() => wyrdStream.subscribe('mind', (m) => setData(m as Mind)), [setData]);
  return { mind: data, loading, error };
}

export function useDiary(limit = 20) {
  const { data, loading, error, reload, setData } = usePolled<DiaryEntry[]>(() => api.diary(limit), null, [limit], `diary:${limit}`);
  useEffect(
    () =>
      wyrdStream.subscribe('diary', (entry) =>
        setData((prev) => prependUnique(prev, entry as DiaryEntry, limit)),
      ),
    [setData, limit],
  );
  return { entries: data || [], loading, error, reload };
}

export function useDreams(limit = 20) {
  const { data, loading, error, reload, setData } = usePolled<DreamEntry[]>(() => api.dreams(limit), null, [limit], `dreams:${limit}`);
  useEffect(
    () =>
      wyrdStream.subscribe('dream', (entry) =>
        setData((prev) => prependUnique(prev, entry as DreamEntry, limit)),
      ),
    [setData, limit],
  );
  return { entries: data || [], loading, error, reload };
}

export function useReasoning() {
  const { data, loading, error, reload } = usePolled<ReasoningNote[]>(api.reasoning, 60000, [], 'reasoning');
  return { notes: data || [], loading, error, reload };
}

export function useSelfConfig() {
  const { data, loading, error, reload, setData } = usePolled<SelfConfig>(api.selfConfig, null, [], 'selfConfig');
  useEffect(
    () =>
      wyrdStream.subscribe('self_modify', () => {
        api.selfConfig().then(setData).catch(() => {});
      }),
    [setData],
  );
  return { config: data, loading, error, reload };
}

export function useCopLog(limit = 20) {
  const { data, loading, error, reload, setData } = usePolled<CopLogEntry[]>(() => api.copLog(limit), null, [limit], `copLog:${limit}`);
  useEffect(
    () =>
      wyrdStream.subscribe('cop_report', (entry) =>
        setData((prev) => prependUnique(prev, entry as CopLogEntry, limit)),
      ),
    [setData, limit],
  );
  return { entries: data || [], loading, error, reload };
}

export function useLexicon() {
  const { data, loading, error, reload } = usePolled<LexiconStats>(api.lexiconStats, 30000, [], 'lexiconStats');
  return { stats: data, loading, error, reload };
}

export function useFeed() {
  const { data, loading, error, reload, setData } = usePolled<FeedItem[]>(api.feedRecent, null, [], 'feed');
  useEffect(
    () =>
      wyrdStream.subscribe('ingested', (item) => setData((prev) => prependUnique(prev, item as FeedItem, 20))),
    [setData],
  );
  return { items: data || [], loading, error, reload };
}

export function useGrowth(limit = 500) {
  // the last week averaged into ~120 points on the server (was 500 raw snapshots per poll)
  const { data, loading, error, reload } = usePolled<GrowthSnapshot[]>(() => api.growthHistory('week'), 300000, [limit], 'growthWeek');
  return { snapshots: data || [], loading, error, reload };
}

export function useConcepts() {
  const { data, loading, error, reload } = usePolled(api.concepts, 60000, [], 'concepts');
  return { graph: data, loading, error, reload };
}

export function useProfile() {
  const { data, loading, error, reload, setData } = usePolled<Profile>(api.profile, null, [], 'profile');
  useEffect(() => wyrdStream.subscribe('profile', (p) => setData(p as Profile)), [setData]);
  return { profile: data, loading, error, reload };
}

export function useFeedNext() {
  const { data } = usePolled(api.feedNext, 5000);
  return data;
}

export function useReasoningNext() {
  const { data } = usePolled(api.reasoningNext, 5000);
  return data;
}

export function useConversations(limit = 50) {
  const { data, loading, error, reload, setData } = usePolled(() => api.conversations(limit), null, [limit], `conversations:${limit}`);
  useEffect(
    () =>
      wyrdStream.subscribe('chat', (turn) => {
        const t = turn as { id?: number; userText: string; botText: string; timestamp: string };
        setData((prev) =>
          prev ? { total: prev.total + 1, turns: [...prev.turns, t] } : { total: 1, turns: [t] },
        );
      }),
    [setData],
  );
  return { total: data?.total ?? 0, turns: data?.turns ?? [], loading, error, reload };
}

/** Increments once per real "WYRD digested something" event (an ingest landing, a reasoning
 *  tick, a self-question, a COP report) — feed it straight into BrainCanvas's `activitySignal`
 *  so the brain visual's burst pulses are tied to genuine backend activity, not a fake timer. */
export function useBrainActivitySignal(mind?: Mind | null) {
  const [signal, setSignal] = useState(0);
  // every real change in WYRD's mind (a firing, an article, a thought, a chat) is a pulse
  const changedAt = mind?.updatedAt;
  useEffect(() => {
    if (changedAt) setSignal((n) => n + 1);
  }, [changedAt]);
  useEffect(() => {
    const bump = () => setSignal((n) => n + 1);
    const events: StreamEvent['event'][] = ['ingested', 'thought', 'cop_report'];
    const unsubs = events.map((event) => wyrdStream.subscribe(event, bump));
    return () => unsubs.forEach((u) => u());
  }, []);
  return signal;
}

/** The drone's latest telemetry (every 1.5s), its recent missions (every 5s), and whether this
 *  account is the operator (asked once). */
/** Whether this person has drone access. Asked once (the server remembers the answer too); the
 *  drone is hidden entirely from everyone else. */
/** WYRD's real brain, refreshed every 15 s (its thoughts fire about every 30 s). Shared and cached,
 *  so the home brain and BRAIN_3D draw the same network without asking twice. */
export function useBrainMap() {
  const { data } = usePolled<BrainMapData>(api.brainMap, 15000, [], 'brainMap');
  return data;
}

/** How many agent tasks have something new: a result not yet read, or an action waiting for an
 *  answer. Checked once a minute (cheap), and again whenever the Tasks panel closes. */
export function useAgentBadge() {
  const { data, reload } = usePolled(api.agentTasks, 60000, [], 'agentTasks');
  const count = (data ?? []).filter((t) => t.unread || t.status === 'waiting_approval').length;
  return { count, reload };
}

export function useDroneAccess() {
  const { data } = usePolled<boolean>(api.droneIsOperator, null, [], 'droneAccess');
  return data === true;
}

export function useDrone() {
  const state = usePolled<DroneState | null>(api.droneState, 1500);
  const missions = usePolled<DroneMission[]>(() => api.droneMissions(10), 5000);
  const operator = usePolled<boolean>(api.droneIsOperator, null, [], 'droneAccess');
  return {
    state: state.data,
    missions: missions.data ?? [],
    isOperator: operator.data === true,
    error: state.error,
    reloadMissions: missions.reload,
  };
}

/** DIALOGUE_LINK's history, fetched ahead so the chat opens already filled. */
export function prefetchDialogue() {
  prefetch('conversations:60', () => api.conversations(60));
}

/** BRAIN_3D's data, fetched ahead while the app is idle, so it opens without waiting on the server. */
export function prefetchBrain() {
  prefetch('brainMap', api.brainMap);
  prefetch('lexiconStats', api.lexiconStats);
  prefetch('growthWeek', () => api.growthHistory('week'));
  prefetch('concepts', api.concepts);
}

/** For screens that load once rather than through a hook: reuse a value fetched in the last few
 *  seconds, or join the request already on its way, instead of asking the server again. */
export function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  return fresh(key) ? Promise.resolve(cache.get(key) as T) : shared(key, fetcher);
}
