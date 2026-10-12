import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { OverlayShell } from './OverlayShell';
import { Display, Mono } from '../../components/ui';
import { RichText } from '../../components/RichText';
import { DustThinking } from '../../components/dust/DustThinking';
import { colors, fonts } from '../../theme';
import { api, ApiError } from '../../api/client';
import type { AgentStep, AgentTask } from '../../api/types';
import { sfx } from '../../util/sound';

const SCHEDULES: { label: string; hours: number | null }[] = [
  { label: 'ONCE', hours: null },
  { label: 'HOURLY', hours: 1 },
  { label: 'DAILY', hours: 24 },
  { label: 'WEEKLY', hours: 168 },
];

const STATUS: Record<string, string> = {
  queued: 'STARTING', running: 'WORKING', waiting_approval: 'NEEDS YOU', scheduled: 'SCHEDULED',
  done: 'DONE', failed: 'FAILED', cancelled: 'CANCELLED',
};

const EXAMPLES = [
  'News on gold and BTC this week, with prices and what moved them',
  'Every morning, check the news for drone delivery regulations in Nigeria and tell me what changed',
  'Compare the three cheapest solar inverters available in Lagos, with prices and sources',
];

type Filter = 'all' | 'you' | 'routines' | 'done';
const FILTERS: { key: Filter; label: string; test: (t: AgentTask) => boolean }[] = [
  { key: 'all', label: 'ALL', test: () => true },
  { key: 'you', label: 'NEEDS YOU', test: (t) => t.status === 'waiting_approval' },
  { key: 'routines', label: 'ROUTINES', test: (t) => !!t.everyHours },
  { key: 'done', label: 'DONE', test: (t) => t.status === 'done' || t.status === 'failed' || t.status === 'cancelled' },
];

const isWorking = (t: AgentTask) => t.status === 'queued' || t.status === 'running';

/** Your tasks, kept fresh: looked at again every few seconds while any is working. */
export function useTasks() {
  const [tasks, setTasks] = useState<AgentTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setTasks(await api.agentTasks()); setError(null); } catch (e) { setError(msg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const working = (tasks ?? []).some(isWorking);
  useEffect(() => {
    const id = setInterval(() => { void load(); }, working ? 5000 : 60000);
    return () => clearInterval(id);
  }, [working, load]);
  const replace = (t: AgentTask) => setTasks((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)));
  const added = (t: AgentTask) => setTasks((cur) => [t, ...(cur ?? [])]);
  return { tasks, error, load, replace, added };
}

/** TASKS, the list: give WYRD a goal, and see each task's state at a glance. On desktop it's the
 *  home page's left column; on phones it's inside the TASKS panel. */
export function TasksBoard({ tasks, onOpen, onCreated, error: loadError, onClose }: {
  tasks: AgentTask[] | null;
  onClose?: () => void; // the home page's column has its own close
  onOpen: (id: number) => void;
  onCreated: (t: AgentTask) => void;
  error?: string | null;
}) {
  const [goal, setGoal] = useState('');
  const [every, setEvery] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const create = async () => {
    if (goal.trim().length < 8 || busy) return;
    setBusy(true); setError(null);
    try {
      const t = await api.agentCreate(goal.trim(), every);
      setGoal(''); setEvery(null); sfx('send');
      onCreated(t);
      onOpen(t.id);
    } catch (e) { setError(msg(e)); }
    finally { setBusy(false); }
  };

  const all = tasks ?? [];
  const working = all.filter(isWorking).length;
  const shown = all.filter(FILTERS.find((f) => f.key === filter)!.test);
  const canStart = !busy && goal.trim().length >= 8;

  return (
    <View style={styles.board}>
      <View style={styles.boardHead}>
        <Display style={styles.boardTitle}>TASKS</Display>
        <View style={styles.row}>
          {working ? <View style={[styles.pill, styles.pillLive]}><Mono style={[styles.pillText, { color: colors.onSignal }]}>{working} WORKING</Mono></View> : null}
          {onClose ? <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close tasks"><Mono style={styles.close}>✕</Mono></Pressable> : null}
        </View>
      </View>

      <View style={styles.composer}>
        <TextInput
          value={goal}
          onChangeText={setGoal}
          placeholder="Give WYRD something to work on…"
          placeholderTextColor={colors.greenDim}
          multiline
          style={styles.input}
        />
        <View style={styles.row}>
          {SCHEDULES.map((s) => (
            <Pressable key={s.label} onPress={() => setEvery(s.hours)} style={[styles.chip, every === s.hours && styles.chipOn]}>
              <Mono style={[styles.chipText, every === s.hours && styles.chipTextOn]}>{s.label}</Mono>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <Pressable disabled={!canStart} onPress={create} style={({ pressed }) => [styles.go, !canStart && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
            <Mono style={styles.goText}>{busy ? '…' : 'START'}</Mono>
          </Pressable>
        </View>
      </View>
      {!goal && all.length < 3 ? (
        <View style={{ gap: 4 }}>
          {EXAMPLES.map((e) => (
            <Pressable key={e} onPress={() => { setGoal(e); setEvery(e.startsWith('Every morning') ? 24 : null); }}>
              <Mono style={styles.example}>↳ {e}</Mono>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error || loadError ? <Mono style={styles.error}>{error ?? loadError}</Mono> : null}

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const n = all.filter(f.test).length;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} hitSlop={6}>
              <Mono style={[styles.filter, filter === f.key && styles.filterOn]}>{f.label} {n}</Mono>
            </Pressable>
          );
        })}
      </View>

      {!tasks ? <ActivityIndicator color={colors.signal} /> : shown.length === 0 ? (
        <Mono style={styles.muted}>{all.length === 0 ? 'Nothing yet. You can also just ask WYRD in Dialogue Link to "look into" something.' : 'Nothing here.'}</Mono>
      ) : shown.map((t) => <TaskCard key={t.id} task={t} onPress={() => onOpen(t.id)} />)}
    </View>
  );
}

function TaskCard({ task: t, onPress }: { task: AgentTask; onPress: () => void }) {
  const pending = t.status === 'waiting_approval' && t.pendingAction ? (JSON.parse(t.pendingAction) as { summary?: string; kind?: string }) : null;
  const meta = isWorking(t)
    ? (t.status === 'queued' ? 'starting…' : `step ${t.stepsUsed} of ${t.maxSteps}`)
    : t.everyHours && t.status === 'scheduled'
      ? `every ${schedule(t.everyHours)} · next ${when(t.nextRunAt)}`
      : t.lastRunAt ? when(t.lastRunAt) : when(t.createdAt);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.card, (t.unread || pending) && styles.cardUnread, (pressed || hovered) && styles.cardHover]}
    >
      <View style={styles.cardHead}>
        <StatusPill status={t.status} routine={!!t.everyHours} />
        <Mono style={styles.meta} numberOfLines={1}>{meta}</Mono>
        {t.unread ? <View style={styles.dot} /> : null}
      </View>
      <Mono style={styles.goal} numberOfLines={2}>{t.goal}</Mono>
      {isWorking(t) ? <Progress value={t.status === 'queued' ? 0.04 : t.stepsUsed / Math.max(1, t.maxSteps)} /> : null}
      {pending ? <Mono style={[styles.preview, { color: colors.signal }]} numberOfLines={2}>Wants to: {pending.summary ?? pending.kind} →</Mono>
        : t.result ? <Mono style={styles.preview} numberOfLines={2}>{plain(t.result)}</Mono> : null}
    </Pressable>
  );
}

/** TASKS as a panel: the list (phones), or straight to one task's result when [openId] is given
 *  (from the home page's left column). */
export function TasksOverlay({ visible, onClose, openId }: { visible: boolean; onClose: () => void; openId?: number | null }) {
  const { tasks, error, replace, added } = useTasks();
  const [open, setOpen] = useState<number | null>(openId ?? null);
  useEffect(() => { if (openId != null) setOpen(openId); }, [openId]);
  const current = (tasks ?? []).find((t) => t.id === open) ?? null;
  return (
    <OverlayShell visible={visible} title="TASKS" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {current ? (
          <TaskDetail task={current} onBack={() => (openId != null ? onClose() : setOpen(null))} backLabel={openId != null ? '‹ CLOSE' : '‹ ALL TASKS'} onChanged={replace} />
        ) : open != null && !tasks ? (
          <ActivityIndicator color={colors.signal} />
        ) : (
          <TasksBoard tasks={tasks} error={error} onOpen={setOpen} onCreated={added} />
        )}
      </ScrollView>
    </OverlayShell>
  );
}

function TaskDetail({ task, onBack, backLabel, onChanged }: { task: AgentTask; onBack: () => void; backLabel: string; onChanged: (t: AgentTask) => void }) {
  const [steps, setSteps] = useState<AgentStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try { setSteps(await api.agentSteps(task.id)); } catch (e) { setError(msg(e)); }
  }, [task.id]);
  useEffect(() => { void load(); }, [load, task.status, task.updatedAt]);
  useEffect(() => { if (task.unread) api.agentMarkRead(task.id).then(onChanged).catch(() => {}); }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (f: () => Promise<AgentTask>) => {
    setBusy(true); setError(null);
    try { onChanged(await f()); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  const pending = task.pendingAction ? (JSON.parse(task.pendingAction) as { summary?: string; kind?: string; url?: string }) : null;
  const working = isWorking(task);
  const run = (steps ?? []).filter((s) => s.run === task.runs);
  const sources = sourcesOf(task.result ?? '');
  const tookMs = run.length > 1 ? new Date(run[run.length - 1].at).getTime() - new Date(run[0].at).getTime() : 0;
  const meta = [
    task.lastRunAt && !working ? `finished ${new Date(task.lastRunAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : null,
    run.length ? `${run.filter((s) => s.kind === 'tool' || s.kind === 'note').length} steps` : null,
    sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'}` : null,
    tookMs > 0 && !working ? took(tookMs) : null,
    task.everyHours ? `every ${schedule(task.everyHours)} · run ${task.runs}` : null,
  ].filter(Boolean).join(' · ');

  const copy = () => {
    if (Platform.OS === 'web' && task.result) navigator.clipboard?.writeText(task.result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };

  return (
    <View style={styles.sheet}>
      <Pressable onPress={onBack} hitSlop={8}><Mono style={styles.back}>{backLabel}</Mono></Pressable>
      <View style={styles.cardHead}>
        <StatusPill status={task.status} routine={!!task.everyHours} />
        {meta ? <Mono style={styles.meta}>{meta}</Mono> : null}
      </View>
      <Display style={styles.title}>{task.goal}</Display>

      {working ? (
        <View style={styles.workingBox}>
          <View style={styles.workingRow}>
            <DustThinking width={58} height={20} />
            <Mono style={styles.muted}>{task.status === 'queued' ? 'Starting within a minute…' : `Working · step ${task.stepsUsed} of ${task.maxSteps}${run.length ? ` · ${run[run.length - 1].detail}` : ''}`}</Mono>
          </View>
          <Progress value={task.status === 'queued' ? 0.04 : task.stepsUsed / Math.max(1, task.maxSteps)} />
        </View>
      ) : null}

      {task.status === 'waiting_approval' && pending ? (
        <View style={styles.ask}>
          <Mono style={styles.askLabel}>WYRD WANTS TO</Mono>
          <Mono style={styles.askText}>{pending.summary ?? pending.kind}</Mono>
          {pending.url ? <Mono style={styles.meta}>{pending.url}</Mono> : null}
          <View style={styles.row}>
            <Pressable disabled={busy} onPress={() => act(() => api.agentDecide(task.id, true))} style={[styles.go, { flex: 1 }]}>
              <Mono style={styles.goText}>YES, DO IT</Mono>
            </Pressable>
            <Pressable disabled={busy} onPress={() => act(() => api.agentDecide(task.id, false))} style={[styles.ghost, { flex: 1 }]}>
              <Mono style={styles.ghostText}>NO</Mono>
            </Pressable>
          </View>
        </View>
      ) : null}

      {task.result ? (
        <View style={styles.report}>
          <Mono style={styles.reportLabel}>{task.everyHours ? 'LATEST REPORT' : 'REPORT'}</Mono>
          <RichText text={task.result} style={{ fontSize: 14, lineHeight: 22 }} />
          {sources.length ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Mono style={styles.reportLabel}>SOURCES</Mono>
              <View style={styles.row}>
                {sources.map((s) => <View key={s} style={styles.source}><Mono style={styles.sourceText}>{s}</Mono></View>)}
              </View>
            </View>
          ) : null}
        </View>
      ) : !working && task.status !== 'waiting_approval' ? (
        <Mono style={styles.muted}>No report from this run.</Mono>
      ) : null}

      <View style={styles.row}>
        {['done', 'failed', 'scheduled', 'cancelled'].includes(task.status) ? (
          <Pressable disabled={busy} onPress={() => act(() => api.agentRunNow(task.id))} style={styles.ghost}>
            <Mono style={styles.ghostText}>RUN AGAIN</Mono>
          </Pressable>
        ) : null}
        {task.status !== 'cancelled' && task.status !== 'done' ? (
          <Pressable disabled={busy} onPress={() => act(() => api.agentCancel(task.id))} style={styles.ghost}>
            <Mono style={styles.ghostText}>{task.everyHours ? 'STOP ROUTINE' : 'CANCEL'}</Mono>
          </Pressable>
        ) : null}
        {task.result && Platform.OS === 'web' ? (
          <Pressable onPress={copy} style={styles.go}>
            <Mono style={styles.goText}>{copied ? 'COPIED' : 'COPY REPORT'}</Mono>
          </Pressable>
        ) : null}
      </View>
      {error ? <Mono style={styles.error}>{error}</Mono> : null}

      <View style={styles.how}>
        <Pressable onPress={() => setShowSteps((v) => !v)} hitSlop={6}>
          <Mono style={styles.reportLabel}>{(showSteps || working) ? '▾' : '▸'} HOW IT WORKED{run.length ? ` · ${run.length} STEPS` : ''}</Mono>
        </Pressable>
        {(showSteps || working) ? (!steps ? <ActivityIndicator color={colors.signal} /> : steps.length === 0 ? <Mono style={styles.muted}>No steps yet.</Mono> : (
          <View style={{ gap: 2 }}>
            {steps.map((s) => (
              <View key={s.id} style={styles.step}>
                <Mono style={[styles.stepKind, (s.kind === 'ask' || s.kind === 'result') && { color: colors.signal }, s.kind === 'error' && { color: colors.danger }]}>
                  {(s.tool ?? s.kind).replace(/_/g, ' ').toUpperCase()}
                </Mono>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Mono style={styles.stepText}>{s.detail}</Mono>
                  {s.output && s.kind !== 'result' ? <Mono style={styles.stepOut} numberOfLines={3}>{s.output}</Mono> : null}
                </View>
              </View>
            ))}
          </View>
        )) : null}
      </View>
    </View>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.bar, { width: `${Math.round(Math.min(1, Math.max(0.04, value)) * 100)}%` }]} />
    </View>
  );
}

function StatusPill({ status, routine }: { status: string; routine?: boolean }) {
  const live = status === 'running' || status === 'queued' || status === 'waiting_approval';
  const label = status === 'scheduled' && routine ? 'ROUTINE' : STATUS[status] ?? status.toUpperCase();
  return (
    <View style={[styles.pill, live && styles.pillLive, status === 'done' && styles.pillDone, status === 'failed' && { borderColor: colors.danger }]}>
      <Mono style={[styles.pillText, (live || status === 'done') && { color: colors.onSignal }, status === 'failed' && { color: colors.danger }]}>{label}</Mono>
    </View>
  );
}

/** The sites a report cites, by name. */
function sourcesOf(text: string): string[] {
  const hosts = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/([^/\s)\]]+)/g)) {
    const h = m[1].replace(/^www\./, '');
    if (h !== 'news.google.com') hosts.add(h);
  }
  return [...hosts].slice(0, 12);
}

const plain = (s: string) => s.replace(/[#*_`>|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? `today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const took = (ms: number) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
const schedule = (h: number) => (h === 1 ? 'hour' : h === 24 ? 'day' : h === 168 ? 'week' : `${h} h`);
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, maxWidth: 880, width: '100%', alignSelf: 'center' },
  board: { gap: 12 },
  boardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boardTitle: { fontSize: 28, lineHeight: 30, color: colors.mint },
  close: { fontSize: 14, color: colors.greenDim, paddingHorizontal: 4 },
  label: { fontSize: 10, letterSpacing: 2.4, color: colors.greenDim },
  muted: { fontSize: 12, lineHeight: 18, color: colors.greenDim, flexShrink: 1 },
  composer: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 14, padding: 12, gap: 10, backgroundColor: colors.glassTile },
  input: {
    minHeight: 56, fontSize: 14, lineHeight: 20, color: colors.mint, fontFamily: fonts.mono, outlineStyle: 'none',
  } as object,
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 10, letterSpacing: 1.2, color: colors.greenDim },
  chipTextOn: { color: colors.black },
  go: { backgroundColor: colors.signal, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  goText: { fontSize: 11.5, letterSpacing: 1.2, color: colors.onSignal },
  ghost: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  ghostText: { fontSize: 11.5, letterSpacing: 1.2, color: colors.mint },
  example: { fontSize: 11.5, lineHeight: 17, color: colors.signal },
  error: { fontSize: 12, color: colors.danger },
  filters: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 2 },
  filter: { fontSize: 10.5, letterSpacing: 0.8, color: colors.greenDim },
  filterOn: { color: colors.signal },
  card: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 14, padding: 14, gap: 8, backgroundColor: colors.glassTile },
  cardUnread: { borderColor: colors.signal, borderWidth: 1.5 },
  cardHover: { backgroundColor: colors.glassTileOn },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { fontSize: 10.5, color: colors.greenDim, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal, marginLeft: 'auto' },
  goal: { fontSize: 13.5, lineHeight: 19, color: colors.mint },
  preview: { fontSize: 11.5, lineHeight: 17, color: colors.greenDim },
  pill: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillLive: { backgroundColor: colors.signal, borderColor: colors.signal },
  pillDone: { backgroundColor: colors.palm, borderColor: colors.palm },
  pillText: { fontSize: 9.5, letterSpacing: 1.2, color: colors.greenDim },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.greenBorderDim, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.signal },
  sheet: { gap: 16, backgroundColor: colors.panelBg, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 18, padding: 24 },
  back: { fontSize: 11, letterSpacing: 1.2, color: colors.signal },
  title: { fontSize: 30, lineHeight: 32, color: colors.mint },
  workingBox: { gap: 8 },
  workingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ask: { borderWidth: 1.5, borderColor: colors.signal, borderRadius: 14, padding: 14, gap: 8, backgroundColor: colors.signalSoft },
  askLabel: { fontSize: 10, letterSpacing: 2.2, color: colors.signal },
  askText: { fontSize: 14, lineHeight: 20, color: colors.mint },
  report: { gap: 10 },
  reportLabel: { fontSize: 10.5, letterSpacing: 1.6, color: colors.signal },
  source: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  sourceText: { fontSize: 10.5, color: colors.greenDim },
  how: { gap: 8, backgroundColor: colors.bg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.greenBorderDim },
  step: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.greenBorderDim },
  stepKind: { width: 92, fontSize: 9.5, letterSpacing: 1, color: colors.greenDim, paddingTop: 2 },
  stepText: { fontSize: 12, lineHeight: 17, color: colors.mint },
  stepOut: { fontSize: 11, lineHeight: 16, color: colors.greenDim, marginTop: 2 },
});
