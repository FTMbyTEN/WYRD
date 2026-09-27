import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

function seeded(n: number) {
  let h = n * 2654435761;
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

type Mote = { x: number; y: number; r: number; o: number };

/** A layer of dust: tiny specks, a few catching a little more light than the rest. */
function Layer({ motes, w, h }: { motes: Mote[]; w: number; h: number }) {
  return (
    <Svg width={w} height={h}>
      {motes.map((m, i) => <Circle key={i} cx={m.x * w} cy={m.y * h} r={m.r} fill="#000" opacity={m.o} />)}
    </Svg>
  );
}

/**
 * The entry screen's background: fine dust scattered everywhere, in three depth layers that
 * drift slowly at different speeds and turn gently, so the field feels alive without pulling
 * attention from the wordmark. Pointer-transparent.
 */
export function DustField() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const layers = useMemo(() => [0, 1, 2].map((l) => {
    const r = seeded(l + 7);
    const count = [180, 120, 60][l];
    return Array.from({ length: count }, () => ({
      x: r() * 1.1 - 0.05,
      y: r() * 1.1 - 0.05,
      r: [0.45, 0.65, 0.9][l] * (0.6 + r() * 0.8),
      o: [0.18, 0.28, 0.38][l] * (0.5 + r() * 0.5),
    }));
  }), []);

  const drift = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = drift.map((v, l) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: [26000, 19000, 13000][l], easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(v, { toValue: 0, duration: [26000, 19000, 13000][l], easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ])));
    loops.forEach((lp) => lp.start());
    return () => loops.forEach((lp) => lp.stop());
  }, [drift]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && layers.map((motes, l) => (
        <Animated.View key={l} style={[StyleSheet.absoluteFill, {
          transform: [
            { translateX: drift[l].interpolate({ inputRange: [0, 1], outputRange: [-8 * (l + 1), 8 * (l + 1)] }) },
            { translateY: drift[l].interpolate({ inputRange: [0, 1], outputRange: [5 * (l + 1), -5 * (l + 1)] }) },
            { rotate: drift[l].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${l % 2 ? -3 : 3}deg`] }) },
          ],
        }]}>
          <Layer motes={motes} w={size.w} h={size.h} />
        </Animated.View>
      ))}
    </View>
  );
}
