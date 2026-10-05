import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { OverlayShell } from './OverlayShell';
import { Display, Mono } from '../../components/ui';
import { RichText } from '../../components/RichText';
import { DustThinking } from '../../components/dust/DustThinking';
import { colors } from '../../theme';
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
  'Find the three best free online courses for learning Python and compare them',
  'Every morning, check the news for drone delivery regulations in Nigeria and tell me what changed',
  'Write me a one-page brief on solid-state batteries, with sources',
];

/** TASKS: goals WYRD works at on its own. Give it one, watch it work, read what it found, and say
 *  yes or no when it wants to do something with consequences. */
export function TasksOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [tasks, setTasks] = useState<AgentTask[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [goal, setGoal] = useState('');
  const [every, setEvery] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTasks(await api.agentTasks()); } catch (e) { setError(msg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // while anything is working, look again every few seconds; otherwise leave the server alone
  const working = (tasks ?? []).some((t) => t.status === 'queued' || t.status === 'running');
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(id);
  }, [working, load]);

  const create = async () => {
    if (goal.trim().length < 8 || busy) return;
    setBusy(true); setError(null);
    try {
      const t = await api.agentCreate(goal.trim(), every);
      setGoal(''); sfx('send');
      setTasks((cur) => [t, ...(cur ?? [])]);
      setOpen(t.id);
    } catch (e) { setError(msg(e)); }
    finally { setBusy(false); }
  };

  const current = (tasks ?? []).find((t) => t.id === open) ?? null;

  return (
    <OverlayShell visible={visible} title="TASKS" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {current ? (
          <TaskDetail task={current} onBack={() => setOpen(null)} onChanged={(t) => setTasks((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)))} />
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <Mono style={styles.label}>GIVE WYRD A TASK</Mono>
              <Mono style={styles.muted}>It works on it by itself in the background: searching, reading and taking notes, then brings you the result. Anything with consequences waits for your yes.</Mono>
            </View>
            <TextInput
              value={goal}
              onChangeText={setGoal}
              placeholder="e.g. Compare the three cheapest solar inverters available in Lagos, with prices and sources"
              placeholderTextColor={colors.greenBorder}
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
              <Pressable disabled={busy || goal.trim().length < 8} onPress={create} style={({ pressed }) => [styles.go, (busy || goal.trim().length < 8) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
                <Mono style={styles.goText}>{busy ? '…' : 'START'}</Mono>
              </Pressable>
            </View>
            {!goal ? (
              <View style={{ gap: 4 }}>
                {EXAMPLES.map((e) => (
                  <Pressable key={e} onPress={() => { setGoal(e); setEvery(e.startsWith('Every morning') ? 24 : null); }}>
                    <Mono style={styles.example}>↳ {e}</Mono>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {error ? <Mono style={styles.error}>{error}</Mono> : null}

            <Mono style={[styles.label, { marginTop: 8 }]}>YOUR TASKS</Mono>
            {!tasks ? <ActivityIndicator color={colors.signal} /> : tasks.length === 0 ? (
              <Mono style={styles.muted}>Nothing yet. You can also just ask WYRD in Dialogue_link to "look into" something.</Mono>
            ) : tasks.map((t) => (
              <Pressable key={t.id} onPress={() => setOpen(t.id)} style={({ pressed }) => [styles.card, t.unread && styles.cardUnread, pressed && { opacity: 0.8 }]}>
                <View style={styles.cardHead}>
                  <StatusPill status={t.status} />
                  {t.everyHours ? <Mono style={styles.meta}>every {schedule(t.everyHours)}</Mono> : null}
                  {t.unread ? <View style={styles.dot} /> : null}
                </View>
                <Mono style={styles.goal} numberOfLines={2}>{t.goal}</Mono>
                {t.result ? <Mono style={styles.preview} numberOfLines={2}>{t.result}</Mono> : null}
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </OverlayShell>
  );
}

function TaskDetail({ task, onBack, onChanged }: { task: AgentTask; onBack: () => void; onChanged: (t: AgentTask) => void }) {
  const [steps, setSteps] = useState<AgentStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const working = task.status === 'queued' || task.status === 'running';

  return (
    <View style={{ gap: 14 }}>
      <Pressable onPress={onBack} hitSlop={8}><Mono style={styles.back}>‹ ALL TASKS</Mono></Pressable>
      <View style={styles.cardHead}>
        <StatusPill status={task.status} />
        {task.everyHours ? <Mono style={styles.meta}>every {schedule(task.everyHours)} · run {task.runs}</Mono> : null}
      </View>
      <Display style={styles.title}>{task.goal}</Display>

      {working ? (
        <View style={styles.workingRow}>
          <DustThinking width={58} height={20} />
          <Mono style={styles.muted}>{task.status === 'queued' ? 'Starting within a minute…' : `Working · step ${task.stepsUsed} of ${task.maxSteps}`}</Mono>
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
        <View style={styles.result}>
          <Mono style={styles.label}>{task.everyHours ? 'LATEST RESULT' : 'RESULT'}{task.lastRunAt ? ` · ${new Date(task.lastRunAt).toLocaleString()}` : ''}</Mono>
          <RichText text={task.result} />
        </View>
      ) : null}

      <View style={styles.row}>
        {['done', 'failed', 'scheduled', 'cancelled'].includes(task.status) ? (
          <Pressable disabled={busy} onPress={() => act(() => api.agentRunNow(task.id))} style={[styles.ghost, { flex: 1 }]}>
            <Mono style={styles.ghostText}>RUN AGAIN</Mono>
          </Pressable>
        ) : null}
        {task.status !== 'cancelled' && task.status !== 'done' ? (
          <Pressable disabled={busy} onPress={() => act(() => api.agentCancel(task.id))} style={[styles.ghost, { flex: 1 }]}>
            <Mono style={styles.ghostText}>{task.everyHours ? 'STOP ROUTINE' : 'CANCEL'}</Mono>
          </Pressable>
        ) : null}
      </View>
      {error ? <Mono style={styles.error}>{error}</Mono> : null}

      <Mono style={styles.label}>HOW IT WORKED</Mono>
      {!steps ? <ActivityIndicator color={colors.signal} /> : steps.length === 0 ? <Mono style={styles.muted}>No steps yet.</Mono> : (
        <View style={{ gap: 6 }}>
          {steps.map((s) => (
            <View key={s.id} style={styles.step}>
              <Mono style={[styles.stepKind, (s.kind === 'ask' || s.kind === 'result') && { color: colors.signal }, s.kind === 'error' && { color: colors.danger }]}>
                {s.kind.toUpperCase()}
              </Mono>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Mono style={styles.stepText}>{s.detail}</Mono>
                {s.output && s.kind !== 'result' ? <Mono style={styles.stepOut} numberOfLines={3}>{s.output}</Mono> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const live = status === 'running' || status === 'queued' || status === 'waiting_approval';
  return (
    <View style={[styles.pill, live && styles.pillLive, status === 'failed' && { borderColor: colors.danger }]}>
      <Mono style={[styles.pillText, live && { color: colors.onSignal }, status === 'failed' && { color: colors.danger }]}>{STATUS[status] ?? status.toUpperCase()}</Mono>
    </View>
  );
}

const schedule = (h: number) => (h === 1 ? 'hour' : h === 24 ? 'day' : h === 168 ? 'week' : `${h} h`);
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  label: { fontSize: 10, letterSpacing: 2.4, color: colors.greenDim },
  muted: { fontSize: 12, lineHeight: 18, color: colors.greenDim },
  input: {
    minHeight: 84, borderWidth: 1, borderColor: colors.greenBorderDim, padding: 12, fontSize: 14, lineHeight: 20,
    color: colors.mint, fontFamily: 'ShareTechMono_400Regular', backgroundColor: '#fff', outlineStyle: 'none',
  } as object,
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  chipText: { fontSize: 10, letterSpacing: 1.6, color: colors.greenDim },
  chipTextOn: { color: colors.onSignal },
  go: { backgroundColor: colors.signal, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  goText: { fontSize: 11, letterSpacing: 2, color: colors.onSignal },
  ghost: { borderWidth: 1, borderColor: colors.mint, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  ghostText: { fontSize: 11, letterSpacing: 2, color: colors.mint },
  example: { fontSize: 11.5, lineHeight: 17, color: colors.signal },
  error: { fontSize: 12, color: colors.danger },
  card: { borderWidth: 1, borderColor: colors.greenBorderDim, padding: 12, gap: 6, backgroundColor: '#fff' },
  cardUnread: { borderColor: colors.signal },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 10.5, color: colors.greenDim },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal, marginLeft: 'auto' },
  goal: { fontSize: 13.5, lineHeight: 19, color: colors.mint },
  preview: { fontSize: 11.5, lineHeight: 17, color: colors.greenDim },
  pill: { borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 7, paddingVertical: 2 },
  pillLive: { backgroundColor: colors.signal, borderColor: colors.signal },
  pillText: { fontSize: 9.5, letterSpacing: 1.6, color: colors.greenDim },
  back: { fontSize: 11, letterSpacing: 2, color: colors.greenDim },
  title: { fontSize: 24, lineHeight: 28, color: colors.mint },
  workingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ask: { borderWidth: 1.5, borderColor: colors.signal, padding: 14, gap: 8, backgroundColor: colors.signalSoft },
  askLabel: { fontSize: 10, letterSpacing: 2.2, color: colors.signal },
  askText: { fontSize: 14, lineHeight: 20, color: colors.mint },
  result: { borderLeftWidth: 2, borderLeftColor: colors.signal, paddingLeft: 12, gap: 8 },
  step: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.greenBorderDim },
  stepKind: { width: 70, fontSize: 9.5, letterSpacing: 1.4, color: colors.greenDim, paddingTop: 2 },
  stepText: { fontSize: 12, lineHeight: 17, color: colors.mint },
  stepOut: { fontSize: 11, lineHeight: 16, color: colors.greenDim, marginTop: 2 },
});
