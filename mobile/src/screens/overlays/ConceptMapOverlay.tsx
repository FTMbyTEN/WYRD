import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { OverlayShell } from './OverlayShell';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import { useConcepts } from '../../api/hooks';
import type { ConceptDetail, ConceptsGraph } from '../../api/types';
import { timeAgo } from '../../util/time';

const SOURCE_LABEL: Record<string, string> = {
  wikipedia: 'WIKIPEDIA', hackernews: 'HACKER NEWS', web: 'THE WEB', self: 'ITS OWN THINKING', synthesis: 'A CONNECTION IT MADE',
};

/** CONCEPT_MAP: the ideas WYRD keeps meeting, which ones travel together, and -- for any one of
 *  them -- what it means, what it's linked to, and the real things WYRD read it in. */
export function ConceptMapOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { graph } = useConcepts();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let alive = true;
    setLoadingDetail(true);
    api.conceptDetail(selected)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setLoadingDetail(false); });
    return () => { alive = false; };
  }, [selected]);

  // pick the strongest idea by default so the panel never opens empty
  useEffect(() => {
    if (visible && !selected && graph?.nodes.length) setSelected(graph.nodes[0].id);
  }, [visible, graph, selected]);

  const nodes = graph?.nodes ?? [];
  const maxCount = Math.max(1, ...nodes.map((x) => x.count));
  const filtered = query.trim() ? nodes.filter((x) => x.id.includes(query.trim().toLowerCase())) : nodes;

  return (
    <OverlayShell visible={visible} title="CONCEPT_MAP" onClose={onClose} black>
      <ScrollView contentContainerStyle={styles.page}>
        <Mono style={styles.intro}>
          The ideas WYRD keeps running into in what it reads and thinks about, and which ones tend to turn up together. Tap any idea to see what it is and where WYRD met it.
        </Mono>
        <View style={styles.legend}>
          <Legend icon="big" text="bigger circle = met more often" />
          <Legend icon="line" text="line = often appear together" />
          <Legend icon="thick" text="thicker line = stronger link" />
        </View>

        {!graph && <ActivityIndicator color={colors.green} style={{ marginTop: 30 }} />}
        {graph && nodes.length === 0 && <Mono style={styles.intro}>No ideas yet: WYRD hasn't read enough to connect anything.</Mono>}

        {graph && nodes.length > 0 && (
          <View style={styles.columns}>
            <View style={styles.graphCol}>
              <Graph graph={graph} selected={selected} onSelect={setSelected} />
            </View>
            <View style={styles.detailCol}>
              <DetailCard detail={detail} loading={loadingDetail} selected={selected} onSelect={setSelected} />
            </View>
          </View>
        )}

        {nodes.length > 0 && (
          <View style={styles.listBox}>
            <View style={styles.listHead}>
              <Mono style={styles.sectionLabel}>ALL IDEAS, MOST MET FIRST</Mono>
              <TextInput value={query} onChangeText={setQuery} placeholder="find an idea" placeholderTextColor={colors.greenBorder} style={styles.search} />
            </View>
            {filtered.map((x, i) => (
              <Pressable key={x.id} onPress={() => setSelected(x.id)} style={[styles.listRow, selected === x.id && styles.listRowOn]}>
                <Mono style={styles.rank}>{String(nodes.indexOf(x) + 1).padStart(2, '0')}</Mono>
                <Mono style={styles.listName} numberOfLines={1}>{x.id}</Mono>
                <View style={styles.barTrack}><View style={[styles.bar, { width: `${(x.count / maxCount) * 100}%` }]} /></View>
                <Mono style={styles.listCount}>{x.count.toLocaleString()}</Mono>
              </Pressable>
            ))}
            {filtered.length === 0 && <Mono style={styles.intro}>No idea matches “{query}”.</Mono>}
          </View>
        )}
      </ScrollView>
    </OverlayShell>
  );
}

function Legend({ icon, text }: { icon: 'big' | 'line' | 'thick'; text: string }) {
  return (
    <View style={styles.legendItem}>
      <Svg width={22} height={12}>
        {icon === 'big' && <><Circle cx={4} cy={6} r={2.5} fill={colors.black} stroke={colors.green} /><Circle cx={15} cy={6} r={5} fill={colors.black} stroke={colors.green} /></>}
        {icon === 'line' && <Line x1={1} y1={6} x2={21} y2={6} stroke={colors.greenDim} strokeWidth={1} />}
        {icon === 'thick' && <Line x1={1} y1={6} x2={21} y2={6} stroke={colors.greenDim} strokeWidth={3} />}
      </Svg>
      <Mono style={styles.legendText}>{text}</Mono>
    </View>
  );
}

// ---- network drawing: a small force layout, computed once per graph ----

type P = { id: string; count: number; x: number; y: number };

function layout(graph: ConceptsGraph): P[] {
  // Fruchterman-Reingold in the unit square, with a pull toward the centre so unlinked ideas
  // and separate clusters sit around the middle instead of being flung into the corners.
  const N = graph.nodes.length;
  const idx = new Map(graph.nodes.map((x, i) => [x.id, i]));
  const pts: P[] = graph.nodes.map((x, i) => {
    const a = i * 2.39996; // golden angle: spread-out, deterministic start
    const r = 0.05 + 0.3 * Math.sqrt(i / Math.max(1, N));
    return { ...x, x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) };
  });
  const k = 0.9 * Math.sqrt(1 / Math.max(1, N));
  const maxW = Math.max(1, ...graph.edges.map((e) => e.weight));
  const ITER = 320;
  for (let it = 0; it < ITER; it++) {
    const temp = 0.08 * (1 - it / ITER) + 0.002;
    const dx = new Array(N).fill(0), dy = new Array(N).fill(0);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const vx = pts[i].x - pts[j].x, vy = pts[i].y - pts[j].y;
      const d = Math.max(Math.hypot(vx, vy), 0.01);
      const f = (k * k) / d;
      dx[i] += (vx / d) * f; dy[i] += (vy / d) * f; dx[j] -= (vx / d) * f; dy[j] -= (vy / d) * f;
    }
    for (const e of graph.edges) {
      const i = idx.get(e.a), j = idx.get(e.b);
      if (i == null || j == null) continue;
      const vx = pts[i].x - pts[j].x, vy = pts[i].y - pts[j].y;
      const d = Math.max(Math.hypot(vx, vy), 0.01);
      const f = ((d * d) / k) * (0.4 + 0.6 * (e.weight / maxW));
      dx[i] -= (vx / d) * f; dy[i] -= (vy / d) * f; dx[j] += (vx / d) * f; dy[j] += (vy / d) * f;
    }
    for (let i = 0; i < N; i++) {
      dx[i] += (0.5 - pts[i].x) * 4; dy[i] += (0.5 - pts[i].y) * 4; // gravity
      const m = Math.hypot(dx[i], dy[i]) || 1;
      const step = Math.min(m, temp);
      pts[i].x = Math.min(0.93, Math.max(0.07, pts[i].x + (dx[i] / m) * step));
      pts[i].y = Math.min(0.93, Math.max(0.07, pts[i].y + (dy[i] / m) * step));
    }
  }
  // centre the result and scale it to fill the canvas evenly (same factor both ways, so
  // clusters keep their shape and their distance from each other)
  const cx = pts.reduce((t, p) => t + p.x, 0) / N, cy = pts.reduce((t, p) => t + p.y, 0) / N;
  const reach = Math.max(1e-6, ...pts.map((p) => Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy))));
  for (const p of pts) { p.x = 0.5 + ((p.x - cx) / reach) * 0.42; p.y = 0.5 + ((p.y - cy) / reach) * 0.42; }
  return pts;
}

function Graph({ graph, selected, onSelect }: { graph: ConceptsGraph; selected: string | null; onSelect: (id: string) => void }) {
  const [w, setW] = useState(0);
  const H = Math.max(360, Math.min(560, w * 0.85));
  const pts = useMemo(() => layout(graph), [graph]);
  const byId = useMemo(() => new Map(pts.map((p) => [p.id, p])), [pts]);
  const maxCount = Math.max(1, ...graph.nodes.map((x) => x.count));
  const maxW = Math.max(1, ...graph.edges.map((e) => e.weight));
  const neighbours = useMemo(() => {
    const s = new Set<string>();
    for (const e of graph.edges) { if (e.a === selected) s.add(e.b); if (e.b === selected) s.add(e.a); }
    return s;
  }, [graph, selected]);
  const minCount = Math.min(...graph.nodes.map((x) => x.count));
  // size by standing among these ideas, so the difference between them is visible
  const r = (c: number) => 5 + 15 * Math.pow((c - minCount) / Math.max(1, maxCount - minCount), 0.7);
  const X = (v: number) => v * w, Y = (v: number) => v * H;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={[styles.graphBox, { height: H }]}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {graph.edges.map((e) => {
            const a = byId.get(e.a), b = byId.get(e.b);
            if (!a || !b) return null;
            const lit = selected && (e.a === selected || e.b === selected);
            return (
              <Line key={`${e.a}|${e.b}`} x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)}
                stroke={lit ? colors.green : colors.greenBorderDim}
                strokeWidth={0.6 + 3.2 * (e.weight / maxW)}
                opacity={selected && !lit ? 0.35 : 1} />
            );
          })}
          {pts.map((p) => {
            const on = p.id === selected, near = neighbours.has(p.id);
            const dim = selected && !on && !near;
            const rad = r(p.count);
            const label = p.id;
            const lw = label.length * 5.6 + 8;
            return (
              <G key={p.id} onPress={() => onSelect(p.id)} opacity={dim ? 0.35 : 1}>
                <Circle cx={X(p.x)} cy={Y(p.y)} r={rad + 8} fill="transparent" />
                <Circle cx={X(p.x)} cy={Y(p.y)} r={rad} fill={on ? colors.green : colors.black} stroke={colors.green} strokeWidth={on || near ? 2 : 1.2} />
                <Rect x={X(p.x) - lw / 2} y={Y(p.y) + rad + 2} width={lw} height={13} fill={colors.black} opacity={0.85} />
                <SvgText x={X(p.x)} y={Y(p.y) + rad + 12} fontSize={10} fontFamily="ShareTechMono_400Regular"
                  fill={on ? colors.mint : colors.greenDim} fontWeight={on ? 'bold' : 'normal'} textAnchor="middle">
                  {label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

function DetailCard({ detail, loading, selected, onSelect }: {
  detail: ConceptDetail | null; loading: boolean; selected: string | null; onSelect: (id: string) => void;
}) {
  if (!selected) return <Mono style={styles.intro}>Tap an idea to learn about it.</Mono>;
  if (loading && !detail) return <ActivityIndicator color={colors.green} style={{ marginTop: 20 }} />;
  if (!detail) return <Mono style={styles.intro}>Couldn't load “{selected}”.</Mono>;
  return (
    <View style={styles.card}>
      <Mono style={styles.sectionLabel}>IDEA</Mono>
      <Display style={styles.cardTitle}>{detail.topic}</Display>
      <Mono style={styles.cardLine}>
        WYRD has met this in <Mono style={styles.strong}>{detail.mentions.toLocaleString()}</Mono> of the things it recently read or thought about.
      </Mono>

      <Mono style={[styles.sectionLabel, { marginTop: 12 }]}>WHAT IT MEANS</Mono>
      {detail.definition
        ? <Mono style={styles.cardLine}>{detail.partOfSpeech ? <Mono style={styles.pos}>{detail.partOfSpeech} · </Mono> : null}{detail.definition}</Mono>
        : <Mono style={styles.muted}>Not in WYRD's vocabulary yet. It may be a name, a technical term or a word it hasn't looked up.</Mono>}

      {detail.related.length > 0 && (
        <>
          <Mono style={[styles.sectionLabel, { marginTop: 12 }]}>OFTEN APPEARS WITH</Mono>
          <View style={styles.chips}>
            {detail.related.map((r) => (
              <Pressable key={r.id} onPress={() => onSelect(r.id)} style={styles.chip}>
                <Mono style={styles.chipText}>{r.id} <Mono style={styles.chipCount}>{r.count}</Mono></Mono>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {detail.examples.length > 0 && (
        <>
          <Mono style={[styles.sectionLabel, { marginTop: 12 }]}>WHERE WYRD MET IT</Mono>
          {detail.examples.map((ex, i) => (
            <Pressable key={i} disabled={!ex.url} onPress={() => ex.url && Linking.openURL(ex.url)} style={styles.example}>
              <Mono style={styles.exSource}>{SOURCE_LABEL[ex.source] ?? ex.source.toUpperCase()} · {timeAgo(ex.timestamp)}{ex.url ? ' · open ↗' : ''}</Mono>
              <Mono style={styles.exTitle}>{ex.title}</Mono>
              {!!ex.snippet && <Mono style={styles.exSnippet} numberOfLines={3}>{ex.snippet}</Mono>}
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 14, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 12, lineHeight: 18, color: colors.greenDim },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 10, color: colors.greenDim },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  graphCol: { flexGrow: 3, flexBasis: 420, minWidth: 280 },
  detailCol: { flexGrow: 2, flexBasis: 300, minWidth: 260 },
  graphBox: { borderWidth: 1, borderColor: colors.greenBorder, backgroundColor: colors.black },
  card: { borderWidth: 1, borderColor: colors.green, padding: 14 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  cardTitle: { fontSize: 26, color: colors.mint, marginTop: 2 },
  cardLine: { fontSize: 12, lineHeight: 18, color: colors.mint, marginTop: 4 },
  strong: { color: colors.green, fontWeight: 'bold' },
  pos: { fontStyle: 'italic', color: colors.greenDim },
  muted: { fontSize: 11.5, lineHeight: 17, color: colors.greenDim, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, color: colors.mint },
  chipCount: { fontSize: 9, color: colors.greenDim },
  example: { borderLeftWidth: 2, borderLeftColor: colors.greenBorder, paddingLeft: 10, paddingVertical: 4, marginTop: 8 },
  exSource: { fontSize: 9, letterSpacing: 1.2, color: colors.greenDim },
  exTitle: { fontSize: 12, lineHeight: 17, color: colors.mint, marginTop: 2 },
  exSnippet: { fontSize: 11, lineHeight: 16, color: colors.greenDim, marginTop: 2 },
  listBox: { borderWidth: 1, borderColor: colors.greenBorder, padding: 12, gap: 2 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' },
  search: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 8, paddingVertical: 5, minWidth: 160, fontFamily: 'ShareTechMono_400Regular', fontSize: 12, color: colors.mint },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, paddingHorizontal: 4 },
  listRowOn: { backgroundColor: 'rgba(0,0,0,0.05)' },
  rank: { width: 20, fontSize: 10, color: colors.greenBorder },
  listName: { width: 130, fontSize: 12, color: colors.mint },
  barTrack: { flex: 1, height: 6, backgroundColor: colors.greenBorderDim },
  bar: { height: 6, backgroundColor: colors.green },
  listCount: { width: 56, textAlign: 'right', fontSize: 11, color: colors.greenDim },
});
