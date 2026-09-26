import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { OverlayShell } from './OverlayShell';
import { BrainCanvas } from '../../components/BrainCanvas';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useBrainActivitySignal, useConcepts, useGrowth, useLexicon, useMind } from '../../api/hooks';
import { useIsDesktop } from '../../util/layout';
import type { GrowthSnapshot } from '../../api/types';

// Words that top the raw concept counts only because WYRD's own template answers repeat them
// ("...ties back to a few things I've seen before...") -- real counts, but they say nothing about
// what it knows, so they're left out of "most present in memory".
const FILLER = new Set(
  ('before here something seen little least got like just into real ties feels back few things from such ' +
    'can which how other its these what more all through one including their also that this with have been ' +
    'were they them then than some only over very about would could should there where when while your').split(' '),
);

/**
 * BRAIN_3D: a full look inside WYRD's mind. The brain visual (node count grows with vocabulary)
 * plus the real state behind it: mood/focus/goal, vital stats, growth over time, the concepts
 * most present in memory, and the words it most recently learned. Everything shown comes from
 * the backend -- nothing is decorative filler.
 */
export function BrainOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { mind } = useMind();
  const { stats } = useLexicon();
  const { snapshots } = useGrowth();
  const { graph } = useConcepts();
  const brainActivity = useBrainActivitySignal();
  const desktop = useIsDesktop();

  const learnedToday = useMemo(() => {
    if (!snapshots.length) return null;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const before = [...snapshots].reverse().find((s) => new Date(s.timestamp).getTime() < midnight.getTime());
    const latest = snapshots[snapshots.length - 1];
    return before ? Math.max(0, latest.vocabCount - before.vocabCount) : null;
  }, [snapshots]);

  const topConcepts = (graph?.nodes ?? []).filter((n) => !FILLER.has(n.id)).slice(0, 8);
  const maxConcept = Math.max(1, ...topConcepts.map((n) => n.count));
  const recentWords = [...(stats?.recent ?? [])].reverse();
  const digest = mind?.digest;

  const brain = (
    <View style={desktop ? styles.brainDesktop : styles.brainMobile}>
      <BrainCanvas nodeCount={Math.min(400, Math.max(80, stats?.learned ?? 150))} activitySignal={brainActivity} />
      <View style={styles.hud} pointerEvents="none">
        <Mono style={styles.eyebrow}>MOOD</Mono>
        <Display style={styles.mood}>{mind?.mood ?? '—'}</Display>
        <Mono style={styles.hudLine}>focus · {mind?.focusTopic ?? 'nothing yet'}</Mono>
        {mind?.activeGoal ? <Mono style={styles.hudGoal}>goal · {mind.activeGoal}</Mono> : null}
      </View>
      <Mono style={styles.caption} pointerEvents="none">NODES GROW AS IT LEARNS</Mono>
    </View>
  );

  const details = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.details}>
      <View style={styles.statGrid}>
        <Stat label="WORDS UNDERSTOOD" value={(stats?.learned ?? 0).toLocaleString()} sub={`of ${(stats?.attempted ?? 0).toLocaleString()} looked up`} />
        <Stat label="LEARNED TODAY" value={learnedToday == null ? '—' : String(learnedToday)} sub="new words since midnight" />
        <Stat label="TOPICS IN MEMORY" value={(digest?.totalTopics ?? 0).toLocaleString()} sub={`${(digest?.answeredTopics ?? 0).toLocaleString()} resolved`} />
        <Stat label="DIGESTED" value={`${digest?.percent ?? 0}%`} sub={digest?.etaMinutes ? `~${Math.round(digest.etaMinutes)} min to full` : 'of known topics'} />
        <Stat label="CURIOSITY" value={`${Math.round((mind?.curiosity ?? 0) * 100)}%`} sub="how much it wants to explore" />
        <Stat label="SELF-QUESTIONS" value={(mind?.explorationCount ?? 0).toLocaleString()} sub="asked of itself, unprompted" />
      </View>

      <Section title="GROWTH">
        {snapshots.length > 1 ? <GrowthChart snapshots={snapshots} /> : <Mono style={styles.muted}>not enough snapshots yet (one every 30 minutes)</Mono>}
      </Section>

      <Section title="MOST PRESENT IN MEMORY">
        {topConcepts.length === 0 ? <Mono style={styles.muted}>no concepts mapped yet</Mono> : null}
        {topConcepts.map((n) => (
          <View key={n.id} style={styles.conceptRow}>
            <Mono style={styles.conceptName} numberOfLines={1}>{n.id}</Mono>
            <View style={styles.conceptTrack}>
              <View style={[styles.conceptBar, { width: `${(n.count / maxConcept) * 100}%` }]} />
            </View>
            <Mono style={styles.conceptCount}>{n.count}</Mono>
          </View>
        ))}
      </Section>

      <Section title="RECENTLY LEARNED WORDS">
        {recentWords.length === 0 ? <Mono style={styles.muted}>no words learned yet</Mono> : null}
        {recentWords.map((w, i) => (
          <View key={w.word} style={[styles.wordRow, i > 0 && styles.rule]}>
            <View style={styles.wordHead}>
              <Display style={styles.word}>{w.word}</Display>
              <Mono style={styles.pos}>{w.partOfSpeech}</Mono>
            </View>
            <Mono style={styles.definition}>{w.definition}</Mono>
          </View>
        ))}
      </Section>
    </ScrollView>
  );

  return (
    <OverlayShell visible={visible} title="BRAIN_3D" onClose={onClose} black>
      <View style={[{ flex: 1 }, desktop && { flexDirection: 'row' }]}>
        {brain}
        <View style={[{ flex: 1 }, desktop && styles.detailsDesktop]}>{details}</View>
      </View>
    </OverlayShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.stat}>
      <Mono style={styles.eyebrow}>{label}</Mono>
      <Display style={styles.statValue}>{value}</Display>
      <Mono style={styles.statSub} numberOfLines={1}>{sub}</Mono>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Mono style={styles.eyebrow}>{title}</Mono>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

/** Vocabulary (solid) and digest % (dashed) over time, each scaled to its own range. */
function GrowthChart({ snapshots }: { snapshots: GrowthSnapshot[] }) {
  const [w, setW] = useState(0);
  const h = 90;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const line = (values: number[]) => {
    const min = Math.min(...values);
    const span = Math.max(1e-9, Math.max(...values) - min);
    return values
      .map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`)
      .join(' ');
  };
  const first = new Date(snapshots[0].timestamp);
  const last = snapshots[snapshots.length - 1];
  return (
    <View onLayout={onLayout}>
      {w > 0 && (
        <Svg width={w} height={h}>
          <Polyline points={line(snapshots.map((s) => s.vocabCount))} stroke={colors.green} strokeWidth={1.6} fill="none" />
          <Polyline points={line(snapshots.map((s) => s.digestPercent))} stroke={colors.greenDim} strokeWidth={1} strokeDasharray="3 3" fill="none" />
        </Svg>
      )}
      <View style={styles.legend}>
        <Mono style={styles.legendText}>━ vocabulary {last.vocabCount}</Mono>
        <Mono style={styles.legendText}>┅ digest {last.digestPercent}%</Mono>
        <Mono style={styles.legendText}>since {first.toLocaleDateString()}</Mono>
      </View>
    </View>
  );
}

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  brainMobile: { height: '46%', minHeight: 260, borderBottomWidth: HAIRLINE, borderBottomColor: colors.greenBorder },
  brainDesktop: { flex: 1.3, borderRightWidth: HAIRLINE, borderRightColor: colors.greenBorder },
  detailsDesktop: { maxWidth: 480 },
  hud: { position: 'absolute', top: 12, left: 14, right: 14 },
  eyebrow: { fontSize: 8.5, letterSpacing: 2.2, color: colors.greenDim },
  mood: { fontSize: 30, lineHeight: 32, color: colors.green },
  hudLine: { fontSize: 11, color: colors.greenDim },
  hudGoal: { fontSize: 10.5, color: colors.greenDim, marginTop: 2 },
  caption: { position: 'absolute', left: 14, bottom: 10, fontSize: 8.5, letterSpacing: 2, color: colors.greenBorder },

  details: { padding: 14, paddingBottom: 32, gap: 18 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48.5%', borderWidth: 1, borderColor: colors.greenBorder, padding: 10 },
  statValue: { fontSize: 24, lineHeight: 26, color: colors.green, marginTop: 3 },
  statSub: { fontSize: 9.5, color: colors.greenDim, marginTop: 1 },

  section: {},
  muted: { fontSize: 11, color: colors.greenDim },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legendText: { fontSize: 9, color: colors.greenDim },

  conceptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  conceptName: { width: 92, fontSize: 11.5, color: colors.mint },
  conceptTrack: { flex: 1, height: 6, backgroundColor: colors.greenBorderDim },
  conceptBar: { height: '100%', backgroundColor: colors.green },
  conceptCount: { width: 42, textAlign: 'right', fontSize: 10, color: colors.greenDim },

  wordRow: { paddingVertical: 9 },
  rule: { borderTopWidth: HAIRLINE, borderTopColor: colors.greenBorder },
  wordHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  word: { fontSize: 20, lineHeight: 22, color: colors.green },
  pos: { fontSize: 9.5, letterSpacing: 1, color: colors.greenDim },
  definition: { marginTop: 3, fontSize: 11.5, lineHeight: 17, color: colors.mint },
});
