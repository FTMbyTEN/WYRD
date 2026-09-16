import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';
import { wyrdStream } from './sse';
import type {
  CopLogEntry,
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

/** Mind vitals: seeded from GET /api/mind, kept live by the `mind` SSE event (broadcast on
 *  every chat/ingest/reasoning/self-modify tick — far more responsive than polling). */
export function useMind() {
  const { data, loading, error, setData } = usePolled<Mind>(api.mind, 20000);
  useEffect(() => wyrdStream.subscribe('mind', (m) => setData(m as Mind)), [setData]);
  return { mind: data, loading, error };
}

export function useDiary(limit = 20) {
  const { data, loading, error, reload, setData } = usePolled<DiaryEntry[]>(() => api.diary(limit), null, [limit]);
  useEffect(
    () =>
      wyrdStream.subscribe('diary', (entry) =>
        setData((prev) => [entry as DiaryEntry, ...(prev || [])].slice(0, limit)),
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
        setData((prev) => [entry as DreamEntry, ...(prev || [])].slice(0, limit)),
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
  const { data, loading, error, reload, setData } = usePolled<SelfConfig>(api.selfConfig, 30000);
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
        setData((prev) => [entry as CopLogEntry, ...(prev || [])].slice(0, limit)),
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
  const { data, loading, error, reload, setData } = usePolled<FeedItem[]>(api.feedRecent, 15000);
  useEffect(
    () =>
      wyrdStream.subscribe('ingested', (item) => setData((prev) => [item as FeedItem, ...(prev || [])].slice(0, 20))),
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
  const { data, loading, error, reload, setData } = usePolled<Profile>(api.profile, 30000);
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
        const t = turn as { userText: string; botText: string; timestamp: string };
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
export function useBrainActivitySignal() {
  const [signal, setSignal] = useState(0);
  useEffect(() => {
    const bump = () => setSignal((n) => n + 1);
    const events: StreamEvent['event'][] = ['ingested', 'thought', 'cop_report'];
    const unsubs = events.map((event) => wyrdStream.subscribe(event, bump));
    return () => unsubs.forEach((u) => u());
  }, []);
  return signal;
}
