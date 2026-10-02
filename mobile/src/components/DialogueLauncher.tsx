import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Mono } from './ui';
import { colors } from '../theme';
import { Glyph } from './glyph/Glyph';

const TYPE_MS = 45;
const HOLD_MS = 1800;
const ERASE_MS = 18;

/**
 * The home screen's way into DIALOGUE_LINK: a terminal prompt that types out things you could ask
 * WYRD right now (the first built from what it's focused on), with a blinking cursor and a
 * "listening" pulse. Tapping anywhere opens the conversation.
 */
export function DialogueLauncher({ onPress, focus }: { onPress: () => void; focus?: string | null }) {
  const prompts = useMemo(
    () => [
      focus ? `what have you figured out about ${focus}?` : 'what are you thinking about?',
      'what did you learn today?',
      'build me a tip calculator',
      'plan a drone flight around the field',
      'show me where Lagos is on the globe',
      'what do you remember about me?',
    ],
    [focus],
  );
  const text = useTypewriter(prompts);

  const blink = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    b.start();
    p.start();
    return () => {
      b.stop();
      p.stop();
    };
  }, [blink, pulse]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open DIALOGUE_LINK and talk to WYRD"
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.liveWrap}>
          <Animated.View
            style={[
              styles.ring,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
              },
            ]}
          />
          <View style={styles.dot} />
        </View>
        <Mono style={styles.label}>DIALOGUE_LINK · WYRD IS LISTENING</Mono>
      </View>

      <View style={styles.promptRow}>
        <Mono style={styles.chevron}>{'>'}</Mono>
        <View style={styles.typed}>
          <Mono numberOfLines={1} style={styles.typedText}>{text}</Mono>
          <Animated.View style={[styles.cursor, { opacity: blink }]} />
        </View>
        <View style={styles.send}>
          <Glyph name="arrow" size={17} color={colors.green} />
        </View>
      </View>
    </Pressable>
  );
}

/** Types each prompt out, holds it, erases it, moves to the next -- forever. */
function useTypewriter(prompts: string[]) {
  const [text, setText] = useState('');
  useEffect(() => {
    let i = 0;
    let pos = 0;
    let erasing = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const full = prompts[i % prompts.length];
      if (!erasing) {
        pos += 1;
        setText(full.slice(0, pos));
        if (pos >= full.length) {
          erasing = true;
          timer = setTimeout(step, HOLD_MS);
          return;
        }
        timer = setTimeout(step, TYPE_MS + Math.random() * 40);
      } else {
        pos -= 1;
        setText(full.slice(0, Math.max(0, pos)));
        if (pos <= 0) {
          erasing = false;
          i += 1;
          timer = setTimeout(step, 350);
          return;
        }
        timer = setTimeout(step, ERASE_MS);
      }
    };
    timer = setTimeout(step, 400);
    return () => clearTimeout(timer);
  }, [prompts]);
  return text;
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.green, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 8 },
  pressed: { opacity: 0.85 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.black },
  ring: { position: 'absolute', width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: colors.black },
  label: { fontSize: 8.5, letterSpacing: 2, color: colors.greenBorderDim },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chevron: { fontSize: 16, color: colors.black },
  typed: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  typedText: { flexShrink: 1, fontSize: 13.5, color: colors.black },
  cursor: { width: 8, height: 15, marginLeft: 2, backgroundColor: colors.black },
  send: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.black,
    alignItems: 'center', justifyContent: 'center',
  },
});
