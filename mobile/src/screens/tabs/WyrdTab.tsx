import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { BrainCanvas } from '../../components/BrainCanvas';
import { LearningStream } from '../../components/LearningStream';
import { DialogueLauncher } from '../../components/DialogueLauncher';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import {
  useBrainActivitySignal,
  useFeed,
  useFeedNext,
  useLexicon,
  useMind,
  useReasoning,
  useReasoningNext,
} from '../../api/hooks';
import { countdown, timeAgo } from '../../util/time';
import { firstLineFromMarkdown } from '../../util/text';
import { useIsDesktop } from '../../util/layout';

const BRAIN_ZOOM = 1.6;

// Filler words that say nothing about what WYRD is actually learning.
const STOPWORDS = new Set(
  'the and for with that this from into your their about what when where which while will would there these those have has had been were they them then than just also more most some such only over very like show make made using used uses how why who its it\'s are was'.split(' '),
);

function keywords(text: string, max: number): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, max);
}

type Detail = 'feed' | 'reasoning' | null;

export function WyrdTab({ onOpenBrain, onOpenLink }: { onOpenBrain: () => void; onOpenLink: () => void }) {
  const { mind } = useMind();
  const { items: feed } = useFeed();
  const feedNext = useFeedNext();
  const { notes } = useReasoning();
  const reasoningNext = useReasoningNext();
  const { stats: lexicon } = useLexicon();
  const brainActivity = useBrainActivitySignal();
  const desktop = useIsDesktop();

  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<Detail>(null);
  const zoom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(zoom, { toValue: expanded ? 1 : 0, friction: 9, tension: 45, useNativeDriver: true }).start();
    if (!expanded) setDetail(null);
  }, [expanded, zoom]);

  const mood = mind?.mood ?? '—';
  const focus = mind?.focusTopic ?? 'nothing yet';
  const curPct = Math.round((mind?.curiosity ?? 0) * 100);
  const confPct = Math.round((mind?.confidence ?? 0) * 100);
  const digestPct = mind?.digest?.percent ?? 0;
  const latestNote = notes[0];

  // What WYRD is taking in right now, newest first: the latest ingests, the topics of its latest
  // self-questions, the words it most recently learned, and what it's focused on.
  const learningWords = useMemo(() => {
    const out: string[] = [];
    feed.slice(0, 4).forEach((f) => out.push(...keywords(f.title, 4)));
    notes.slice(0, 4).forEach((n) => {
      const topic = /-\s*topic:\s*(.+)/i.exec(n.content)?.[1]?.trim();
      if (topic) out.push(topic.toLowerCase());
    });
    (lexicon?.recent ?? []).slice().reverse().forEach((w) => out.push(w.word));
    if (mind?.focusTopic) out.push(mind.focusTopic);
    return [...new Set(out)].slice(0, 30);
  }, [feed, notes, lexicon, mind?.focusTopic]);

  const brainScale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, BRAIN_ZOOM] });
  const heroOpacity = zoom.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' });
  const panelOpacity = zoom.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const panelScale = zoom.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={[{ flex: 1 }, desktop && styles.desktopRow]}>
      <View style={styles.heroWrap}>
        {/* The brain itself is the open/close target. The chips, cards and ENTER 3D below are
            siblings layered on top, not children -- nested pressables let this outer target
            swallow their taps on web. */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.center]}
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Close the brain view' : 'Open the brain to see its vitals'}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: brainScale }] }]}>
            <BrainCanvas activitySignal={brainActivity} energy={expanded ? 2.2 : 1} />
          </Animated.View>

          <LearningStream words={learningWords} active={expanded} />

          <Animated.View style={[styles.hero, { opacity: heroOpacity }]} pointerEvents="none">
            <Mono style={styles.eyebrow}>MOOD</Mono>
            <Display style={styles.moodValue}>{mood}</Display>
            <Mono style={styles.focusLine}>focus · {focus}</Mono>
          </Animated.View>
        </Pressable>

        {/* inside the opened brain: vitals, plus the two live channels you can tap into */}
        <Animated.View
          pointerEvents={expanded ? 'box-none' : 'none'}
          style={[StyleSheet.absoluteFill, { opacity: panelOpacity, transform: [{ scale: panelScale }] }]}
        >
          <Vital label="DIGEST" pct={digestPct} style={styles.vitalTop} big />
          <Vital label="CURIOSITY" pct={curPct} style={styles.vitalLeft} />
          <Vital label="CONFIDENCE" pct={confPct} style={styles.vitalRight} />

          <Channel
            label="NET_FEED"
            meta={`next ${countdown(feedNext?.nextTickAt)}`}
            active={detail === 'feed'}
            onPress={() => setDetail((d) => (d === 'feed' ? null : 'feed'))}
            style={styles.channelLeft}
          />
          <Channel
            label="REASONING"
            meta={`next ${countdown(reasoningNext?.nextTickAt)}`}
            active={detail === 'reasoning'}
            onPress={() => setDetail((d) => (d === 'reasoning' ? null : 'reasoning'))}
            style={styles.channelRight}
          />

          {detail === 'feed' && (
            <DetailCard title="NET_FEED · WHAT WYRD JUST READ" onClose={() => setDetail(null)}>
              {feed.length === 0 ? <Mono style={styles.detailEmpty}>waiting on the first ingest…</Mono> : null}
              {feed.slice(0, 5).map((f, i) => (
                <View key={`${f.timestamp}-${i}`} style={[styles.detailRow, i > 0 && styles.detailRule]}>
                  <Mono style={styles.detailMeta}>[{f.feedSource}] · {timeAgo(f.timestamp)}</Mono>
                  <Mono style={styles.detailText}>{f.title}</Mono>
                </View>
              ))}
            </DetailCard>
          )}
          {detail === 'reasoning' && (
            <DetailCard title="REASONING · WHAT WYRD IS THINKING" onClose={() => setDetail(null)}>
              {notes.length === 0 ? <Mono style={styles.detailEmpty}>no reasoning notes yet</Mono> : null}
              {notes.slice(0, 3).map((n, i) => (
                <View key={n.file} style={[styles.detailRow, i > 0 && styles.detailRule]}>
                  <Mono style={styles.detailMeta}>{n.kind === 'firing' ? 'NEURAL FIRING' : /-self\.md$/.test(n.file) ? 'SELF-QUESTION' : 'REASONING PASS'}</Mono>
                  <Mono style={styles.detailText}>{n.firing?.summary ?? firstLineFromMarkdown(n.content, 320)}</Mono>
                </View>
              ))}
            </DetailCard>
          )}
        </Animated.View>

        <Enter3DButton onPress={onOpenBrain} />

        <Mono style={styles.hint} pointerEvents="none">
          {expanded ? 'TAP THE BRAIN TO CLOSE' : 'TAP THE BRAIN TO LOOK INSIDE'}
        </Mono>
      </View>

      <View style={[styles.panel, desktop && styles.panelDesktop]}>
        <View style={styles.thoughtHead}>
          <View style={styles.liveDot} />
          <Mono style={styles.eyebrow}>LAST THOUGHT · {latestNote ? timeAgo(mind?.updatedAt ?? Date.now()) : '—'}</Mono>
        </View>
        <View style={styles.quote}>
          <Mono style={styles.quoteText} numberOfLines={desktop ? undefined : 4}>
            {latestNote ? firstLineFromMarkdown(latestNote.content) : mind?.activeGoal || 'still forming one.'}
          </Mono>
        </View>
        <DialogueLauncher onPress={onOpenLink} focus={mind?.focusTopic} />
      </View>
    </View>
  );
}

/** One vital sign inside the opened brain: label, value, hairline meter. Kept compact so the
 *  brain stays the subject. */
function Vital({ label, pct, style, big }: { label: string; pct: number; style: object; big?: boolean }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View style={[styles.vital, big && styles.vitalBig, style]} pointerEvents="none">
      <Mono style={styles.vitalLabel}>{label}</Mono>
      <Display style={[styles.vitalValue, big && styles.vitalValueBig]}>{`${clamped}%`}</Display>
      <View style={styles.meter}>
        <View style={[styles.meterFill, { width: `${clamped}%` }]} />
      </View>
    </View>
  );
}

/** A live channel into the brain (feed, reasoning): pulsing dot, name, next-update countdown. */
function Channel({ label, meta, active, onPress, style }: {
  label: string;
  meta: string;
  active: boolean;
  onPress: () => void;
  style: object;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const ink = active ? colors.black : colors.green;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.channel, active && styles.channelOn, pressed && { opacity: 0.75 }, style]}>
      <Animated.View style={[styles.channelDot, { backgroundColor: ink, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
      <View>
        <Mono style={[styles.channelLabel, { color: ink }]}>{label}</Mono>
        <Mono style={[styles.channelMeta, { color: active ? colors.black : colors.greenDim }]}>{meta}</Mono>
      </View>
    </Pressable>
  );
}

function DetailCard({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Pressable style={styles.detail} onPress={() => {}}>
      <View style={styles.detailHead}>
        <Mono style={styles.detailTitle}>{title}</Mono>
        <Pressable onPress={onClose} hitSlop={12}>
          <Mono style={styles.detailClose}>×</Mono>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 210 }}>{children}</ScrollView>
    </Pressable>
  );
}

/** Door into the full 3D brain: an orbit that keeps turning, so it reads as "there's more in
 *  here" rather than a plain box. */
function Enter3DButton({ onPress }: { onPress: () => void }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.enter3d, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel="Open the 3D brain"
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={26} height={26} viewBox="0 0 26 26">
          <Ellipse cx="13" cy="13" rx="11" ry="4.5" stroke={colors.green} strokeWidth={1.2} fill="none" transform="rotate(-30 13 13)" />
          <Ellipse cx="13" cy="13" rx="11" ry="4.5" stroke={colors.greenDim} strokeWidth={0.8} fill="none" transform="rotate(40 13 13)" />
          <Circle cx="13" cy="13" r="2.6" fill={colors.green} />
          <Circle cx="22.5" cy="7.6" r="1.8" fill={colors.green} />
        </Svg>
      </Animated.View>
      <View>
        <Mono style={styles.enter3dLabel}>ENTER 3D</Mono>
        <Mono style={styles.enter3dSub}>BRAIN_3D ↗</Mono>
      </View>
    </Pressable>
  );
}

// Monochrome system: pure white ground, black ink at three weights (green = ink, greenDim =
// secondary, greenBorder = hairline), no glows or shadows -- contrast and spacing do the work.
const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  desktopRow: { flexDirection: 'row' },
  heroWrap: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 22, backgroundColor: 'rgba(255,255,255,0.82)' },
  eyebrow: { fontSize: 9, letterSpacing: 3, color: colors.greenDim },
  moodValue: { fontSize: 54, lineHeight: 56, color: colors.green, marginTop: 2 },
  focusLine: { marginTop: 6, fontSize: 11, color: colors.greenDim },
  hint: { position: 'absolute', bottom: 10, fontSize: 8.5, letterSpacing: 3, color: colors.greenBorder },

  // compact vitals: small cards around the brain's core
  vital: {
    position: 'absolute', width: 88, paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green,
  },
  vitalBig: { width: 108, alignItems: 'center' },
  vitalTop: { left: '50%', marginLeft: -54, top: '12%' },
  vitalLeft: { left: '5%', top: '38%' },
  vitalRight: { right: '5%', top: '38%' },
  vitalLabel: { fontSize: 7.5, letterSpacing: 1.8, color: colors.greenDim },
  vitalValue: { fontSize: 18, lineHeight: 20, color: colors.green, marginTop: 2 },
  vitalValueBig: { fontSize: 24, lineHeight: 26 },
  meter: { marginTop: 5, height: 2, width: '100%', backgroundColor: colors.greenBorderDim },
  meterFill: { height: '100%', backgroundColor: colors.green },

  channel: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green,
  },
  channelOn: { backgroundColor: colors.green },
  channelLeft: { left: '8%', bottom: '17%' },
  channelRight: { right: '8%', bottom: '17%' },
  channelDot: { width: 6, height: 6, borderRadius: 3 },
  channelLabel: { fontSize: 9, letterSpacing: 1.6 },
  channelMeta: { fontSize: 8, letterSpacing: 0.6, marginTop: 1 },

  detail: {
    position: 'absolute', left: '6%', right: '6%', bottom: '28%', maxWidth: 460, alignSelf: 'center',
    backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green, padding: 12,
  },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  detailTitle: { fontSize: 8.5, letterSpacing: 2, color: colors.greenDim },
  detailClose: { fontSize: 18, lineHeight: 18, color: colors.greenDim },
  detailRow: { paddingVertical: 7 },
  detailRule: { borderTopWidth: HAIRLINE, borderTopColor: colors.greenBorder },
  detailMeta: { fontSize: 8.5, letterSpacing: 1, color: colors.greenDim },
  detailText: { marginTop: 3, fontSize: 11.5, lineHeight: 16, color: colors.mint },
  detailEmpty: { fontSize: 11, color: colors.greenDim, paddingVertical: 6 },

  enter3d: {
    position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingLeft: 7, paddingRight: 12, borderRadius: 999,
    backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green,
  },
  enter3dLabel: { fontSize: 10, letterSpacing: 2, color: colors.green },
  enter3dSub: { fontSize: 7.5, letterSpacing: 1, color: colors.greenDim, marginTop: 1 },

  panel: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 10,
    backgroundColor: colors.black, borderTopWidth: HAIRLINE, borderTopColor: colors.greenBorder,
  },
  // desktop: the panel becomes a right-hand column
  panelDesktop: {
    width: 360, borderTopWidth: 0, borderLeftWidth: HAIRLINE, borderLeftColor: colors.greenBorder,
    paddingTop: 22, paddingHorizontal: 20, justifyContent: 'flex-start',
  },
  thoughtHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  quote: { borderLeftWidth: 2, borderLeftColor: colors.green, paddingLeft: 12, paddingVertical: 2 },
  quoteText: { fontSize: 13, lineHeight: 20, color: colors.mint },
});
