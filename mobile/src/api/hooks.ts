import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';
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

/** Fetch once on mount (and whenever `deps` change), re-fetch on an optional poll interval. */
function usePolled<T>(fetcher: () => Promise<T>, pollMs: number | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!pollMs) return;
    const id = setInterval(reload, pollMs);
    return () => clearInterval(id);
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
  const { data, loading, error, setData } = usePolled<Mind>(api.mind, 8000);
  useEffect(() => wyrdStream.subscribe('mind', (m) => setData(m as Mind)), [setData]);
  return { mind: data, loading, error };
}

export function useDiary(limit = 20) {
  const { data, loading, error, reload, setData } = usePolled<DiaryEntry[]>(() => api.diary(limit), null, [limit]);
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
  const { data, loading, error, reload, setData } = usePolled<DreamEntry[]>(() => api.dreams(limit), null, [limit]);
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
  const { data, loading, error, reload } = usePolled<ReasoningNote[]>(api.reasoning, 60000);
  return { notes: data || [], loading, error, reload };
}

export function useSelfConfig() {
  const { data, loading, error, reload, setData } = usePolled<SelfConfig>(api.selfConfig, null);
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
  const { data, loading, error, reload, setData } = usePolled<CopLogEntry[]>(() => api.copLog(limit), null, [limit]);
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
  const { data, loading, error, reload } = usePolled<LexiconStats>(api.lexiconStats, 30000);
  return { stats: data, loading, error, reload };
}

export function useFeed() {
  const { data, loading, error, reload, setData } = usePolled<FeedItem[]>(api.feedRecent, null);
  useEffect(
    () =>
      wyrdStream.subscribe('ingested', (item) => setData((prev) => prependUnique(prev, item as FeedItem, 20))),
    [setData],
  );
  return { items: data || [], loading, error, reload };
}

export function useGrowth(limit = 500) {
  const { data, loading, error, reload } = usePolled<GrowthSnapshot[]>(() => api.growth(limit), 120000, [limit]);
  return { snapshots: data || [], loading, error, reload };
}

export function useConcepts() {
  const { data, loading, error, reload } = usePolled(api.concepts, 60000);
  return { graph: data, loading, error, reload };
}

export function useProfile() {
  const { data, loading, error, reload, setData } = usePolled<Profile>(api.profile, null);
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
  const { data, loading, error, reload, setData } = usePolled(() => api.conversations(limit), null, [limit]);
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
export function useDrone() {
  const state = usePolled<DroneState | null>(api.droneState, 1500);
  const missions = usePolled<DroneMission[]>(() => api.droneMissions(10), 5000);
  const operator = usePolled<boolean>(api.droneIsOperator, null);
  return {
    state: state.data,
    missions: missions.data ?? [],
    isOperator: operator.data === true,
    error: state.error,
    reloadMissions: missions.reload,
  };
}
