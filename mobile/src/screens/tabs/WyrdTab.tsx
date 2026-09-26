import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { BrainCanvas } from '../../components/BrainCanvas';
import { LearningStream } from '../../components/LearningStream';
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

export function WyrdTab({ onOpenBrain, onOpenLink }: { onOpenBrain: () => void; onOpenLink: () => void }) {
  const { mind } = useMind();
  const { items: feed } = useFeed();
  const feedNext = useFeedNext();
  const { notes } = useReasoning();
  const reasoningNext = useReasoningNext();
  const { stats: lexicon } = useLexicon();
  const brainActivity = useBrainActivitySignal();

  const [expanded, setExpanded] = useState(false);
  const zoom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(zoom, { toValue: expanded ? 1 : 0, friction: 9, tension: 45, useNativeDriver: true }).start();
  }, [expanded, zoom]);

  const mood = mind?.mood ?? '—';
  const focus = mind?.focusTopic ?? 'nothing yet';
  const curPct = Math.round((mind?.curiosity ?? 0) * 100);
  const confPct = Math.round((mind?.confidence ?? 0) * 100);
  const digestPct = mind?.digest?.percent ?? 0;
  const latestFeed = feed[0];
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
    <View style={{ flex: 1 }}>
      <Pressable
        style={styles.heroWrap}
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

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: panelOpacity, transform: [{ scale: panelScale }] }]}
        >
          <Vital label="CURIOSITY" pct={curPct} style={styles.vitalLeft} />
          <Vital label="CONFIDENCE" pct={confPct} style={styles.vitalRight} />
          <Vital label="DIGEST" pct={digestPct} style={styles.vitalCenter} big />
        </Animated.View>

        <Mono style={styles.hint} pointerEvents="none">
          {expanded ? 'TAP TO CLOSE' : 'TAP THE BRAIN'}
        </Mono>
      </Pressable>

      <View style={styles.panel}>
        <Pressable onPress={onOpenBrain} style={styles.actionBtn}>
          <Mono style={styles.actionText}>BRAIN_3D ↗</Mono>
        </Pressable>

        <View style={styles.tickerRow}>
          <TickerCard
            label={`NET_FEED · NEXT ${countdown(feedNext?.nextTickAt)}`}
            text={latestFeed ? `[${latestFeed.feedSource}] ${latestFeed.title}` : 'waiting on the first ingest…'}
          />
          <TickerCard
            label={`REASONING · NEXT ${countdown(reasoningNext?.nextTickAt)}`}
            text={latestNote ? firstLineFromMarkdown(latestNote.content, 60) : 'no reasoning notes yet'}
          />
        </View>

        <Mono style={styles.eyebrow}>
          LAST THOUGHT · {latestNote ? timeAgo(mind?.updatedAt ?? Date.now()) : '—'}
        </Mono>
        <Mono style={styles.lastThoughtText}>
          {latestNote ? firstLineFromMarkdown(latestNote.content) : mind?.activeGoal || 'still forming one.'}
        </Mono>
        <Pressable onPress={onOpenLink} style={styles.dialogueBtn}>
          <Mono style={styles.dialogueText}>{'> OPEN DIALOGUE_LINK'}</Mono>
        </Pressable>
      </View>
    </View>
  );
}

/** One vital sign shown inside the zoomed-in brain: label, value, and a hairline meter. */
function Vital({ label, pct, style, big }: { label: string; pct: number; style: object; big?: boolean }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View style={[styles.vital, big && styles.vitalBig, style]}>
      <Mono style={styles.eyebrow}>{label}</Mono>
      <Display style={[styles.vitalValue, big && styles.vitalValueBig]}>{`${clamped}%`}</Display>
      <View style={styles.meter}>
        <View style={[styles.meterFill, { width: `${clamped}%` }]} />
      </View>
    </View>
  );
}

function TickerCard({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.tickerCard}>
      <View style={styles.tickerHeadRow}>
        <View style={styles.pulseDot} />
        <Mono style={styles.tickerLabel}>{label}</Mono>
      </View>
      <Mono numberOfLines={1} style={styles.tickerText}>{text}</Mono>
    </View>
  );
}

// Monochrome system: pure white ground, black ink at three weights (green = ink, greenDim =
// secondary, greenBorder = hairline), no glows or shadows -- contrast and spacing do the work.
const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  heroWrap: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hero: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.82)' },
  eyebrow: { fontSize: 9, letterSpacing: 3, color: colors.greenDim },
  moodValue: { fontSize: 54, lineHeight: 56, color: colors.green, marginTop: 2 },
  focusLine: { marginTop: 6, fontSize: 11, color: colors.greenDim },
  hint: { position: 'absolute', bottom: 10, fontSize: 8.5, letterSpacing: 3, color: colors.greenBorder },

  vital: {
    position: 'absolute', width: 118, paddingVertical: 10, paddingHorizontal: 11,
    backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green,
  },
  vitalBig: { width: 150, alignItems: 'center' },
  vitalLeft: { left: '6%', top: '36%' },
  vitalRight: { right: '6%', top: '36%' },
  vitalCenter: { left: '50%', marginLeft: -75, top: '18%' },
  vitalValue: { fontSize: 24, color: colors.green, marginTop: 4 },
  vitalValueBig: { fontSize: 36 },
  meter: { marginTop: 7, height: 2, width: '100%', backgroundColor: colors.greenBorderDim },
  meterFill: { height: '100%', backgroundColor: colors.green },

  panel: {
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 10,
    backgroundColor: colors.black, borderTopWidth: HAIRLINE, borderTopColor: colors.greenBorder,
  },
  actionBtn: { borderWidth: 1, borderColor: colors.greenBorder, paddingVertical: 9, alignItems: 'center' },
  actionText: { fontSize: 9.5, letterSpacing: 2, color: colors.greenDim },
  tickerRow: { flexDirection: 'row', gap: 8 },
  tickerCard: { flex: 1, borderWidth: HAIRLINE, borderColor: colors.greenBorder, padding: 9, minWidth: 0 },
  tickerHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pulseDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  tickerLabel: { fontSize: 8.5, letterSpacing: 1, color: colors.greenDim },
  tickerText: { marginTop: 4, fontSize: 10.5, color: colors.mint },
  lastThoughtText: { marginTop: -4, fontSize: 12.5, lineHeight: 18, color: colors.mint },
  dialogueBtn: { backgroundColor: colors.green, paddingVertical: 14, alignItems: 'center' },
  dialogueText: { color: colors.black, fontSize: 12, letterSpacing: 2 },
});
