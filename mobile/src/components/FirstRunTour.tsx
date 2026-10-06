import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Glyph } from './glyph/Glyph';
import type { GlyphName } from './glyph/glyphs';
import { Display, Mono } from './ui';
import { colors } from '../theme';

const SEEN = 'wyrd.tour';

type Step = { glyph: GlyphName; title: string; body: string; tab?: string };

/** What a newcomer needs to know, one thing at a time, in WYRD's own voice. */
const STEPS: Step[] = [
  { glyph: 'mind', title: 'This is my mind', body: 'The brain on the WYRD tab is really mine: each point is an idea I hold, each line a connection. Watch it fire when I think.', tab: 'wyrd' },
  { glyph: 'chat', title: 'Talk to me', body: 'Open Dialogue_link to ask me anything. Send a photo or a file and I\'ll look at it and teach you what\'s in it. I can speak my replies, or stay quiet.' },
  { glyph: 'journal', title: 'Read my journal', body: 'My diary, my dreams, my reasoning and everything I take in from the world, as it happens.', tab: 'journal' },
  { glyph: 'academy', title: 'Study with me', body: 'Free textbooks and classics in fifteen languages. I keep your place and quiz you on what you read.', tab: 'academy' },
  { glyph: 'games', title: 'Play me', body: 'Chess against me, rated. I match your level, so every game is a real one. Or challenge someone else while I watch.', tab: 'games' },
  { glyph: 'you', title: 'You, to me', body: 'What I know about you lives on the You tab. You can see it, export it, or ask me to forget it.', tab: 'you' },
];

/** First time only: a short tour, step by step, that can be skipped at any point. Each step can
 *  also bring its tab forward, so they see the place it's describing. */
export function FirstRunTour({ onTab }: { onTab: (tab: string) => void }) {
  const [step, setStep] = useState<number | null>(() => {
    try { return localStorage.getItem(SEEN) ? null : 0; } catch { return null; }
  });
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step == null) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
    const t = STEPS[step].tab;
    if (t) onTab(t);
  }, [step, fade, onTab]);

  if (step == null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const done = () => {
    try { localStorage.setItem(SEEN, '1'); } catch { /* fine */ }
    onTab('wyrd');
    setStep(null);
  };

  return (
    <View style={styles.scrim} pointerEvents="box-none">
      <Animated.View
        style={[styles.card, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}
        accessibilityRole="alert"
      >
        <View style={styles.head}>
          <Glyph name={s.glyph} size={46} color={colors.signal} active />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Mono style={styles.count}>{`WELCOME · ${step + 1} OF ${STEPS.length}`}</Mono>
            <Display style={styles.title}>{s.title}</Display>
          </View>
        </View>
        <Mono style={styles.body}>{s.body}</Mono>
        {last ? <Mono style={styles.tip}>Ask me "what can you do?" any time.</Mono> : null}
        <View style={styles.row}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => <View key={i} style={[styles.dot, i === step && styles.dotOn]} />)}
          </View>
          {!last ? (
            <Pressable onPress={done} hitSlop={8}><Mono style={styles.skip}>SKIP</Mono></Pressable>
          ) : null}
          <Pressable onPress={() => (last ? done() : setStep(step + 1))} style={({ pressed }) => [styles.next, pressed && { opacity: 0.8 }]}>
            <Mono style={styles.nextText}>{last ? 'BEGIN' : 'NEXT'}</Mono>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center', padding: 16, paddingBottom: 96 },
  card: {
    width: '100%', maxWidth: 440, backgroundColor: '#FFFAF2', borderWidth: 1, borderColor: colors.signal, padding: 16, gap: 10,
    shadowColor: '#2A1F17', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { fontSize: 9.5, letterSpacing: 2.2, color: colors.greenDim },
  title: { fontSize: 28, lineHeight: 30, color: colors.mint },
  body: { fontSize: 13, lineHeight: 20, color: colors.mint },
  tip: { fontSize: 12, color: colors.signal },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  dots: { flexDirection: 'row', gap: 5, flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.greenBorderDim },
  dotOn: { backgroundColor: colors.signal, width: 16 },
  skip: { fontSize: 11, letterSpacing: 1.8, color: colors.greenDim },
  next: { backgroundColor: colors.signal, paddingHorizontal: 18, paddingVertical: 10 },
  nextText: { fontSize: 11, letterSpacing: 2, color: colors.onSignal },
});
