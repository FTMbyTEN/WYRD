import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';

/** A progress ring: how far through a book. */
export function ProgressRing({ value, size = 64, stroke = 5, color = colors.mint, track = colors.greenBorderDim, label = true }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; label?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c * v} ${c}`} strokeLinecap="butt" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label && <Display style={{ fontSize: size * 0.3, color }}>{Math.round(v * 100)}<Display style={{ fontSize: size * 0.16, color }}>%</Display></Display>}
    </View>
  );
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A barcode drawn from [seed]: the same student always gets the same one. */
export function Barcode({ seed, width = 150, height = 34, color = '#fff' }: { seed: string; width?: number; height?: number; color?: string }) {
  let h = hash(seed) || 1;
  const bars: [number, number][] = [];
  let x = 0;
  while (x < width) {
    h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345;
    const w = 1 + ((h >>> 3) % 3);
    if ((h >>> 7) % 3 !== 0) bars.push([x, w]);
    x += w + 1 + ((h >>> 11) % 2);
  }
  return (
    <Svg width={width} height={height}>
      {bars.map(([bx, bw], i) => <Rect key={i} x={bx} y={0} width={bw} height={height} fill={color} />)}
    </Svg>
  );
}

/** The student's library card: who they are to the Academy and how their reading is going. */
export function LibraryCard({ name, id, stats }: { name: string; id: string; stats: [string, string][] }) {
  const no = String(hash(id) % 100000000).padStart(8, '0');
  return (
    <View style={card.wrap}>
      <View style={card.top}>
        <View style={card.seal}>
          <Svg width={26} height={26} viewBox="0 0 20 20">
            <Path d="M2 7.5 L10 3 L18 7.5 Z" stroke="#fff" strokeWidth={1.4} fill="none" />
            <Line x1="3" y1="17" x2="17" y2="17" stroke="#fff" strokeWidth={1.4} />
            {[4.5, 8.2, 11.8, 15.5].map((x) => <Line key={x} x1={x} y1="9.5" x2={x} y2="15" stroke="#fff" strokeWidth={1.4} />)}
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Mono style={card.brand}>WYRD ACADEMY</Mono>
          <Mono style={card.kind}>LIBRARY CARD · FREE FOR EVERY STUDENT</Mono>
        </View>
      </View>
      <Display numberOfLines={1} style={card.name}>{name}</Display>
      <View style={card.stats}>
        {stats.map(([v, k]) => (
          <View key={k} style={card.stat}>
            <Display style={card.v}>{v}</Display>
            <Mono style={card.k}>{k}</Mono>
          </View>
        ))}
      </View>
      <View style={card.bottom}>
        <Barcode seed={id} width={140} height={26} />
        <Mono style={card.no}>No. {no.slice(0, 4)} {no.slice(4)}</Mono>
      </View>
    </View>
  );
}

const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#0f0f0f', padding: 16, gap: 10, minWidth: 300, maxWidth: 420, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
  },
  top: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  seal: { width: 38, height: 38, borderWidth: 1, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#fff', fontSize: 12, letterSpacing: 3 },
  kind: { color: '#8a8a8a', fontSize: 8, letterSpacing: 1.6 },
  name: { color: '#fff', fontSize: 30, lineHeight: 34 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderTopWidth: 1, borderTopColor: '#2c2c2c', paddingTop: 10 },
  stat: { minWidth: 56 },
  v: { color: '#fff', fontSize: 24 },
  k: { color: '#8a8a8a', fontSize: 8, letterSpacing: 1.4 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 },
  no: { color: '#8a8a8a', fontSize: 9, letterSpacing: 1.6 },
});
