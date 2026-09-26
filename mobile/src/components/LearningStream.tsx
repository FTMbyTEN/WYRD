import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Mono } from './ui';
import { colors } from '../theme';

interface Particle {
  id: number;
  word: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: Animated.Value;
}

const SPAWN_MS = 260;
const FLIGHT_MS = 2600;
const MAX_LIVE = 16;

/**
 * Words WYRD is taking in right now, streaming from the edges of the brain into its core.
 * [words] is newest-first; whenever it changes, the stream restarts from the newest word so a
 * fresh ingest or thought visibly flies in first. Only runs while [active].
 */
export function LearningStream({ words, active }: { words: string[]; active: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const nextId = useRef(0);
  const cursor = useRef(0);
  const wordsKey = words.join('|');

  useEffect(() => {
    cursor.current = 0;
  }, [wordsKey]);

  useEffect(() => {
    if (!active || words.length === 0 || size.width === 0) return;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const outer = Math.max(size.width, size.height) * 0.55;
    const inner = Math.min(size.width, size.height) * 0.12;

    const spawn = () => {
      const word = words[cursor.current % words.length];
      cursor.current += 1;
      const a = Math.random() * Math.PI * 2;
      const b = a + (Math.random() - 0.5) * 1.2;
      const p: Particle = {
        id: nextId.current++,
        word,
        fromX: cx + Math.cos(a) * outer,
        fromY: cy + Math.sin(a) * outer,
        toX: cx + Math.cos(b) * inner * Math.random(),
        toY: cy + Math.sin(b) * inner * Math.random(),
        progress: new Animated.Value(0),
      };
      setParticles((prev) => [...prev.slice(-(MAX_LIVE - 1)), p]);
      Animated.timing(p.progress, {
        toValue: 1,
        duration: FLIGHT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setParticles((prev) => prev.filter((q) => q.id !== p.id)));
    };

    spawn();
    const id = setInterval(spawn, SPAWN_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, wordsKey, size.width, size.height]);

  useEffect(() => {
    if (!active) setParticles([]);
  }, [active]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {particles.map((p) => (
        <Animated.View
          key={p.id}
          style={[
            styles.particle,
            {
              opacity: p.progress.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 0.9, 0] }),
              transform: [
                { translateX: p.progress.interpolate({ inputRange: [0, 1], outputRange: [p.fromX, p.toX] }) },
                { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [p.fromY, p.toY] }) },
                { scale: p.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) },
              ],
            },
          ]}
        >
          <Mono style={styles.word}>{p.word}</Mono>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', left: 0, top: 0 },
  word: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.green,
    backgroundColor: colors.black, // white chip so words stay legible over the mesh
    paddingHorizontal: 3,
  },
});
