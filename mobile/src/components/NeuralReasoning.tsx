import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Display, Mono } from './ui';
import { colors } from '../theme';
import { api } from '../api/client';
import { useReasoning } from '../api/hooks';
import type { Firing, NeuralNetwork, ReasoningNote, Thought } from '../api/types';
import { forceLayout } from '../util/forceLayout';
import { timeAgo } from '../util/time';

// deterministic pseudo-random from a string, for stable dendrites and tissue texture
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/** REASONING: WYRD's ideas as a living neural network -- neurons, synapses, and the signal of
 *  its latest firing -- plus a plain-English log of what it has been thinking. */
export function NeuralReasoning() {
  const { notes } = useReasoning();
  const [net, setNet] = useState<NeuralNetwork | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.reasoningNetwork(60).then((n) => { if (alive) setNet(n); }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const firings = notes.filter((n) => n.kind === 'firing' && n.firing);
  const latest = firings[0]?.firing ?? null;
  const shown = notes.filter((n) => n.kind === 'thought' || n.kind === 'firing' || n.kind === 'self' || n.kind === 'sleep').slice(0, 20);
  const strongest = net?.synapses[0];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Display style={styles.heading}>{'>_ REASONING'}</Display>
      <Mono style={styles.sub}>
        WYRD's ideas are neurons. Ideas that keep turning up together wire together, and the connection grows stronger each time. Every 30 seconds one idea fires, and the signal travels along its strongest connections.
      </Mono>

      <View style={styles.stats}>
        <Stat k="NEURONS" v={net ? String(net.neurons.length) : '—'} note="ideas shown" />
        <Stat k="SYNAPSES" v={net ? net.totalSynapses.toLocaleString() : '—'} note="connections" />
        <Stat k="STRONGEST LINK" v={strongest ? `${strongest.a} — ${strongest.b}` : '—'} note={strongest ? `strength ${strongest.weight.toFixed(2)}` : ''} />
        <Stat k="LAST FIRING" v={firings[0]?.timestamp ? timeAgo(firings[0].timestamp) : '—'} note={latest ? `from “${latest.seed}”` : ''} />
      </View>

      {net && net.synapses.length > 0 ? <Tissue net={net} firing={latest} /> : (
        <View style={styles.emptyTissue}><Mono style={styles.muted}>The network is still forming: synapses appear as WYRD reads ideas together.</Mono></View>
      )}
      <View style={styles.legend}>
        <Mono style={styles.legendText}>● neuron = an idea   ─ synapse = a learned connection (thicker = stronger)   ◉ = the idea that fired last, the pulse is its signal</Mono>
      </View>

      <Mono style={styles.section}>WHAT WYRD HAS BEEN THINKING</Mono>
      {shown.length === 0 && <Mono style={styles.muted}>Nothing yet.</Mono>}
      {shown.map((n) => (n.thought ? <ThoughtCard key={n.file} note={n} t={n.thought} /> : n.kind === 'firing' && n.firing ? <FiringCard key={n.file} note={n} f={n.firing} /> : n.kind === 'sleep' ? <SleepCard key={n.file} note={n} /> : <SelfCard key={n.file} note={n} />))}
    </ScrollView>
  );
}

function Stat({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <View style={styles.stat}>
      <Mono style={styles.statK}>{k}</Mono>
      <Display style={styles.statV} numberOfLines={1}>{v}</Display>
      {!!note && <Mono style={styles.statNote} numberOfLines={1}>{note}</Mono>}
    </View>
  );
}

function Tissue({ net, firing }: { net: NeuralNetwork; firing: Firing | null }) {
  const [w, setW] = useState(0);
  const H = Math.max(340, Math.min(520, w * 0.72));
  const graph = useMemo(() => ({
    nodes: net.neurons,
    edges: net.synapses.map((s) => ({ a: s.a, b: s.b, weight: s.weight })),
  }), [net]);
  const pts = useMemo(() => forceLayout(graph), [graph]);
  const at = useMemo(() => new Map(pts.map((p) => [p.id, p])), [pts]);
  const maxC = Math.max(1, ...net.neurons.map((n) => n.count));
  const X = (v: number) => v * w, Y = (v: number) => v * H;
  const onPath = new Set(firing?.path ?? []);
  const pathPairs = new Set((firing?.synapses ?? []).map((s) => `${s.a}|${s.b}`));

  // tissue texture: faint cells
  const cells = useMemo(() => {
    const r = hash('tissue');
    return Array.from({ length: 70 }, () => ({ x: r(), y: r(), s: 6 + r() * 22 }));
  }, []);

  // the signal: a pulse travelling seed -> ... along the latest path
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [t, firing?.seed, firing?.path.join('>')]);
  const route = (firing?.path ?? []).map((id) => at.get(id)).filter(Boolean) as { x: number; y: number }[];
  const input = route.map((_, i) => i / Math.max(1, route.length - 1));

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={[styles.tissue, { height: H }]}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {cells.map((c, i) => (
            <Circle key={i} cx={c.x * w} cy={c.y * H} r={c.s} fill="none" stroke={colors.greenBorderDim} strokeWidth={0.6} opacity={0.5} />
          ))}
          {net.synapses.map((s) => {
            const a = at.get(s.a), b = at.get(s.b);
            if (!a || !b) return null;
            const lit = pathPairs.has(`${s.a}|${s.b}`) || pathPairs.has(`${s.b}|${s.a}`);
            const mx = (X(a.x) + X(b.x)) / 2, my = (Y(a.y) + Y(b.y)) / 2;
            const dx = X(b.x) - X(a.x), dy = Y(b.y) - Y(a.y);
            const bend = hash(s.a + s.b)() - 0.5; // gentle organic curve
            const cx = mx - dy * 0.25 * bend, cy = my + dx * 0.25 * bend;
            return (
              <Path key={`${s.a}|${s.b}`} d={`M${X(a.x)},${Y(a.y)} Q${cx},${cy} ${X(b.x)},${Y(b.y)}`}
                stroke={lit ? colors.green : colors.greenBorder} strokeWidth={0.5 + 4 * s.weight}
                strokeLinecap="round" fill="none" opacity={lit ? 1 : 0.55} />
            );
          })}
          {pts.map((p) => {
            const r0 = 4 + 10 * Math.sqrt(p.count / maxC);
            const rnd = hash(p.id);
            const n = 5 + Math.floor(rnd() * 3);
            const hot = onPath.has(p.id), seed = firing?.seed === p.id;
            return (
              <G key={p.id}>
                {Array.from({ length: n }, (_, k) => {
                  const ang = (k / n) * Math.PI * 2 + rnd() * 0.6;
                  const len = r0 + 5 + rnd() * 8;
                  return <Line key={k} x1={X(p.x) + Math.cos(ang) * r0} y1={Y(p.y) + Math.sin(ang) * r0}
                    x2={X(p.x) + Math.cos(ang) * len} y2={Y(p.y) + Math.sin(ang) * len}
                    stroke={hot ? colors.green : colors.greenBorder} strokeWidth={1} strokeLinecap="round" />;
                })}
                <Circle cx={X(p.x)} cy={Y(p.y)} r={r0 + 2.5} fill="none" stroke={hot ? colors.green : colors.greenBorderDim} strokeWidth={1} />
                <Circle cx={X(p.x)} cy={Y(p.y)} r={r0} fill={seed ? colors.green : colors.black} stroke={hot ? colors.green : colors.greenDim} strokeWidth={hot ? 2 : 1.2} />
                <Circle cx={X(p.x)} cy={Y(p.y)} r={Math.max(1.6, r0 * 0.28)} fill={seed ? colors.black : hot ? colors.green : colors.greenBorder} />
                <SvgText x={X(p.x)} y={Y(p.y) + r0 + 14} fontSize={10} textAnchor="middle" fontFamily="ShareTechMono_400Regular"
                  fill={hot ? colors.mint : colors.greenDim} fontWeight={hot ? 'bold' : 'normal'}>{p.id}</SvgText>
              </G>
            );
          })}
        </Svg>
      )}
      {w > 0 && route.length > 1 && (
        <>
          <Animated.View pointerEvents="none" style={[styles.pulse, {
            transform: [
              { translateX: t.interpolate({ inputRange: input, outputRange: route.map((p) => X(p.x) - 6) }) },
              { translateY: t.interpolate({ inputRange: input, outputRange: route.map((p) => Y(p.y) - 6) }) },
            ],
          }]} />
          <Animated.View pointerEvents="none" style={[styles.seedRing, {
            left: X(route[0].x) - 18, top: Y(route[0].y) - 18,
            opacity: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.9, 0, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.6, 1.6, 1.6] }) }],
          }]} />
        </>
      )}
    </View>
  );
}

function FiringCard({ note, f }: { note: ReasoningNote; f: Firing }) {
  return (
    <View style={styles.card}>
      <Mono style={styles.cardMeta}>NEURAL FIRING{note.timestamp ? ` · ${timeAgo(note.timestamp)}` : ''}</Mono>
      <View style={styles.path}>
        {f.path.map((id, i) => (
          <React.Fragment key={id + i}>
            {i > 0 && (
              <Mono style={styles.arrow}>
                ─ {f.synapses[i - 1] ? `${f.synapses[i - 1].before.toFixed(2)}→${f.synapses[i - 1].after.toFixed(2)}` : ''} ▶
              </Mono>
            )}
            <View style={[styles.node, i === 0 && styles.nodeSeed]}>
              <Mono style={[styles.nodeText, i === 0 && styles.nodeTextSeed]}>{id}</Mono>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Mono style={styles.cardText}>{f.summary}</Mono>
      {!!f.meaning && <Mono style={styles.meaning}>WYRD reads “{f.seed}” as: {f.meaning}</Mono>}
    </View>
  );
}

/** A night's consolidation (see the server's SleepService). */
function SleepCard({ note }: { note: ReasoningNote }) {
  let summary = note.content;
  try { summary = (JSON.parse(note.content) as { summary?: string }).summary ?? summary; } catch { /* plain text */ }
  return (
    <View style={[styles.card, styles.sleepCard]}>
      <Mono style={styles.cardMeta}>☾ SLEEP · CONSOLIDATION{note.timestamp ? ' · ' + timeAgo(note.timestamp) : ''}</Mono>
      <Mono style={styles.cardText}>{summary}</Mono>
    </View>
  );
}

const STATUS: Record<Thought['status'], string> = {
  held: 'HELD — sources agree', hypothesis: 'HYPOTHESIS — one source so far', doubted: 'DOUBTED', dream: 'A DREAM, UNTESTED',
  dropped: 'LET GO', open: 'OPEN QUESTION',
};

/** One act of its own thinking: the belief it formed or re-tested, how sure it is, and why. */
function ThoughtCard({ note, t }: { note: ReasoningNote; t: Thought }) {
  const [open, setOpen] = useState(false);
  const verb = t.op === 'connect' ? 'FORMED A BELIEF' : t.op === 'test' ? 'RE-TESTED A BELIEF' : 'ASKED ITSELF';
  const pct = (v: number | null) => (v == null ? '' : `${Math.round(v * 100)}%`);
  return (
    <View style={[styles.card, t.status === 'open' && styles.sleepCard]}>
      <Mono style={styles.cardMeta}>{verb}{note.timestamp ? ` · ${timeAgo(note.timestamp)}` : ''}</Mono>
      <View style={styles.path}>
        <View style={styles.node}><Mono style={styles.cardText}>{t.a}</Mono></View>
        <Mono style={styles.muted}>{t.op === 'question' ? '?' : '↔'}</Mono>
        <View style={styles.node}><Mono style={styles.cardText}>{t.b}</Mono></View>
        <Mono style={styles.cardMeta}>{STATUS[t.status] ?? t.status.toUpperCase()}{t.after != null ? ` · ${t.before != null ? `${pct(t.before)} → ` : ''}${pct(t.after)}` : ''}</Mono>
      </View>
      <Mono style={styles.cardText}>{t.summary}</Mono>
      {t.evidence.length > 0 && (
        <>
          <Mono style={styles.cardMeta} onPress={() => setOpen((o) => !o)}>{open ? '▾' : '▸'} EVIDENCE ({t.evidence.length})</Mono>
          {open && t.evidence.map((e, i) => (
            <Mono key={i} style={styles.meaning}>{e.against ? '✕ ' : '✓ '}“{e.text}” — {e.source}, trusted {Math.round(e.trust * 100)}%</Mono>
          ))}
        </>
      )}
    </View>
  );
}

function SelfCard({ note }: { note: ReasoningNote }) {
  const q = note.content.match(/^Q:\s*(.+)$/m)?.[1];
  const a = note.content.match(/^A:\s*([\s\S]+?)(\n\n|$)/m)?.[1];
  return (
    <View style={styles.card}>
      <Mono style={styles.cardMeta}>SELF-QUESTION{note.timestamp ? ` · ${timeAgo(note.timestamp)}` : ''}</Mono>
      {q ? (
        <>
          <Mono style={styles.q}>{q}</Mono>
          {!!a && <Mono style={styles.cardText}>{a.trim()}</Mono>}
        </>
      ) : <Mono style={styles.cardText} numberOfLines={6}>{note.content}</Mono>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 12, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  heading: { fontSize: 24, color: colors.green },
  sub: { fontSize: 12, lineHeight: 18, color: colors.greenDim },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 150, borderWidth: 1, borderColor: colors.greenBorder, padding: 10 },
  statK: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim },
  statV: { fontSize: 16, color: colors.mint, marginTop: 3 },
  statNote: { fontSize: 10, color: colors.greenDim, marginTop: 2 },
  tissue: { borderWidth: 1, borderColor: colors.greenBorder, backgroundColor: colors.black, overflow: 'hidden' },
  emptyTissue: { borderWidth: 1, borderColor: colors.greenBorder, padding: 30, alignItems: 'center' },
  pulse: { position: 'absolute', left: 0, top: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.signal, boxShadow: '0 0 10px rgba(42,31,23,0.6)' } as object,
  seedRing: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.signal },
  legend: { marginTop: -4 },
  legendText: { fontSize: 10, color: colors.greenDim },
  section: { fontSize: 10, letterSpacing: 2, color: colors.greenDim, marginTop: 8 },
  muted: { fontSize: 12, color: colors.greenDim },
  card: { borderWidth: 1, borderColor: colors.greenBorder, padding: 12, gap: 8 },
  sleepCard: { borderStyle: 'dashed', borderColor: colors.green },
  cardMeta: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim },
  cardText: { fontSize: 12.5, lineHeight: 19, color: colors.mint },
  q: { fontSize: 13, lineHeight: 19, color: colors.mint, fontWeight: 'bold' },
  meaning: { fontSize: 11, lineHeight: 16, color: colors.greenDim, fontStyle: 'italic' },
  path: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  node: { borderWidth: 1, borderColor: colors.green, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  nodeSeed: { backgroundColor: colors.green },
  nodeText: { fontSize: 11, color: colors.mint },
  nodeTextSeed: { color: colors.black },
  arrow: { fontSize: 10, color: colors.greenDim },
});
