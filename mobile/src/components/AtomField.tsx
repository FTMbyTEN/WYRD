import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G } from 'react-native-svg';

function seeded(n: number) {
  let h = n * 2654435761;
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

type Atom = { x: number; y: number; r: number; tilt: number; electrons: number; o: number };

/** A layer of tiny atoms: a nucleus, a faint orbit or two, electrons on them. */
function Layer({ atoms, w, h }: { atoms: Atom[]; w: number; h: number }) {
  return (
    <Svg width={w} height={h}>
      {atoms.map((a, i) => {
        const cx = a.x * w, cy = a.y * h;
        return (
          <G key={i} opacity={a.o} rotation={a.tilt} origin={`${cx}, ${cy}`}>
            <Ellipse cx={cx} cy={cy} rx={a.r} ry={a.r * 0.38} fill="none" stroke="#000" strokeWidth={0.5} strokeOpacity={0.35} />
            {a.electrons > 1 && (
              <Ellipse cx={cx} cy={cy} rx={a.r * 0.38} ry={a.r} fill="none" stroke="#000" strokeWidth={0.5} strokeOpacity={0.25} />
            )}
            <Circle cx={cx} cy={cy} r={Math.max(0.9, a.r * 0.16)} fill="#000" />
            <Circle cx={cx + a.r} cy={cy} r={0.8} fill="#000" />
            {a.electrons > 1 && <Circle cx={cx} cy={cy - a.r} r={0.8} fill="#000" />}
          </G>
        );
      })}
    </Svg>
  );
}

/**
 * The entry screen's background: tiny atoms scattered everywhere, in three depth layers that
 * drift slowly at different speeds and turn gently, so the field feels alive without pulling
 * attention from the wordmark. Pointer-transparent.
 */
export function AtomField() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const layers = useMemo(() => [0, 1, 2].map((l) => {
    const r = seeded(l + 7);
    const count = [70, 45, 22][l];
    return Array.from({ length: count }, () => ({
      x: r() * 1.1 - 0.05,
      y: r() * 1.1 - 0.05,
      r: [2.2, 3.5, 5.5][l] * (0.7 + r() * 0.6),
      tilt: r() * 180,
      electrons: r() < 0.45 ? 2 : 1,
      o: [0.22, 0.32, 0.42][l] * (0.6 + r() * 0.4),
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
      {size.w > 0 && layers.map((atoms, l) => (
        <Animated.View key={l} style={[StyleSheet.absoluteFill, {
          transform: [
            { translateX: drift[l].interpolate({ inputRange: [0, 1], outputRange: [-8 * (l + 1), 8 * (l + 1)] }) },
            { translateY: drift[l].interpolate({ inputRange: [0, 1], outputRange: [5 * (l + 1), -5 * (l + 1)] }) },
            { rotate: drift[l].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${l % 2 ? -3 : 3}deg`] }) },
          ],
        }]}>
          <Layer atoms={atoms} w={size.w} h={size.h} />
        </Animated.View>
      ))}
    </View>
  );
}
