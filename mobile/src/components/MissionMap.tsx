import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Pattern, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Display, Mono } from './ui';
import { colors } from '../theme';
import type { DroneMission, DroneState } from '../api/types';

// Mirrors the server's DroneSafety limits (wyrd_server/lib/src/drone/drone_safety.dart).
export const FENCE_M = 300;
const RINGS_M = [50, 100, 200, 300];
const TRAIL_MAX = 400;
const EARTH_R = 6371000;
const FONT = 'ShareTechMono_400Regular';

type Step = { type: string; lat?: number; lon?: number; altitudeM?: number };

/** Metres north/east of home -- flat-earth, fine inside the fence. */
export function toLocal(lat: number, lon: number, homeLat: number, homeLon: number) {
  const north = ((lat - homeLat) * Math.PI / 180) * EARTH_R;
  const east = ((lon - homeLon) * Math.PI / 180) * EARTH_R * Math.cos((homeLat * Math.PI) / 180);
  return { north, east };
}

function parseSteps(mission?: DroneMission): Step[] {
  if (!mission) return [];
  try {
    return JSON.parse(mission.stepsJson) as Step[];
  } catch {
    return [];
  }
}

function stepLabel(step: Step, waypointNo: number | null) {
  switch (step.type) {
    case 'takeoff': return `TAKEOFF ${step.altitudeM ?? ''}m`.trim();
    case 'goto': return `WP${waypointNo}`;
    case 'rtl': return 'HOME';
    case 'land': return 'LAND';
    case 'hold': return 'HOLD';
    default: return step.type.toUpperCase();
  }
}

/**
 * The DRONE tab's tactical display: a radar-style top-down view centred on home (range rings,
 * compass, sweep, shaded no-fly zone beyond the fence), the planned route with flown legs solid
 * and remaining legs dashed, the drone as a heading-true quad icon with its flown trail, corner
 * readouts, and a step-by-step mission progress strip underneath.
 */
export function MissionMap({ state, mission }: { state: DroneState | null | undefined; mission?: DroneMission }) {
  const [size, setSize] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setSize(Math.min(e.nativeEvent.layout.width - 2, 460));

  const hasHome = state?.homeLat != null && state?.homeLon != null;
  const steps = useMemo(() => parseSteps(mission), [mission]);
  const running = mission && ['sent', 'running'].includes(mission.status) && state?.missionStatus === 'running';
  const finished = mission?.status === 'done' || state?.missionStatus === 'done';
  // missionStep is 1-based and names the step being executed
  const currentIdx = running ? Math.max(0, (state?.missionStep ?? 1) - 1) : finished ? steps.length : -1;

  // flown trail, kept while the tab is open
  const trail = useRef<{ n: number; e: number }[]>([]);
  const local = hasHome && state?.lat != null && state?.lon != null ? toLocal(state.lat, state.lon, state.homeLat!, state.homeLon!) : null;
  useEffect(() => {
    if (!local || !state?.armed) return;
    const last = trail.current[trail.current.length - 1];
    if (!last || Math.hypot(last.n - local.north, last.e - local.east) > 0.8) {
      trail.current = [...trail.current.slice(-TRAIL_MAX), { n: local.north, e: local.east }];
    }
  }, [local?.north, local?.east, state?.armed]); // eslint-disable-line react-hooks/exhaustive-deps

  // radar sweep + pulses
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const s = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    const p = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    s.start();
    p.start();
    return () => { s.stop(); p.stop(); };
  }, [sweep, pulse]);

  const c = size / 2;
  // auto-zoom: the smallest ring that holds home, the route, the drone and its trail
  const reach = Math.max(
    0,
    ...steps.map((st) => (hasHome && st.lat != null && st.lon != null ? Math.hypot(...Object.values(toLocal(st.lat, st.lon, state!.homeLat!, state!.homeLon!))) : 0)),
    ...trail.current.map((t) => Math.hypot(t.n, t.e)),
    local ? Math.hypot(local.north, local.east) : 0,
  );
  const viewR = RINGS_M.find((m) => m >= reach * 1.2) ?? FENCE_M;
  const scale = (size / 2 - 22) / viewR;
  const scaleBarM = viewR <= 50 ? 10 : viewR <= 100 ? 25 : 50;
  const xy = (n: number, e: number) => ({ x: c + e * scale, y: c - n * scale });

  const waypoints = hasHome
    ? steps.map((s, i) => ({ i, s, p: s.type === 'goto' && s.lat != null && s.lon != null ? toLocal(s.lat, s.lon, state!.homeLat!, state!.homeLon!) : null }))
    : [];
  // route points in step order: home, each waypoint, back home if the plan returns
  const routePts = [{ i: -1, n: 0, e: 0 }, ...waypoints.filter((w) => w.p).map((w) => ({ i: w.i, n: w.p!.north, e: w.p!.east }))];
  if (steps.some((s) => s.type === 'rtl')) routePts.push({ i: steps.findIndex((s) => s.type === 'rtl'), n: 0, e: 0 });

  const target = running ? waypoints.find((w) => w.i === currentIdx && w.p)?.p ?? (steps[currentIdx]?.type === 'rtl' ? { north: 0, east: 0 } : null) : null;
  const toTarget = target && local ? Math.hypot(target.north - local.north, target.east - local.east) : null;
  const heading = state?.headingDeg ?? 0;
  const drone = local ? xy(local.north, local.east) : null;
  let wpNo = 0;
  const labels = steps.map((s) => stepLabel(s, s.type === 'goto' ? ++wpNo : null));

  const status = !state?.connected ? 'OFFLINE' : state.armed ? 'ARMED' : 'ON GROUND';

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox} onLayout={onLayout}>
        {size > 0 && (
          <View style={{ width: size, height: size, alignSelf: 'center' }}>
            <Svg width={size} height={size}>
              <Defs>
                <Pattern id="nofly" patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
                  <Line x1={0} y1={0} x2={0} y2={7} stroke={colors.greenBorderDim} strokeWidth={1} />
                </Pattern>
                <Pattern id="dots" patternUnits="userSpaceOnUse" width={16} height={16}>
                  <Circle cx={8} cy={8} r={0.7} fill={colors.greenBorderDim} />
                </Pattern>
              </Defs>

              {/* no-fly zone outside the fence, dot grid inside */}
              <Rect x={0} y={0} width={size} height={size} fill="url(#nofly)" />
              <Circle cx={c} cy={c} r={viewR * scale} fill={colors.black} />
              <Circle cx={c} cy={c} r={viewR * scale} fill="url(#dots)" />

              {/* range rings */}
              {RINGS_M.filter((m) => m <= viewR).map((m) => (
                <G key={m}>
                  <Circle
                    cx={c} cy={c} r={m * scale} fill="none"
                    stroke={m === viewR ? colors.green : colors.greenBorderDim}
                    strokeWidth={m === viewR ? 1.6 : 1}
                    strokeDasharray={m === viewR ? undefined : '2 4'}
                  />
                  <SvgText x={c + 4} y={c - m * scale - 3} fontSize={8} fontFamily={FONT} fill={colors.greenDim}>
                    {m === FENCE_M ? `${m} m · FENCE` : `${m} m`}
                  </SvgText>
                </G>
              ))}

              {/* compass */}
              {Array.from({ length: 36 }, (_, k) => {
                const a = (k * 10 * Math.PI) / 180;
                const r1 = viewR * scale;
                const r2 = r1 + (k % 9 === 0 ? 10 : k % 3 === 0 ? 6 : 3);
                return (
                  <Line key={k} x1={c + Math.sin(a) * r1} y1={c - Math.cos(a) * r1} x2={c + Math.sin(a) * r2} y2={c - Math.cos(a) * r2}
                    stroke={k % 9 === 0 ? colors.green : colors.greenBorder} strokeWidth={k % 9 === 0 ? 1.4 : 1} />
                );
              })}
              {(['N', 'E', 'S', 'W'] as const).map((d, k) => {
                const a = (k * 90 * Math.PI) / 180;
                const r = viewR * scale + 16;
                return (
                  <SvgText key={d} x={c + Math.sin(a) * r} y={c - Math.cos(a) * r + 3} fontSize={10} fontFamily={FONT} fill={colors.green} textAnchor="middle">
                    {d}
                  </SvgText>
                );
              })}
              <Line x1={c - 5} y1={c} x2={c + 5} y2={c} stroke={colors.greenBorder} />
              <Line x1={c} y1={c - 5} x2={c} y2={c + 5} stroke={colors.greenBorder} />

              {/* planned route: flown legs solid, remaining dashed */}
              {routePts.slice(1).map((p, k) => {
                const a = xy(routePts[k].n, routePts[k].e);
                const b = xy(p.n, p.e);
                const flown = currentIdx > p.i || (finished && p.i >= 0);
                return (
                  <Line key={`leg-${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={flown ? colors.green : colors.greenDim} strokeWidth={flown ? 1.8 : 1.2}
                    strokeDasharray={flown ? undefined : '5 4'} />
                );
              })}

              {/* flown trail */}
              {trail.current.length > 1 && (
                <Polyline points={trail.current.map((t) => { const p = xy(t.n, t.e); return `${p.x},${p.y}`; }).join(' ')}
                  stroke={colors.green} strokeOpacity={0.35} strokeWidth={3} fill="none" />
              )}

              {/* waypoints */}
              {waypoints.filter((w) => w.p).map((w, k) => {
                const p = xy(w.p!.north, w.p!.east);
                const done = currentIdx > w.i || finished;
                const current = w.i === currentIdx && running;
                return (
                  <G key={`wp-${w.i}`}>
                    <Rect x={p.x - 7} y={p.y - 7} width={14} height={14} rotation={45} origin={`${p.x}, ${p.y}`}
                      fill={done || current ? colors.green : colors.black} stroke={colors.green} strokeWidth={1.4} />
                    <SvgText x={p.x} y={p.y + 3} fontSize={8} fontFamily={FONT} fill={done || current ? colors.black : colors.green} textAnchor="middle">
                      {k + 1}
                    </SvgText>
                  </G>
                );
              })}

              {/* home */}
              <Circle cx={c} cy={c} r={9} fill={colors.black} stroke={colors.green} strokeWidth={1.4} />
              <SvgText x={c} y={c + 3.5} fontSize={9} fontFamily={FONT} fill={colors.green} textAnchor="middle">H</SvgText>
            </Svg>

            {/* rotating radar sweep */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
              <Svg width={size} height={size}>
                {Array.from({ length: 14 }, (_, k) => {
                  const a = (-k * 2.2 * Math.PI) / 180;
                  const r = viewR * scale;
                  return <Line key={k} x1={c} y1={c} x2={c + Math.sin(a) * r} y2={c - Math.cos(a) * r} stroke={colors.green} strokeOpacity={0.16 - k * 0.011} strokeWidth={3} />;
                })}
              </Svg>
            </Animated.View>

            {/* current target pulse */}
            {target && (
              <PulseRing pulse={pulse} x={xy(target.north, target.east).x} y={xy(target.north, target.east).y} base={10} />
            )}

            {/* the drone */}
            {drone && (
              <>
                {state?.armed && <PulseRing pulse={pulse} x={drone.x} y={drone.y} base={14} />}
                <View pointerEvents="none" style={[styles.drone, { left: drone.x - 14, top: drone.y - 14, transform: [{ rotate: `${heading}deg` }] }]}>
                  <Svg width={28} height={28} viewBox="0 0 28 28">
                    <Line x1="7" y1="7" x2="21" y2="21" stroke={colors.green} strokeWidth={2} />
                    <Line x1="21" y1="7" x2="7" y2="21" stroke={colors.green} strokeWidth={2} />
                    {[[6, 6], [22, 6], [6, 22], [22, 22]].map(([x, y]) => (
                      <Circle key={`${x}${y}`} cx={x} cy={y} r="4.2" fill={colors.black} stroke={colors.green} strokeWidth={1.6} />
                    ))}
                    <Rect x="11" y="11" width="6" height="6" fill={colors.green} />
                    <Path d="M14 1 L17 6 L11 6 Z" fill={colors.green} />
                  </Svg>
                </View>
              </>
            )}

            {/* corner readouts */}
            <View style={[styles.corner, { top: 8, left: 8 }]} pointerEvents="none">
              <Mono style={styles.cornerLabel}>MODE</Mono>
              <Mono style={styles.cornerValue}>{state?.mode ?? '—'}</Mono>
              <Mono style={styles.cornerSub}>{status}</Mono>
            </View>
            <View style={[styles.corner, styles.right, { top: 8, right: 8 }]} pointerEvents="none">
              <Mono style={styles.cornerLabel}>ALT · SPD</Mono>
              <Mono style={styles.cornerValue}>{state?.relativeAltM != null ? `${state.relativeAltM.toFixed(1)} m` : '—'}</Mono>
              <Mono style={styles.cornerSub}>{state?.groundSpeedMs != null ? `${state.groundSpeedMs.toFixed(1)} m/s` : '—'}</Mono>
            </View>
            <View style={[styles.corner, { bottom: 8, left: 8 }]} pointerEvents="none">
              <View style={[styles.scaleBar, { width: scaleBarM * scale }]} />
              <Mono style={styles.cornerSub}>{scaleBarM} m{viewR < FENCE_M ? ` · fence ${FENCE_M} m` : ''}</Mono>
            </View>
            <View style={[styles.corner, styles.right, { bottom: 8, right: 8 }]} pointerEvents="none">
              <Mono style={styles.cornerLabel}>{target ? 'TO TARGET' : 'FROM HOME'}</Mono>
              <Mono style={styles.cornerValue}>
                {target && toTarget != null ? `${Math.round(toTarget)} m` : local ? `${Math.round(Math.hypot(local.north, local.east))} m` : '—'}
              </Mono>
            </View>
          </View>
        )}
      </View>

      {steps.length > 0 && (
        <View style={styles.progress}>
          <View style={styles.progressHead}>
            <Mono style={styles.cornerLabel}>{running ? 'MISSION IN FLIGHT' : finished ? 'MISSION COMPLETE' : 'MISSION QUEUED'}</Mono>
            <Mono style={styles.progressLine}>
              {running
                ? `step ${currentIdx + 1}/${steps.length} · ${labels[currentIdx]?.toLowerCase() ?? ''}${toTarget != null ? ` · ${Math.round(toTarget)} m to go` : ''}`
                : finished
                  ? `all ${steps.length} steps flown`
                  : `${steps.length} steps waiting for the drone`}
            </Mono>
          </View>
          <View style={styles.segments}>
            {labels.map((l, i) => {
              const done = i < currentIdx;
              const now = i === currentIdx && running;
              return (
                <View key={i} style={[styles.segment, done && styles.segmentDone, now && styles.segmentNow]}>
                  <Display style={[styles.segmentText, (done || now) && styles.segmentTextOn]} numberOfLines={1}>{l}</Display>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function PulseRing({ pulse, x, y, base }: { pulse: Animated.Value; x: number; y: number; base: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x - base, top: y - base, width: base * 2, height: base * 2, borderRadius: base,
        borderWidth: 1.5, borderColor: colors.green,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  mapBox: { width: '100%', borderWidth: 1, borderColor: colors.green, paddingVertical: 10, backgroundColor: colors.black },
  drone: { position: 'absolute', width: 28, height: 28 },
  corner: {
    position: 'absolute', backgroundColor: colors.black, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.greenBorder,
    paddingHorizontal: 7, paddingVertical: 4, minWidth: 64,
  },
  right: { alignItems: 'flex-end' },
  cornerLabel: { fontSize: 7.5, letterSpacing: 1.8, color: colors.greenDim },
  cornerValue: { fontSize: 13, color: colors.green, marginTop: 1 },
  cornerSub: { fontSize: 8.5, color: colors.greenDim, marginTop: 1 },
  scaleBar: { height: 4, borderWidth: 1, borderTopWidth: 0, borderColor: colors.green, marginBottom: 2 },
  progress: { borderWidth: 1, borderColor: colors.greenBorder, padding: 10, gap: 8 },
  progressHead: { gap: 2 },
  progressLine: { fontSize: 12, color: colors.signal },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, borderWidth: 1, borderColor: colors.greenBorder, paddingVertical: 5, alignItems: 'center' },
  segmentDone: { backgroundColor: colors.greenDim, borderColor: colors.greenDim },
  segmentNow: { backgroundColor: colors.signal, borderColor: colors.signal },
  segmentText: { fontSize: 11, color: colors.greenDim },
  segmentTextOn: { color: colors.black },
});
