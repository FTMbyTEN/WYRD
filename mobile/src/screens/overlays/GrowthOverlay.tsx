import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { OverlayShell } from './OverlayShell';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import type { GrowthRange, GrowthSnapshot } from '../../api/types';

const RANGES: { key: GrowthRange; label: string; phrase: string }[] = [
  { key: 'day', label: '24 HOURS', phrase: 'In the last 24 hours' },
  { key: 'week', label: '7 DAYS', phrase: 'Over the last 7 days' },
  { key: 'month', label: '30 DAYS', phrase: 'Over the last 30 days' },
  { key: 'all', label: 'ALL TIME', phrase: 'Since tracking began' },
];

type Metric = {
  key: 'vocabCount' | 'blockCount' | 'digestPercent' | 'curiosity' | 'confidence';
  title: string;
  explain: string;
  format: (v: number) => string;
  delta: (d: number) => string;
  level?: (v: number) => string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number) => Math.round(v).toLocaleString();
const signed = (v: number, f: (x: number) => string) => (v > 0 ? `+${f(v)}` : v < 0 ? `−${f(-v)}` : 'no change');

const METRICS: Metric[] = [
  {
    key: 'vocabCount',
    title: 'Words understood',
    explain: 'Words WYRD has looked up in a dictionary and now knows the meaning of.',
    format: n,
    delta: (d) => signed(d, n),
  },
  {
    key: 'blockCount',
    title: 'Memories',
    explain: 'Everything it has read, been told or worked out for itself, kept for later.',
    format: n,
    delta: (d) => signed(d, n),
  },
  {
    key: 'digestPercent',
    title: 'Topics thought through',
    explain: 'Of all the topics it has come across, the share it has actually reasoned its way to an answer on.',
    format: (v) => `${Math.round(v)}%`,
    delta: (d) => signed(d, (x) => `${Math.round(x)} pts`),
  },
  {
    key: 'curiosity',
    title: 'Curiosity',
    explain: 'How eager it is right now to go looking for new things. It rises when it meets something unfamiliar.',
    format: pct,
    delta: (d) => signed(d * 100, (x) => `${Math.round(x)} pts`),
    level: (v) => (v >= 0.66 ? 'very curious' : v >= 0.33 ? 'curious' : 'settled'),
  },
  {
    key: 'confidence',
    title: 'Confidence',
    explain: 'How sure it feels about what it knows. It grows as answers hold up and connections form.',
    format: pct,
    delta: (d) => signed(d * 100, (x) => `${Math.round(x)} pts`),
    level: (v) => (v >= 0.66 ? 'confident' : v >= 0.33 ? 'fairly sure' : 'unsure'),
  },
];

/** GROWTH: how WYRD's mind has changed over a chosen span, in plain words and labelled charts. */
export function GrowthOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [range, setRange] = useState<GrowthRange>('day');
  const [data, setData] = useState<GrowthSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const load = () => api.growthHistory(range)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch(() => { if (alive) setError('could not load growth history'); });
    setData(null);
    load();
    const t = setInterval(load, 120000);
    return () => { alive = false; clearInterval(t); };
  }, [visible, range]);

  const phrase = RANGES.find((r) => r.key === range)!.phrase;
  const summary = useMemo(() => (data && data.length > 1 ? summarize(data, phrase) : null), [data, phrase]);

  return (
    <OverlayShell visible={visible} title="GROWTH" onClose={onClose} black>
      <ScrollView contentContainerStyle={styles.page}>
        <Mono style={styles.intro}>How WYRD's mind is changing: what it has learned, and how it feels about it.</Mono>

        <View style={styles.tabs}>
          {RANGES.map((r) => (
            <Pressable key={r.key} onPress={() => setRange(r.key)} style={[styles.tab, range === r.key && styles.tabOn]}>
              <Mono style={[styles.tabText, range === r.key && styles.tabTextOn]}>{r.label}</Mono>
            </Pressable>
          ))}
        </View>

        {!data && !error && <ActivityIndicator color={colors.green} style={{ marginTop: 30 }} />}
        {!!error && <Mono style={styles.empty}>{error}</Mono>}
        {data && data.length < 2 && <Mono style={styles.empty}>Not enough history for this span yet. WYRD records a snapshot every 30 minutes.</Mono>}

        {summary && (
          <View style={styles.summary}>
            <Mono style={styles.summaryLabel}>WHAT CHANGED</Mono>
            <Display style={styles.summaryText}>{summary}</Display>
          </View>
        )}

        {data && data.length > 1 && (
          <View style={styles.grid}>
            {METRICS.map((m) => <MetricCard key={m.key} metric={m} data={data} />)}
          </View>
        )}

        {data && data.length > 1 && (
          <Mono style={styles.foot}>
            {data.length} points from {when(data[0].timestamp)} to {when(data[data.length - 1].timestamp)}, averaged so long spans stay readable. History starts from when tracking was added.
          </Mono>
        )}
      </ScrollView>
    </OverlayShell>
  );
}

function MetricCard({ metric, data }: { metric: Metric; data: GrowthSnapshot[] }) {
  const values = data.map((d) => d[metric.key] as number);
  const now = values[values.length - 1];
  const change = now - values[0];
  const up = change > 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Mono style={styles.cardTitle}>{metric.title.toUpperCase()}</Mono>
        <Mono style={[styles.delta, up ? styles.deltaUp : change < 0 ? styles.deltaDown : null]}>
          {change === 0 ? 'no change' : `${up ? '▲' : '▼'} ${metric.delta(change)}`}
        </Mono>
      </View>
      <View style={styles.valueRow}>
        <Display style={styles.value}>{metric.format(now)}</Display>
        {metric.level && <Mono style={styles.level}>{metric.level(now)}</Mono>}
      </View>
      <Mono style={styles.explain}>{metric.explain}</Mono>
      <Chart values={values} times={data.map((d) => d.timestamp)} format={metric.format} />
    </View>
  );
}

function Chart({ values, times, format }: { values: number[]; times: string[]; format: (v: number) => string }) {
  const [w, setW] = useState(0);
  const H = 96, padL = 4, padR = 4, padT = 14, padB = 16;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const lo = min - span * 0.1, hi = max + span * 0.1;
  const x = (i: number) => padL + (i / Math.max(1, values.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const iMax = values.indexOf(max), iMin = values.indexOf(min);
  const last = values.length - 1;
  const hiLabel = `high ${format(max)}`, loLabel = `low ${format(min)}`;
  // keep a label fully inside the chart: ~5.4px per character at this size
  const lx = (px: number, label: string) => { const half = label.length * 2.7 + 3; return Math.min(Math.max(px, half), w - half); };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: H, marginTop: 10 }}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {[0.25, 0.5, 0.75].map((f) => (
            <Line key={f} x1={padL} x2={w - padR} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke={colors.greenBorderDim} strokeWidth={1} strokeDasharray="2 4" />
          ))}
          <Path d={area} fill={colors.green} opacity={0.06} />
          <Path d={line} stroke={colors.green} strokeWidth={1.8} fill="none" />
          {max !== min && (
            <>
              <Circle cx={x(iMax)} cy={y(max)} r={2.5} fill={colors.green} />
              <SvgText x={lx(x(iMax), hiLabel)} y={y(max) - 5} fontSize={9} fill={colors.greenDim} textAnchor="middle" fontFamily="ShareTechMono_400Regular">
                {hiLabel}
              </SvgText>
              {iMin !== last && Math.abs(x(iMin) - x(iMax)) > loLabel.length * 6 && (
                <SvgText x={lx(x(iMin), loLabel)} y={y(min) - 5} fontSize={9} fill={colors.greenDim} textAnchor="middle" fontFamily="ShareTechMono_400Regular">
                  {loLabel}
                </SvgText>
              )}
            </>
          )}
          <Circle cx={x(last)} cy={y(values[last])} r={3.5} fill={colors.black} stroke={colors.green} strokeWidth={1.6} />
          <Rect x={padL} y={H - padB} width={w - padL - padR} height={1} fill={colors.greenBorder} />
          <SvgText x={padL} y={H - 3} fontSize={9} fill={colors.greenDim} fontFamily="ShareTechMono_400Regular">{when(times[0])}</SvgText>
          <SvgText x={w - padR} y={H - 3} fontSize={9} fill={colors.greenDim} textAnchor="end" fontFamily="ShareTechMono_400Regular">now</SvgText>
        </Svg>
      )}
    </View>
  );
}

function summarize(d: GrowthSnapshot[], phrase: string): string {
  const a = d[0], b = d[d.length - 1];
  const words = b.vocabCount - a.vocabCount;
  const mems = b.blockCount - a.blockCount;
  const parts: string[] = [];
  parts.push(words > 0 ? `learned ${words.toLocaleString()} new word${words === 1 ? '' : 's'}` : 'learned no new words');
  if (mems > 0) parts.push(`stored ${mems.toLocaleString()} new memories`);
  let s = `${phrase}, WYRD ${parts.join(' and ')}.`;
  const feel: string[] = [];
  const dc = b.confidence - a.confidence, dq = b.curiosity - a.curiosity;
  if (Math.abs(dc) >= 0.05) feel.push(dc > 0 ? 'more confident' : 'less confident');
  if (Math.abs(dq) >= 0.05) feel.push(dq > 0 ? 'more curious' : 'less curious');
  if (feel.length) s += ` It has grown ${feel.join(' and ')}.`;
  const dd = b.digestPercent - a.digestPercent;
  if (Math.abs(dd) >= 1) s += ` It has thought through ${dd > 0 ? 'more' : 'fewer'} of its topics (${Math.round(b.digestPercent)}% now).`;
  return s;
}

function when(iso: string): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 14, maxWidth: 980, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 12, lineHeight: 18, color: colors.greenDim },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.green, alignSelf: 'flex-start' },
  tab: { paddingHorizontal: 12, paddingVertical: 7 },
  tabOn: { backgroundColor: colors.green },
  tabText: { fontSize: 10, letterSpacing: 1.5, color: colors.green },
  tabTextOn: { color: colors.black },
  empty: { fontSize: 12, lineHeight: 18, color: colors.greenDim, marginTop: 10 },
  summary: { borderLeftWidth: 3, borderLeftColor: colors.green, paddingLeft: 12, paddingVertical: 4, gap: 4 },
  summaryLabel: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  summaryText: { fontSize: 17, lineHeight: 25, color: colors.mint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: 280, borderWidth: 1, borderColor: colors.greenBorder, padding: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 10, letterSpacing: 1.8, color: colors.greenDim },
  delta: { fontSize: 10.5, color: colors.greenDim },
  deltaUp: { color: colors.green },
  deltaDown: { color: colors.greenDim },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 },
  value: { fontSize: 30, color: colors.mint },
  level: { fontSize: 11, color: colors.greenDim },
  explain: { fontSize: 11, lineHeight: 16, color: colors.greenDim, marginTop: 4 },
  foot: { fontSize: 10, lineHeight: 15, color: colors.greenBorder },
});
