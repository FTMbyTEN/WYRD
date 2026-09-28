import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { Mono } from './ui';
import { colors } from '../theme';

const INK = colors.mint;
const DIM = '#9a9a9a';
const FAINT = '#dedede';
const WARN = colors.danger;
const FONT = 'ShareTechMono_400Regular';

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  return `M${a.x} ${a.y} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

/** A 240° dial, like an aircraft instrument: ticks, a limit band, a needle and a readout. */
export function Dial({ label, value, max, unit, digits = 0, limit, size = 150 }: {
  label: string; value: number | null | undefined; max: number; unit: string; digits?: number;
  limit?: number; // beyond this the band turns red
  size?: number;
}) {
  const c = size / 2;
  const r = size / 2 - 12;
  const START = -120;
  const SWEEP = 240;
  const v = value == null ? null : Math.max(0, Math.min(max, value));
  const angle = (x: number) => START + (x / max) * SWEEP;
  const over = v != null && limit != null && v > limit;
  const ticks = 12;
  return (
    <View style={styles.inst}>
      <Svg width={size} height={size * 0.86}>
        <Path d={arc(c, c, r, START, START + SWEEP)} stroke={FAINT} strokeWidth={8} fill="none" />
        {limit != null && <Path d={arc(c, c, r, angle(limit), START + SWEEP)} stroke={WARN} strokeWidth={8} fill="none" opacity={0.35} />}
        {v != null && <Path d={arc(c, c, r, START, Math.max(START + 0.5, angle(v)))} stroke={over ? WARN : INK} strokeWidth={8} fill="none" />}
        {[...Array(ticks + 1)].map((_, i) => {
          const a = START + (i / ticks) * SWEEP;
          const p1 = polar(c, c, r - 8, a);
          const p2 = polar(c, c, r - (i % 3 === 0 ? 17 : 12), a);
          return <Line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={i % 3 === 0 ? INK : DIM} strokeWidth={i % 3 === 0 ? 1.5 : 1} />;
        })}
        {[0, max / 2, max].map((x) => {
          const p = polar(c, c, r - 28, angle(x));
          return <SvgText key={x} x={p.x} y={p.y + 3} fontSize={9} fill={DIM} textAnchor="middle" fontFamily={FONT}>{Math.round(x)}</SvgText>;
        })}
        {v != null && (() => {
          const tip = polar(c, c, r - 14, angle(v));
          const l = polar(c, c, 5, angle(v) - 90);
          const rr = polar(c, c, 5, angle(v) + 90);
          return <Polygon points={`${tip.x},${tip.y} ${l.x},${l.y} ${rr.x},${rr.y}`} fill={over ? WARN : INK} />;
        })()}
        <Circle cx={c} cy={c} r={6} fill="#fff" stroke={INK} strokeWidth={1.5} />
        <SvgText x={c} y={c + 30} fontSize={22} fill={over ? WARN : INK} textAnchor="middle" fontFamily={FONT}>
          {v == null ? '—' : v.toFixed(digits)}
        </SvgText>
        <SvgText x={c} y={c + 44} fontSize={9} fill={DIM} textAnchor="middle" fontFamily={FONT}>{unit}</SvgText>
      </Svg>
      <Mono style={styles.instLabel}>{label}</Mono>
    </View>
  );
}

/** A heading-true compass rose. */
export function Compass({ heading, size = 150 }: { heading: number | null | undefined; size?: number }) {
  const c = size / 2;
  const r = size / 2 - 10;
  const h = heading ?? 0;
  return (
    <View style={styles.inst}>
      <Svg width={size} height={size * 0.86} viewBox={`0 ${size * 0.07} ${size} ${size * 0.86}`}>
        <Circle cx={c} cy={c} r={r} stroke={INK} strokeWidth={1.5} fill="#fff" />
        <G transform={`rotate(${-h} ${c} ${c})`}>
          {[...Array(36)].map((_, i) => {
            const a = i * 10;
            const p1 = polar(c, c, r, a);
            const p2 = polar(c, c, r - (i % 9 === 0 ? 12 : i % 3 === 0 ? 8 : 5), a);
            return <Line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={i % 9 === 0 ? INK : DIM} strokeWidth={i % 9 === 0 ? 1.6 : 1} />;
          })}
          {(['N', 'E', 'S', 'W'] as const).map((d, i) => {
            const p = polar(c, c, r - 22, i * 90);
            return <SvgText key={d} x={p.x} y={p.y + 4} fontSize={12} fill={d === 'N' ? WARN : INK} textAnchor="middle" fontFamily={FONT} transform={`rotate(${i * 90} ${p.x} ${p.y})`}>{d}</SvgText>;
          })}
        </G>
        {/* the aircraft, always pointing up */}
        <Path d={`M${c} ${c - 20} L${c + 12} ${c + 14} L${c} ${c + 7} L${c - 12} ${c + 14} Z`} fill={heading == null ? DIM : INK} />
        <Polygon points={`${c - 6},${c - r - 2} ${c + 6},${c - r - 2} ${c},${c - r + 8}`} fill={INK} />
      </Svg>
      <Mono style={styles.instLabel}>HEADING · {heading == null ? '—' : `${Math.round(h).toString().padStart(3, '0')}°`}</Mono>
    </View>
  );
}

/** Battery as a cell: charge bars, red under the safety floor. */
export function Battery({ pct, floor = 30, takeoff = 50 }: { pct: number | null | undefined; floor?: number; takeoff?: number }) {
  const v = pct == null ? null : Math.max(0, Math.min(100, pct));
  const low = v != null && v < floor;
  const cells = 10;
  return (
    <View style={styles.inst}>
      <View style={styles.battery}>
        <View style={[styles.batteryBody, low && { borderColor: WARN }]}>
          {[...Array(cells)].map((_, i) => {
            const lit = v != null && v >= ((i + 1) / cells) * 100 - 5;
            return <View key={i} style={[styles.cell, lit && { backgroundColor: low ? WARN : INK }]} />;
          })}
        </View>
        <View style={[styles.batteryTip, low && { backgroundColor: WARN }]} />
      </View>
      <Mono style={[styles.bigValue, low && { color: WARN }]}>{v == null ? '—' : `${Math.round(v)}%`}</Mono>
      <Mono style={styles.instLabel}>BATTERY · TAKEOFF ≥{takeoff}% · RTL {'<'}{floor}%</Mono>
    </View>
  );
}

/** Satellites in view, and the fix they give. */
export function Satellites({ count, fix }: { count: number | null | undefined; fix: number | null | undefined }) {
  const n = count ?? 0;
  const ok = (fix ?? 0) >= 3;
  return (
    <View style={styles.inst}>
      <View style={styles.bars}>
        {[...Array(12)].map((_, i) => (
          <View key={i} style={[styles.bar, { height: 10 + i * 3 }, i < n && { backgroundColor: ok ? INK : WARN }]} />
        ))}
      </View>
      <Mono style={[styles.bigValue, !ok && fix != null && { color: WARN }]}>{fix == null ? '—' : ok ? '3D FIX' : 'NO FIX'}</Mono>
      <Mono style={styles.instLabel}>GPS · {count ?? 0} SATELLITES</Mono>
    </View>
  );
}

/** How far out it is against the geofence. */
export function Tether({ distance, fence }: { distance: number | null | undefined; fence: number }) {
  const size = 150;
  const c = size / 2;
  const R = size / 2 - 10;
  const d = distance == null ? null : Math.min(fence * 1.1, distance);
  const near = d != null && d > fence * 0.9;
  return (
    <View style={styles.inst}>
      <Svg width={size} height={size * 0.86} viewBox={`0 ${size * 0.07} ${size} ${size * 0.86}`}>
        {[0.33, 0.66, 1].map((k) => <Circle key={k} cx={c} cy={c} r={R * k} stroke={k === 1 ? INK : FAINT} strokeWidth={k === 1 ? 1.6 : 1} strokeDasharray={k === 1 ? '4 3' : undefined} fill="none" />)}
        {d != null && <Circle cx={c} cy={c} r={(R * d) / fence} stroke={near ? WARN : INK} strokeWidth={3} fill="none" />}
        <Rect x={c - 4} y={c - 4} width={8} height={8} fill={INK} />
        <SvgText x={c} y={c + 22} fontSize={9} fill={DIM} textAnchor="middle" fontFamily={FONT}>HOME</SvgText>
      </Svg>
      <Mono style={[styles.bigValue, near && { color: WARN }]}>{d == null ? '—' : `${Math.round(distance!)} m`}</Mono>
      <Mono style={styles.instLabel}>FROM HOME · FENCE {fence} m</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  inst: { alignItems: 'center', gap: 4, padding: 10, borderWidth: 1, borderColor: '#e2e2e2', backgroundColor: '#fff', minWidth: 150, flexGrow: 1, flexBasis: 150 },
  instLabel: { fontSize: 8.5, letterSpacing: 1.4, color: colors.greenDim, textAlign: 'center' },
  bigValue: { fontSize: 20, color: INK, fontFamily: FONT },
  battery: { flexDirection: 'row', alignItems: 'center', height: 70, marginTop: 20 },
  batteryBody: { flexDirection: 'row', gap: 2, borderWidth: 2, borderColor: INK, padding: 3, height: 38 },
  cell: { width: 9, backgroundColor: '#ececec' },
  batteryTip: { width: 5, height: 16, backgroundColor: INK, marginLeft: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70, marginTop: 20 },
  bar: { width: 7, backgroundColor: '#ececec' },
});
