import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, StyleSheet, TextStyle, View } from 'react-native';
import { Display } from './ui';

const GLYPHS = '!<>-_\\/[]{}=+*^?#01ΔΞΣ░▒▓';
const HOLD_MS = 3200; // how long each word rests before glitching into the next

/**
 * A word that glitches between [words] on a loop: a burst of scrambled glyphs resolving
 * letter by letter into the next word, with instant horizontal tears and a red/blue channel
 * split while it's unstable -- snap cuts, not eased fades, so it reads as signal breaking up.
 */
export function GlitchWord({ words, style: baseStyle, fitChars, onGlitch }: {
  words: string[];
  style?: StyleProp<TextStyle>;
  fitChars?: number;
  /** called as the word starts breaking up into [next] (it settles ~650 ms later) -- for sound */
  onGlitch?: (next: string) => void;
}) {
  const onGlitchRef = useRef(onGlitch);
  onGlitchRef.current = onGlitch;
  const [text, setText] = useState(words[0]);
  const [unstable, setUnstable] = useState(false);
  const tear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    let i = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(() => alive && fn(), ms));

    const glitchTo = (next: string) => {
      onGlitchRef.current?.(next);
      setUnstable(true);
      const from = words[i];
      const len = Math.max(from.length, next.length);
      const steps = 14;
      for (let s = 0; s <= steps; s++) {
        later(() => {
          const settled = Math.floor((s / steps) * len); // letters that have locked in
          let out = '';
          for (let k = 0; k < len; k++) {
            out += k < settled ? (next[k] ?? '') : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          setText(s === steps ? next : out);
          tear.setValue(s === steps ? 0 : (Math.random() - 0.5) * 14); // instant cut, no easing
          if (s === steps) setUnstable(false);
        }, s * 45);
      }
    };

    const cycle = () => {
      later(() => {
        const next = words[(i + 1) % words.length];
        glitchTo(next);
        later(() => {
          i = (i + 1) % words.length;
          cycle();
        }, 14 * 45 + 20);
      }, HOLD_MS);
    };
    cycle();
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [words, tear]);

  // a phrase longer than [fitChars] is set smaller (and tighter) so it still fits the width
  const flat = StyleSheet.flatten(baseStyle) ?? {};
  const scale = fitChars && text.length > fitChars ? Math.max(0.4, fitChars / text.length) : 1;
  const style: StyleProp<TextStyle> = scale === 1 ? baseStyle : [
    baseStyle,
    {
      fontSize: (flat.fontSize ?? 16) * Math.min(1, scale * 1.35),
      letterSpacing: (flat.letterSpacing ?? 0) * scale,
    },
  ];

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {unstable && (
        <>
          <Display style={[style, { position: 'absolute', color: 'rgba(255,40,70,0.55)', transform: [{ translateX: -3 }] }]}>{text}</Display>
          <Display style={[style, { position: 'absolute', color: 'rgba(40,120,255,0.55)', transform: [{ translateX: 3 }] }]}>{text}</Display>
        </>
      )}
      <Animated.View style={{ transform: [{ translateX: tear }] }}>
        <Display style={style}>{text}</Display>
      </Animated.View>
    </View>
  );
}
