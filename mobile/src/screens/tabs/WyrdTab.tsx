import React, { useEffect, useMemo, useRef, useState } from 'react';
import { wyrdStream } from '../../api/stream';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { BrainCanvas } from '../../components/BrainCanvas';
import { LearningStream } from '../../components/LearningStream';
import { DialogueLauncher } from '../../components/DialogueLauncher';
import { Display, Mono } from '../../components/ui';
import { colors, fonts } from '../../theme';
import { Glyph } from '../../components/glyph/Glyph';
import {
  useBrainActivitySignal,
  useBrainMap,
  useFeed,
  useFeedNext,
  useLexicon,
  useMind,
  useReasoning,
  useReasoningNext,
} from '../../api/hooks';
import { countdown, timeAgo } from '../../util/time';
import { firstLineFromMarkdown } from '../../util/text';
import { noteLine } from '../../api/types';
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

/** Greetings in Pidgin -- the language that holds everyone together -- for the time of day:
 *  [morning, afternoon, evening], each a few lines that take turns, with what they mean. */
const GREETINGS: [string, string][][] = [
  [['Good morning o!', 'Good morning'], ['How you wake?', 'How did you wake up?'], ['Morning, my person!', 'Morning, my friend']],
  [['How far?', 'How are things?'], ['How body?', 'How are you?'], ['Afternoon o!', 'Good afternoon']],
  [['Good evening o!', 'Good evening'], ['How the day go?', 'How was your day?'], ['Evening, my guy!', 'Evening, my friend']],
];
const partOfDay = () => { const h = new Date().getHours(); return h < 12 ? 0 : h < 17 ? 1 : 2; };

/** The greeting: Pidgin lines for the time of day, a few seconds each, fading between them. */
function Greeting() {
  const [k, setK] = useState(() => Math.floor(Math.random() * 3));
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: Platform.OS !== 'web' }).start(() => {
        setK((x) => (x + 1) % 3);
        Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: Platform.OS !== 'web' }).start();
      });
    }, 6000);
    return () => clearInterval(t);
  }, [fade]);
  const [line, meaning] = GREETINGS[partOfDay()][k];
  return (
    <Animated.View style={{ opacity: fade }}>
      <Display style={styles.greet}>{line}</Display>
      <Mono style={styles.greetLang}>PIDGIN · {meaning}</Mono>
    </Animated.View>
  );
}

export function WyrdTab({ onOpenBrain, onOpenLink }: { onOpenBrain: () => void; onOpenLink: () => void }) {
  const { mind } = useMind();
  const { items: feed } = useFeed();
  const feedNext = useFeedNext();
  const { notes } = useReasoning();
  const reasoningNext = useReasoningNext();
  const { stats: lexicon } = useLexicon();
  const brainActivity = useBrainActivitySignal(mind);
  const brainMap = useBrainMap();
  // the thought crossing the brain right now: its real path, and whether it's new or recalled
  const [thought, setThought] = useState<{ path: string[]; live: boolean } | null>(null);
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

  // the ideas you and WYRD are talking about: words from the conversation that are neurons in its
  // brain light up there, and fade after two minutes
  const [lit, setLit] = useState<{ id: string; at: number }[]>([]);
  useEffect(() => {
    const names = new Set((brainMap?.neurons ?? []).map((n) => n.id));
    if (!names.size) return;
    const touch = (text: string) => {
      const words = (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []);
      const hits = Array.from(new Set(words.filter((w) => names.has(w))));
      if (!hits.length) return;
      const now = Date.now();
      setLit((cur) => [...cur.filter((x) => !hits.includes(x.id)), ...hits.map((id) => ({ id, at: now }))].slice(-8));
    };
    const off = wyrdStream.subscribe('chat', (t: unknown) => { const c = t as { userText?: string; botText?: string }; touch(`${c.userText ?? ''} ${c.botText ?? ''}`); });
    const fade = setInterval(() => setLit((cur) => cur.filter((x) => Date.now() - x.at < 120000)), 10000);
    return () => { off(); clearInterval(fade); };
  }, [brainMap]);
  const litIds = useMemo(() => lit.map((x) => x.id), [lit]);

  // the brain: on a phone it's the living backdrop of the whole home screen, as in the first version
  const brain = (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: brainScale }] }]} pointerEvents="none">
      <BrainCanvas
        activitySignal={brainActivity}
        energy={(expanded ? 2.2 : 1) * (0.6 + (mind?.curiosity ?? 0.4))}
        map={brainMap}
        radius={desktop ? 0.56 : 0.4}
        lit={litIds}
        onThought={(path, live) => setThought({ path, live })}
      />
    </Animated.View>
  );
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
          {brain /* centred on the mood, on every screen */}

          <LearningStream words={learningWords} active={expanded} />

          <Animated.View style={[styles.hero, { opacity: heroOpacity }]} pointerEvents="none">
            <Mono style={[styles.eyebrow, styles.halo]}>MOOD</Mono>
            <Display style={[styles.moodValue, styles.halo]}>{mood}</Display>
            {litIds.length ? <Mono style={[styles.onMind, styles.halo]} numberOfLines={1}>on your mind · {litIds.join(' · ')}</Mono> : null}
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
                  <Mono style={styles.detailText}>{n.thought || n.firing ? noteLine(n) : firstLineFromMarkdown(n.content, 320)}</Mono>
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

      <View style={[styles.panel, !desktop && styles.panelOver, desktop && styles.panelDesktop]}>
        {desktop ? (
          <View style={styles.greetBlock}>
            <Greeting />
            <Mono style={styles.greetSub}>WYRD has been thinking while you were away.</Mono>
          </View>
        ) : null}
        <View style={styles.thoughtCard}>
        <View style={styles.thoughtHead}>
          <View style={styles.liveDot} />
          <Mono style={styles.eyebrow}>LAST THOUGHT · {latestNote ? timeAgo(mind?.updatedAt ?? Date.now()) : '—'}</Mono>
        </View>
        <View style={styles.quote}>
          <Mono style={styles.quoteText} numberOfLines={desktop ? undefined : 4}>
            {latestNote ? noteLine(latestNote) : mind?.activeGoal || 'still forming one.'}
          </Mono>
        </View>
        </View>
        <DialogueLauncher onPress={onOpenLink} focus={mind?.focusTopic} />
        {desktop ? (
          <Pressable onPress={() => { location.hash = 'play'; location.reload(); }} style={({ pressed }) => [styles.city, pressed && styles.cityHover]} accessibilityLabel="Play NAIJA 2099">
            <View style={styles.cityBadge} />
            <View style={{ flex: 1 }}>
              <Display style={styles.cityTitle}>NAIJA 2099</Display>
              <Mono style={styles.citySub}>Live your Lagos story, with WYRD as the Authority.</Mono>
            </View>
            <Mono style={styles.cityGo}>Play →</Mono>
          </Pressable>
        ) : null}
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.enter3d, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel="Open the 3D brain"
    >
      <Glyph name="brain" size={34} color={colors.signal} active />
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
  // no box: the brain shows through and fires behind the words; a soft white halo keeps them readable
  hero: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 22 },
  halo: { textShadowColor: 'rgba(255,250,242,0.95)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  eyebrow: { fontSize: 9, letterSpacing: 3, color: colors.greenDim },
  moodValue: { fontSize: 54, lineHeight: 56, color: colors.green, marginTop: 2 },
  focusLine: { marginTop: 6, fontSize: 11, color: colors.greenDim },
  thought: { marginTop: 8, fontSize: 10.5, letterSpacing: 0.6, color: colors.greenDim, maxWidth: 320 },
  thoughtLive: { color: colors.signal },
  onMind: { marginTop: 6, fontSize: 11, letterSpacing: 0.8, color: colors.signal, maxWidth: 360 },
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
  meterFill: { height: '100%', backgroundColor: colors.signal },

  channel: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green,
  },
  channelOn: { backgroundColor: colors.signal },
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
  // phones: translucent cream over the brain, so it fires behind the last thought
  panelOver: { backgroundColor: 'rgba(247,239,226,0.78)' },
  // desktop: the panel becomes a right-hand column
  panelDesktop: {
    width: 360, borderTopWidth: 0, borderLeftWidth: HAIRLINE, borderLeftColor: colors.greenBorder,
    paddingTop: 22, paddingHorizontal: 20, justifyContent: 'flex-start',
  },
  greetBlock: { gap: 4, marginBottom: 4 },
  greet: { fontSize: 32, lineHeight: 38, color: colors.mint },
  greetLang: { fontSize: 10.5, letterSpacing: 1.2, color: colors.signal, fontFamily: fonts.bodyBold, marginTop: 2 },
  greetSub: { fontSize: 14, lineHeight: 20, color: colors.greenDim },
  thoughtCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 22, padding: 18, gap: 10 },
  city: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F7E1B0', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 16 },
  cityHover: { backgroundColor: '#F4D99A' },
  cityBadge: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.signal },
  cityTitle: { fontSize: 18, color: colors.mint, fontFamily: fonts.displayBold },
  citySub: { fontSize: 12.5, color: colors.greenDim, marginTop: 2 },
  cityGo: { fontSize: 13, color: colors.signal, fontFamily: fonts.bodyBold },
  thoughtHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  quote: { paddingVertical: 2 },
  quoteText: { fontSize: 18, lineHeight: 26, color: colors.mint, fontFamily: fonts.display },
});
