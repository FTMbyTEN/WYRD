import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Display, Mono } from './ui';
import { colors } from '../theme';
import { api } from '../api/client';
import { useDreams } from '../api/hooks';
import type { ConceptExample, DreamEntry } from '../api/types';
import { timeAgo } from '../util/time';

const SPACE = '#05060c';
const STARLIGHT = '#e9ecff';
const SOURCE: Record<string, string> = {
  wikipedia: 'from Wikipedia', hackernews: 'from Hacker News', web: 'from the web', self: 'from its own thinking', synthesis: 'a connection it made',
};

function seeded(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/** Where each of a dream's stars sits in its sky: spread out, stable for that dream. */
function constellation(d: DreamEntry) {
  const r = seeded(d.timestamp);
  const n = d.sourceBlockIds.length;
  return d.sourceBlockIds.map((id, i) => {
    const ang = (i / n) * Math.PI * 2 + r() * 0.9;
    const rad = 0.18 + r() * 0.2;
    return { id, x: 0.5 + Math.cos(ang) * rad * 1.3, y: 0.5 + Math.sin(ang) * rad, mag: 0.6 + r() * 0.4 };
  });
}

/** DREAMS: what WYRD dreams while idle, drawn as a cosmos -- each dream a constellation whose
 *  stars are the memories it drifted through. */
export function DreamsCosmos() {
  const { entries } = useDreams(30);
  const dreams = useMemo(() => [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [entries]);
  const [sel, setSel] = useState(0);
  const dream = dreams[sel];
  const [stars, setStars] = useState<ConceptExample[] | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    setStars(null);
    setFocus(null);
    if (dream?.id == null) return;
    let alive = true;
    api.dreamStars(dream.id).then((s) => { if (alive) setStars(s); }).catch(() => { if (alive) setStars([]); });
    return () => { alive = false; };
  }, [dream?.id]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Display style={styles.heading}>{'>_ DREAMS'}</Display>
      <Mono style={styles.sub}>
        When nobody has talked to WYRD for a while, memories from far-apart corners of its mind drift together and it dreams them. Each dream is a constellation: its stars are the memories it was made of. Tap a star to see where it came from.
      </Mono>

      {!dream && <View style={[styles.sky, styles.center]}><Mono style={styles.skyEmpty}>No dreams yet. They only come after a genuine idle stretch.</Mono></View>}
      {dream && <Sky dream={dream} stars={stars} focus={focus} onFocus={setFocus} />}

      {dream && (
        <View style={styles.dreamText}>
          <Mono style={styles.meta}>DREAM · {timeAgo(dream.timestamp)} · {dream.sourceBlockIds.length} STARS</Mono>
          <Display style={styles.dreamBody}>{dream.content}</Display>
          {focus != null && stars?.[focus] && <StarCard star={stars[focus]} />}
        </View>
      )}

      {dreams.length > 1 && (
        <>
          <Mono style={styles.section}>EARLIER DREAMS</Mono>
          {dreams.map((d, i) => (
            <Pressable key={d.timestamp} onPress={() => setSel(i)} style={[styles.row, i === sel && styles.rowOn]}>
              <MiniConstellation d={d} />
              <View style={{ flex: 1 }}>
                <Mono style={styles.meta}>{timeAgo(d.timestamp)}</Mono>
                <Mono style={styles.rowText} numberOfLines={2}>{d.content}</Mono>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Sky({ dream, stars, focus, onFocus }: {
  dream: DreamEntry; stars: ConceptExample[] | null; focus: number | null; onFocus: (i: number) => void;
}) {
  const [w, setW] = useState(0);
  const H = Math.max(300, Math.min(460, w * 0.6));
  const field = useMemo(() => {
    const r = seeded('field');
    return Array.from({ length: 220 }, () => ({ x: r(), y: r(), s: r() < 0.9 ? 0.5 + r() * 0.8 : 1.2 + r() * 1.1, o: 0.25 + r() * 0.7 }));
  }, []);
  const nebulae = useMemo(() => {
    const r = seeded(dream.timestamp + 'nebula');
    return Array.from({ length: 3 }, (_, i) => ({ x: 0.2 + r() * 0.6, y: 0.2 + r() * 0.6, rx: 0.25 + r() * 0.25, hue: ['#6b7cff', '#b06bff', '#6bd6ff'][i] }));
  }, [dream.timestamp]);
  const pts = useMemo(() => constellation(dream), [dream]);

  const twinkle = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = Animated.loop(Animated.sequence([
      Animated.timing(twinkle, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(twinkle, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    t.start();
    return () => t.stop();
  }, [twinkle]);
  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [dream.timestamp, reveal]);

  const X = (v: number) => v * w, Y = (v: number) => v * H;
  const label = (i: number) => {
    const t = stars?.[i]?.title;
    return t ? (t.length > 34 ? `${t.slice(0, 33)}…` : t) : '';
  };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={[styles.sky, { height: H }]}>
      {w > 0 && (
        <Svg width={w} height={H}>
          <Defs>
            {nebulae.map((n, i) => (
              <RadialGradient key={i} id={`neb${i}`} cx={X(n.x)} cy={Y(n.y)} r={X(n.rx)} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={n.hue} stopOpacity={0.22} />
                <Stop offset="1" stopColor={n.hue} stopOpacity={0} />
              </RadialGradient>
            ))}
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={STARLIGHT} stopOpacity={0.9} />
              <Stop offset="1" stopColor={STARLIGHT} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={w} height={H} fill={SPACE} />
          {nebulae.map((_, i) => <Rect key={i} x={0} y={0} width={w} height={H} fill={`url(#neb${i})`} />)}
          {field.map((s, i) => <Circle key={i} cx={X(s.x)} cy={Y(s.y)} r={s.s} fill={STARLIGHT} opacity={s.o} />)}
          {/* constellation lines, in the order the dream drifted through them */}
          {pts.slice(1).map((p, i) => (
            <Line key={`l${i}`} x1={X(pts[i].x)} y1={Y(pts[i].y)} x2={X(p.x)} y2={Y(p.y)} stroke={STARLIGHT} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 5" />
          ))}
          {pts.map((p, i) => (
            <G key={p.id} onPress={() => onFocus(i)}>
              <Circle cx={X(p.x)} cy={Y(p.y)} r={22} fill="transparent" />
              <Circle cx={X(p.x)} cy={Y(p.y)} r={14 * p.mag} fill="url(#glow)" opacity={focus === i ? 0.9 : 0.5} />
              <Circle cx={X(p.x)} cy={Y(p.y)} r={3 + 2 * p.mag} fill={STARLIGHT} />
              {focus === i && <Circle cx={X(p.x)} cy={Y(p.y)} r={12} fill="none" stroke={STARLIGHT} strokeWidth={1} />}
              {!!label(i) && (
                <SvgText x={X(p.x)} y={Y(p.y) + 22} fontSize={10} textAnchor="middle" fill={STARLIGHT} opacity={focus == null || focus === i ? 0.85 : 0.45} fontFamily="ShareTechMono_400Regular">
                  {label(i)}
                </SvgText>
              )}
            </G>
          ))}
        </Svg>
      )}
      {/* a few bright stars breathe */}
      {w > 0 && field.filter((s) => s.s > 1.5).slice(0, 10).map((s, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.twinkle, {
          left: X(s.x) - 3, top: Y(s.y) - 3,
          opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [0.1, 0.9] : [0.9, 0.1] }),
        }]} />
      ))}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: SPACE, opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }) }]} />
      <Mono style={styles.skyHint} pointerEvents="none">tap a star</Mono>
    </View>
  );
}

function StarCard({ star }: { star: ConceptExample }) {
  return (
    <Pressable disabled={!star.url} onPress={() => star.url && Linking.openURL(star.url)} style={styles.starCard}>
      <Mono style={styles.meta}>★ {SOURCE[star.source] ?? star.source} · {timeAgo(star.timestamp)}{star.url ? ' · open ↗' : ''}</Mono>
      <Mono style={styles.starTitle}>{star.title}</Mono>
      {!!star.snippet && <Mono style={styles.starSnippet} numberOfLines={4}>{star.snippet}</Mono>}
    </Pressable>
  );
}

function MiniConstellation({ d }: { d: DreamEntry }) {
  const pts = constellation(d);
  const S = 46;
  return (
    <Svg width={S} height={S}>
      <Rect x={0} y={0} width={S} height={S} fill={SPACE} />
      {pts.slice(1).map((p, i) => <Line key={i} x1={pts[i].x * S} y1={pts[i].y * S} x2={p.x * S} y2={p.y * S} stroke={STARLIGHT} strokeOpacity={0.4} strokeWidth={0.7} />)}
      {pts.map((p) => <Circle key={p.id} cx={p.x * S} cy={p.y * S} r={1.4 + p.mag} fill={STARLIGHT} />)}
    </Svg>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 12, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  heading: { fontSize: 24, color: colors.green },
  sub: { fontSize: 12, lineHeight: 18, color: colors.greenDim },
  sky: { backgroundColor: SPACE, overflow: 'hidden', borderWidth: 1, borderColor: '#1b1e33' },
  center: { height: 240, alignItems: 'center', justifyContent: 'center', padding: 20 },
  skyEmpty: { color: STARLIGHT, opacity: 0.7, fontSize: 12, textAlign: 'center' },
  skyHint: { position: 'absolute', right: 10, bottom: 8, color: STARLIGHT, opacity: 0.4, fontSize: 9, letterSpacing: 1.5 },
  twinkle: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: STARLIGHT },
  dreamText: { gap: 8 },
  meta: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim },
  dreamBody: { fontSize: 17, lineHeight: 27, color: colors.mint, fontStyle: 'italic' },
  starCard: { borderLeftWidth: 3, borderLeftColor: colors.green, paddingLeft: 12, paddingVertical: 6, gap: 3 },
  starTitle: { fontSize: 13, lineHeight: 19, color: colors.mint },
  starSnippet: { fontSize: 11.5, lineHeight: 17, color: colors.greenDim },
  section: { fontSize: 10, letterSpacing: 2, color: colors.greenDim, marginTop: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 8, borderWidth: 1, borderColor: colors.greenBorderDim },
  rowOn: { borderColor: colors.signal },
  rowText: { fontSize: 12, lineHeight: 17, color: colors.mint, marginTop: 2 },
});
