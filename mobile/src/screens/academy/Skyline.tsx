import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';

export type Wing = 'stacks' | 'hall' | 'archive';

export const WINGS: { key: Wing; name: string; what: string }[] = [
  { key: 'stacks', name: 'THE STACKS', what: '75,000 free classics' },
  { key: 'hall', name: 'LECTURE HALL', what: 'Open university textbooks' },
  { key: 'archive', name: 'THE ARCHIVE', what: 'Texts in 15 languages' },
];

const INK = '#111111';
const GREY = '#9a9a9a';

/** The Academy campus at the real local time of day: three buildings you step into -- the
 *  Stacks (Gutenberg's classics), the Lecture Hall (OpenStax textbooks) and the Archive
 *  (Wikisource, with a turning globe). The sun or moon crosses the sky, windows light up after
 *  dark, and a few birds drift over. */
export function Skyline({ wing, onWing, lit }: { wing: Wing; onWing: (w: Wing) => void; lit: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return; // nobody watching
      setT((x) => x + 1);
    }, 110);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const night = hour < 6 || hour >= 19;
  // the sun (or moon) rises at the left and sets at the right
  const arc = night ? ((hour + 24 - 19) % 24) / 11 : (hour - 6) / 13;
  const bodyX = 40 + arc * 820;
  const bodyY = 150 - Math.sin(arc * Math.PI) * 120;

  const stars = useMemo(() => {
    const out: [number, number, number][] = [];
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) out.push([r() * 900, r() * 120, r()]);
    return out;
  }, []);

  const spin = (t % 90) / 90; // the archive's globe turns once every ~7 seconds
  const birds = [0, 1, 2].map((i) => {
    const x = ((t * (1.1 + i * 0.25) + i * 260) % 1100) - 100;
    const y = 50 + i * 16 + Math.sin((t + i * 30) / 12) * 5;
    const flap = Math.sin((t + i * 7) / 2) * 3;
    return `M${x - 7} ${y - flap} Q${x - 3} ${y - 3} ${x} ${y} Q${x + 3} ${y - 3} ${x + 7} ${y - flap}`;
  });

  const ink = night ? '#eeeeee' : INK;
  const paper = night ? '#0d0d0d' : '#ffffff';
  const glow = night ? '#ffffff' : INK; // a lit window: bright at night, inked in by day

  const window = (key: string, x: number, y: number, w: number, h: number, on: boolean, arch = false) => (
    arch
      ? <Path key={key} d={`M${x} ${y + h} V${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} V${y + h} Z`} stroke={ink} strokeWidth={0.9} fill={on ? glow : paper} />
      : <Rect key={key} x={x} y={y} width={w} height={h} stroke={ink} strokeWidth={0.9} fill={on ? glow : paper} />
  );
  let litLeft = night ? 99 : lit; // by night every window glows; by day, one per book on your desk

  const Flag = ({ x, y }: { x: number; y: number }) => (
    <G>
      <Line x1={x} y1={y} x2={x} y2={y - 26} stroke={ink} strokeWidth={1.2} />
      <Path d={`M${x} ${y - 26} q10 ${-3 + Math.sin(t / 5) * 2} 20 0 v11 q-10 ${3 + Math.sin(t / 5) * 2} -20 0 z`} fill={ink} />
    </G>
  );
  const heavy = (w: Wing) => (wing === w ? 1.8 : 1);

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height="100%" viewBox="0 0 900 250" preserveAspectRatio="xMidYMax meet" style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={900} height={250} fill={night ? '#0d0d0d' : '#ffffff'} />
        {night && stars.map(([x, y, b], i) => (
          <Circle key={i} cx={x} cy={y} r={b > 0.9 ? 1.4 : 0.7} fill={paper} opacity={0.35 + 0.65 * Math.abs(Math.sin((t + i * 13) / 18))} />
        ))}
        {/* sun or moon */}
        {night ? (
          <G>
            <Circle cx={bodyX} cy={bodyY} r={13} fill="#f4f4f4" />
            <Circle cx={bodyX + 6} cy={bodyY - 4} r={11} fill="#0d0d0d" />
          </G>
        ) : (
          <G>
            <Circle cx={bodyX} cy={bodyY} r={12} stroke={ink} strokeWidth={1.2} fill={paper} />
            {[...Array(12)].map((_, i) => {
              const a = (i / 12) * Math.PI * 2 + t / 60;
              return <Line key={i} x1={bodyX + Math.cos(a) * 17} y1={bodyY + Math.sin(a) * 17} x2={bodyX + Math.cos(a) * 23} y2={bodyY + Math.sin(a) * 23} stroke={ink} strokeWidth={1} />;
            })}
          </G>
        )}
        {!night && birds.map((d, i) => <Path key={i} d={d} stroke={ink} strokeWidth={1} fill="none" />)}

        <G opacity={night ? 0.96 : 1}>
          {/* ground */}
          <Rect x={0} y={228} width={900} height={22} fill={paper} />
          <Line x1={0} y1={228} x2={900} y2={228} stroke={night ? '#eee' : INK} strokeWidth={1.4} />
          {[...Array(30)].map((_, i) => <Line key={i} x1={i * 31 + 8} y1={236} x2={i * 31 + 20} y2={236} stroke={GREY} strokeWidth={0.7} />)}

          {/* THE STACKS: a tall library with arched windows */}
          <G>
            <Rect x={70} y={92} width={230} height={136} stroke={ink} strokeWidth={heavy('stacks')} fill={paper} />
            <Path d="M60 92 L185 52 L310 92 Z" stroke={ink} strokeWidth={heavy('stacks')} fill={paper} />
            <Circle cx={185} cy={77} r={8} stroke={ink} strokeWidth={1} fill={paper} />
            <Line x1={185} y1={71} x2={185} y2={77} stroke={ink} strokeWidth={1} />
            <Line x1={185} y1={77} x2={189} y2={79} stroke={ink} strokeWidth={1} />
            {[0, 1, 2, 3, 4].map((i) => window(`s${i}`, 88 + i * 42, 108, 22, 38, litLeft-- > 0, true))}
            {[0, 1, 2, 3, 4].map((i) => window(`t${i}`, 88 + i * 42, 162, 22, 38, false, true))}
            <Rect x={170} y={204} width={30} height={24} stroke={ink} strokeWidth={1} fill={paper} />
            {/* books on a shelf in the ground-floor window */}
            {[...Array(9)].map((_, i) => <Rect key={i} x={90 + i * 4} y={188 - (i % 3) * 2} width={3} height={12 + (i % 3) * 2} fill={GREY} />)}
            {wing === 'stacks' && <Flag x={185} y={52} />}
          </G>

          {/* LECTURE HALL: a domed hall with columns */}
          <G>
            <Path d="M372 118 A78 78 0 0 1 528 118 Z" stroke={ink} strokeWidth={heavy('hall')} fill={paper} />
            {[0, 1, 2, 3].map((i) => <Path key={i} d={`M${385 + i * 6} 118 A${65 - i * 6} ${65 - i * 6} 0 0 1 ${515 - i * 6} 118`} stroke={GREY} strokeWidth={0.6} fill="none" />)}
            <Line x1={450} y1={40} x2={450} y2={28} stroke={ink} strokeWidth={1.2} />
            <Circle cx={450} cy={26} r={3} fill={ink} />
            <Rect x={352} y={118} width={196} height={10} stroke={ink} strokeWidth={heavy('hall')} fill={paper} />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <G key={i}>
                <Line x1={364 + i * 29} y1={128} x2={364 + i * 29} y2={210} stroke={ink} strokeWidth={1.1} />
                <Line x1={372 + i * 29} y1={128} x2={372 + i * 29} y2={210} stroke={ink} strokeWidth={1.1} />
              </G>
            ))}
            {[0, 1, 2, 3, 4, 5].map((i) => window(`h${i}`, 380 + i * 29, 150, 12, 26, litLeft-- > 0))}
            <Rect x={344} y={210} width={212} height={8} stroke={ink} strokeWidth={1} fill={paper} />
            <Rect x={336} y={218} width={228} height={10} stroke={ink} strokeWidth={1} fill={paper} />
            {wing === 'hall' && <Flag x={450} y={24} />}
          </G>

          {/* THE ARCHIVE: a tower under a turning globe */}
          <G>
            <Rect x={636} y={110} width={96} height={118} stroke={ink} strokeWidth={heavy('archive')} fill={paper} />
            <Rect x={600} y={160} width={168} height={68} stroke={ink} strokeWidth={heavy('archive')} fill={paper} />
            {[0, 1, 2].map((i) => window(`a${i}`, 650 + i * 26, 124, 16, 22, litLeft-- > 0))}
            {[0, 1, 2, 3, 4].map((i) => window(`b${i}`, 612 + i * 32, 176, 16, 20, litLeft-- > 0))}
            <Path d="M672 228 V206 A12 12 0 0 1 696 206 V228" stroke={ink} strokeWidth={1} fill={paper} />
            {/* the globe */}
            <Line x1={684} y1={110} x2={684} y2={98} stroke={ink} strokeWidth={1.2} />
            <Circle cx={684} cy={72} r={26} stroke={ink} strokeWidth={heavy('archive')} fill={paper} />
            {[0, 1, 2, 3].map((i) => {
              const phase = ((spin + i / 4) % 1) * Math.PI;
              const rx = Math.abs(Math.cos(phase)) * 26;
              return <Ellipse key={i} cx={684} cy={72} rx={rx} ry={26} stroke={i === 0 ? INK : GREY} strokeWidth={0.8} fill="none" />;
            })}
            {[-13, 0, 13].map((dy) => <Line key={dy} x1={684 - Math.sqrt(676 - dy * dy)} y1={72 + dy} x2={684 + Math.sqrt(676 - dy * dy)} y2={72 + dy} stroke={GREY} strokeWidth={0.7} />)}
            <Path d="M656 104 Q684 112 712 104" stroke={ink} strokeWidth={1} fill="none" />
            {wing === 'archive' && <Flag x={746} y={160} />}
          </G>

          {/* trees */}
          {[[30, 1], [330, 0.8], [585, 0.9], [810, 1.1], [860, 0.8]].map(([x, s]) => (
            <G key={x}>
              <Line x1={x} y1={228} x2={x} y2={228 - 22 * s} stroke={ink} strokeWidth={1} />
              <Circle cx={x} cy={228 - 30 * s} r={12 * s} stroke={ink} strokeWidth={1} fill={night ? '#0d0d0d' : '#fff'} />
              <Circle cx={x - 5 * s} cy={228 - 34 * s} r={6 * s} stroke={GREY} strokeWidth={0.6} fill="none" />
            </G>
          ))}
        </G>
      </Svg>
      {/* tap a building to step inside (Pressables: SVG press handlers are unreliable on the web) */}
      {([["stacks", 6.5, 28], ["hall", 37, 26], ["archive", 66, 20]] as [Wing, number, number][]).map(([w, left, width]) => (
        <Pressable key={w} onPress={() => onWing(w)} accessibilityLabel={WINGS.find((x) => x.key === w)!.name} style={{ position: "absolute", top: 0, bottom: 0, left: `${left}%`, width: `${width}%` }} />
      ))}
    </View>
  );
}

/** The three doors under the skyline. */
export function WingDoors({ wing, onWing }: { wing: Wing; onWing: (w: Wing) => void }) {
  return (
    <View style={styles.doors}>
      {WINGS.map((w) => {
        const on = w.key === wing;
        return (
          <Pressable key={w.key} onPress={() => onWing(w.key)} style={({ pressed }) => [styles.door, on && styles.doorOn, pressed && { opacity: 0.8 }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Mono style={[styles.doorName, on && { color: '#fff' }]}>{w.name}</Mono>
            <Mono style={[styles.doorWhat, on && { color: '#ddd' }]}>{w.what}</Mono>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', aspectRatio: 900 / 250, borderWidth: 1, borderColor: colors.mint, overflow: 'hidden' },
  doors: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.mint },
  door: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2, borderRightWidth: 1, borderRightColor: colors.greenBorderDim, backgroundColor: '#fff' },
  doorOn: { backgroundColor: colors.mint },
  doorName: { fontSize: 11, letterSpacing: 2, color: colors.mint },
  doorWhat: { fontSize: 9, color: colors.greenDim, textAlign: 'center' },
});
