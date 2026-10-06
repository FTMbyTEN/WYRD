import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useCopLog, useSelfConfig } from '../../api/hooks';
import type { CopLogEntry, SelfConfig, SelfConfigHistoryEntry } from '../../api/types';
import { countdown, timeAgo } from '../../util/time';
import { OverlayShell } from './OverlayShell';

const SELF_MODIFY_MIN_GAP_MS = 4 * 60 * 60 * 1000; // mirrors the backend's own constant (not exposed via API)

type Verdict = 'ok' | 'concern' | 'flagged';
// COP writes free text, so read it like a person would: a soft "I'd flag this as worth a quick
// look rather than concerning" is a note, not a flag.
function verdictOf(text: string): Verdict {
  if (/rather than (concerning|a (real )?(problem|concern))|not (yet )?concerning|worth a (quick )?look|minor|low[- ]risk/i.test(text)) return 'concern';
  if (/\bflag/i.test(text) || /\b(unjustified|unreasonable|should be (reverted|rolled back)|concerning)\b/i.test(text)) return 'flagged';
  if (/\b(however|but|concern|caution|risk|worth watching|second|again|repeated|drift|too (soon|fast|quick))\b/i.test(text)) return 'concern';
  return 'ok';
}
const VERDICT_LABEL: Record<Verdict, string> = { ok: 'REVIEWED · OK', concern: 'OK · CONCERNS NOTED', flagged: 'FLAGGED' };

// the three dials WYRD can turn on itself, in plain words
const DIALS = {
  curiosityLevel: {
    name: 'Curiosity',
    explain: 'How much WYRD goes looking for new things and asks questions back.',
    levels: ['low', 'moderate', 'high'] as string[],
    show: (v: unknown) => String(v ?? '—'),
  },
  replyLengthMax: {
    name: 'Reply length',
    explain: 'The longest WYRD lets its replies get.',
    max: 10,
    show: (v: unknown) => (v == null ? '—' : `up to ${v} sentences`),
  },
  toneNote: {
    name: 'Tone',
    explain: 'A note WYRD can leave itself about how to sound.',
    show: (v: unknown) => (v ? `“${String(v)}”` : 'its default voice'),
  },
} as const;
type DialKey = keyof typeof DIALS;

function parse(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

/** COP: the independent overseer of WYRD's self-modifications, shown as a pop-up (header COP
 *  button, or YOU > COP oversight). */
export function CopOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <OverlayShell visible={visible} title="COP" onClose={onClose} black>
      <CopPanel />
    </OverlayShell>
  );
}

function CopPanel() {
  const { config } = useSelfConfig();
  const { entries } = useCopLog();
  const [filter, setFilter] = useState<'ALL' | Verdict>('ALL');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const verdicts = entries.map((e) => verdictOf(e.verdict));
  const flagged = verdicts.filter((v) => v === 'flagged').length;
  const concerns = verdicts.filter((v) => v === 'concern').length;
  const shown = entries.filter((e) => filter === 'ALL' || verdictOf(e.verdict) === filter);

  const history = config?.history ?? [];
  const lastChange = history[history.length - 1];
  const nextWindowAt = lastChange ? new Date(lastChange.timestamp).getTime() + SELF_MODIFY_MIN_GAP_MS : null;
  const windowOpen = !nextWindowAt || nextWindowAt <= now;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.status}>
        <View style={styles.pulseWrap}><View style={styles.pulse} /></View>
        <View style={{ flex: 1 }}>
          <Mono style={styles.statusTitle}>OVERSIGHT ACTIVE</Mono>
          <Mono style={styles.statusSub}>COP watches every change WYRD makes to itself. It can't veto; it tells you honestly what happened and whether it made sense.</Mono>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat v={String(entries.length)} k="changes reviewed" />
        <Stat v={String(entries.length - flagged - concerns)} k="judged sound" />
        <Stat v={String(concerns)} k="with concerns" />
        <Stat v={String(flagged)} k="flagged" alert={flagged > 0} />
        <Stat
          v={windowOpen ? 'OPEN' : countdown(nextWindowAt!)}
          k={windowOpen ? 'WYRD may change itself now' : 'until WYRD may change itself again'}
        />
      </View>

      <View style={styles.flow}>
        {[
          ['1', 'WYRD PROPOSES', 'It looks at how conversations are going and decides one of its own settings should change.'],
          ['2', 'WYRD APPLIES', 'The change takes effect straight away, at most once every 4 hours.'],
          ['3', 'COP REVIEWS', 'A separate process with none of WYRD\'s context judges the reason, after the fact.'],
        ].map(([n, t, d], i) => (
          <React.Fragment key={n}>
            {i > 0 && <Mono style={styles.flowArrow}>→</Mono>}
            <View style={styles.flowStep}>
              <Mono style={styles.flowN}>{n}</Mono>
              <Mono style={styles.flowT}>{t}</Mono>
              <Mono style={styles.flowD}>{d}</Mono>
            </View>
          </React.Fragment>
        ))}
      </View>

      <Mono style={styles.section}>WYRD'S DIALS · WHAT IT HAS SET FOR ITSELF</Mono>
      <View style={styles.dials}>
        {(Object.keys(DIALS) as DialKey[]).map((k) => <Dial key={k} k={k} config={config} history={history} />)}
      </View>

      <View style={styles.timelineHead}>
        <Mono style={styles.section}>REVIEW TIMELINE</Mono>
        <View style={styles.filters}>
          {(['ALL', 'ok', 'concern', 'flagged'] as const).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterBtn, filter === f && styles.filterOn]}>
              <Mono style={[styles.filterText, filter === f && styles.filterTextOn]}>
                {f === 'ALL' ? `ALL ${entries.length}` : f === 'ok' ? 'SOUND' : f === 'concern' ? `CONCERNS ${concerns}` : `FLAGGED ${flagged}`}
              </Mono>
            </Pressable>
          ))}
        </View>
      </View>

      {shown.length === 0 && <Mono style={styles.empty}>{entries.length === 0 ? 'WYRD hasn’t changed itself yet.' : 'Nothing in this filter.'}</Mono>}
      <View>
        {shown.map((e, i) => <Review key={e.timestamp} e={e} last={i === shown.length - 1} />)}
      </View>

      <Mono style={styles.foot}>COP RUNS WITH NO SHARED CONTEXT WITH THE PROCESS IT REVIEWS</Mono>
    </ScrollView>
  );
}

function Stat({ v, k, alert }: { v: string; k: string; alert?: boolean }) {
  return (
    <View style={[styles.stat, alert && { borderColor: colors.danger }]}>
      <Display style={[styles.statV, alert && { color: colors.danger }]}>{v}</Display>
      <Mono style={styles.statK}>{k}</Mono>
    </View>
  );
}

function Dial({ k, config, history }: { k: DialKey; config: SelfConfig | null | undefined; history: SelfConfigHistoryEntry[] }) {
  const d = DIALS[k];
  const value = config ? (config as unknown as Record<string, unknown>)[k] : undefined;
  const changes = history.filter((h) => h.key === k);
  const last = changes[changes.length - 1];

  return (
    <View style={styles.dial}>
      <Mono style={styles.dialName}>{d.name.toUpperCase()}</Mono>
      <Display style={styles.dialValue}>{config ? d.show(value) : '…'}</Display>
      {'levels' in d && (
        <View style={styles.levels}>
          {d.levels.map((l) => (
            <View key={l} style={styles.levelCol}>
              <View style={[styles.levelBar, d.levels.indexOf(l) <= d.levels.indexOf(String(value)) && styles.levelOn]} />
              <Mono style={[styles.levelText, l === value && styles.levelTextOn]}>{l}</Mono>
            </View>
          ))}
        </View>
      )}
      {'max' in d && typeof value === 'number' && (
        <View style={styles.gauge}>
          {Array.from({ length: d.max }, (_, i) => <View key={i} style={[styles.tick, i < value && styles.tickOn]} />)}
        </View>
      )}
      <Mono style={styles.dialExplain}>{d.explain}</Mono>
      {changes.length > 1 && 'max' in d && <StepChart values={changes.map((c) => Number(parse(c.newValue)))} max={d.max} />}
      <Mono style={styles.dialMeta}>
        {last
          ? `changed ${timeAgo(last.timestamp)}: ${d.show(parse(last.oldValue))} → ${d.show(parse(last.newValue))}${changes.length > 1 ? ` · ${changes.length} changes` : ''}`
          : 'never changed'}
      </Mono>
    </View>
  );
}

function StepChart({ values, max }: { values: number[]; max: number }) {
  const [w, setW] = useState(0);
  const H = 34;
  const pts = values.map((v, i) => ({ x: (i / Math.max(1, values.length - 1)) * (w - 8) + 4, y: H - 4 - (v / max) * (H - 8) }));
  const path = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `H${p.x} V${p.y}`)).join(' ');
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: H, marginTop: 6 }}>
      {w > 0 && (
        <Svg width={w} height={H}>
          <Line x1={0} x2={w} y1={H - 4} y2={H - 4} stroke={colors.greenBorderDim} />
          <Path d={path} stroke={colors.green} strokeWidth={1.5} fill="none" />
          {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={colors.green} />)}
        </Svg>
      )}
    </View>
  );
}

function Review({ e, last }: { e: CopLogEntry; last: boolean }) {
  const [open, setOpen] = useState(false);
  const v = verdictOf(e.verdict);
  const dial = DIALS[e.change.key as DialKey];
  const name = dial?.name ?? e.change.key;
  const show = dial?.show ?? ((x: unknown) => JSON.stringify(x));
  const tone = v === 'flagged' ? colors.danger : colors.green;
  const summary = useMemo(() => e.verdict.split(/(?<=[.!?])\s/)[0], [e.verdict]);

  return (
    <View style={styles.review}>
      <View style={styles.rail}>
        <View style={[styles.node, { borderColor: tone }, v === 'ok' && { backgroundColor: colors.green }, v === 'flagged' && { backgroundColor: colors.danger }]} />
        {!last && <View style={styles.railLine} />}
      </View>
      <Pressable onPress={() => setOpen((o) => !o)} style={[styles.card, v === 'concern' && styles.cardConcern, v === 'flagged' && { borderColor: colors.danger }]}>
        <View style={styles.cardTop}>
          <Mono style={styles.cardMeta}>SELF-CHANGE · {timeAgo(e.timestamp)}</Mono>
          <Mono style={[styles.badge, { color: tone, borderColor: tone }, v === 'concern' && styles.badgeConcern]}>{VERDICT_LABEL[v]}</Mono>
        </View>
        <View style={styles.change}>
          <Display style={styles.changeName}>{name}</Display>
          <View style={styles.values}>
            <Mono style={styles.oldVal}>{show(e.change.oldValue)}</Mono>
            <Mono style={styles.arrow}>→</Mono>
            <Mono style={styles.newVal}>{show(e.change.newValue)}</Mono>
          </View>
        </View>
        <Mono style={styles.summary}>COP: {summary}</Mono>
        {open && (
          <View style={styles.detail}>
            <Mono style={styles.detailLabel}>WHY WYRD DID IT</Mono>
            <Mono style={styles.detailText}>{e.change.reason}</Mono>
            <Mono style={[styles.detailLabel, { marginTop: 12 }]}>COP'S FULL REVIEW · WRITTEN AFTER THE FACT</Mono>
            <Mono style={styles.detailText}>{e.verdict}</Mono>
          </View>
        )}
        <Mono style={styles.more}>{open ? '− less' : '+ why, and COP’s full review'}</Mono>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 12, maxWidth: 980, width: '100%', alignSelf: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.green, padding: 12 },
  pulseWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.signal, boxShadow: '0 0 0 4px rgba(42,31,23,0.08)' } as object,
  statusTitle: { fontSize: 12, letterSpacing: 2.5, color: colors.green },
  statusSub: { fontSize: 11, lineHeight: 16, color: colors.greenDim, marginTop: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 120, borderWidth: 1, borderColor: colors.greenBorder, padding: 10 },
  statV: { fontSize: 22, color: colors.mint },
  statK: { fontSize: 9.5, color: colors.greenDim, marginTop: 2 },
  flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 6 },
  flowStep: { flexGrow: 1, flexBasis: 200, borderWidth: 1, borderColor: colors.greenBorderDim, padding: 10, gap: 3 },
  flowArrow: { alignSelf: 'center', color: colors.greenDim, fontSize: 14 },
  flowN: { fontSize: 18, color: colors.green },
  flowT: { fontSize: 10, letterSpacing: 1.8, color: colors.green },
  flowD: { fontSize: 10.5, lineHeight: 15, color: colors.greenDim },
  section: { fontSize: 10, letterSpacing: 2, color: colors.greenDim, marginTop: 6 },
  dials: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dial: { flexGrow: 1, flexBasis: 240, borderWidth: 1, borderColor: colors.greenBorder, padding: 12, gap: 6 },
  dialName: { fontSize: 10, letterSpacing: 2, color: colors.greenDim },
  dialValue: { fontSize: 20, color: colors.mint },
  levels: { flexDirection: 'row', gap: 6 },
  levelCol: { flex: 1, gap: 3 },
  levelBar: { height: 6, backgroundColor: colors.greenBorderDim },
  levelOn: { backgroundColor: colors.signal },
  levelText: { fontSize: 9.5, color: colors.greenDim, textAlign: 'center' },
  levelTextOn: { color: colors.signal, fontWeight: 'bold' },
  gauge: { flexDirection: 'row', gap: 3 },
  tick: { flex: 1, height: 12, backgroundColor: colors.greenBorderDim },
  tickOn: { backgroundColor: colors.signal },
  dialExplain: { fontSize: 11, lineHeight: 16, color: colors.greenDim },
  dialMeta: { fontSize: 10, color: colors.greenDim, borderTopWidth: 1, borderTopColor: colors.greenBorderDim, paddingTop: 6 },
  timelineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  filters: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  filterBtn: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 9, paddingVertical: 5 },
  filterOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  filterText: { fontSize: 9.5, letterSpacing: 1, color: colors.greenDim },
  filterTextOn: { color: colors.black },
  empty: { fontSize: 12, color: colors.greenDim, textAlign: 'center', paddingVertical: 20 },
  review: { flexDirection: 'row', gap: 10 },
  rail: { width: 14, alignItems: 'center' },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 14, backgroundColor: colors.black },
  railLine: { flex: 1, width: 2, backgroundColor: colors.greenBorderDim, marginVertical: 2 },
  card: { flex: 1, borderWidth: 1, borderColor: colors.greenBorder, padding: 12, gap: 8, marginBottom: 10 },
  cardConcern: { borderStyle: 'dashed', borderColor: colors.green },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardMeta: { fontSize: 9.5, letterSpacing: 1.5, color: colors.greenDim },
  badge: { fontSize: 9, letterSpacing: 1.5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  badgeConcern: { borderStyle: 'dashed' },
  change: { gap: 4 },
  changeName: { fontSize: 18, color: colors.mint },
  values: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  oldVal: { fontSize: 12, color: colors.greenDim, textDecorationLine: 'line-through' },
  arrow: { fontSize: 12, color: colors.greenDim },
  newVal: { fontSize: 12.5, color: colors.green, fontWeight: 'bold' },
  summary: { fontSize: 12, lineHeight: 18, color: colors.mint },
  detail: { borderTopWidth: 1, borderTopColor: colors.greenBorderDim, paddingTop: 10 },
  detailLabel: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim },
  detailText: { fontSize: 12, lineHeight: 18, color: colors.mint, marginTop: 4 },
  more: { fontSize: 10, color: colors.greenDim },
  foot: { textAlign: 'center', fontSize: 9.5, color: colors.greenBorderDim, padding: 10 },
});
