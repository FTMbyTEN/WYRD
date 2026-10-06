import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { FENCE_M, MissionMap, toLocal } from '../../components/MissionMap';
import { Battery, Compass, Dial, Satellites, Tether } from '../../components/DroneInstruments';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api, ApiError } from '../../api/client';
import { useDrone } from '../../api/hooks';
import type { DroneMission, DroneState } from '../../api/types';
import { timeAgo } from '../../util/time';
import { sfx, voice } from '../../util/sound';

const STALE_MS = 10000;
// mirrors DroneSafety on the server (wyrd_server/lib/src/drone/drone_safety.dart)
const MAX_ALT_M = 60;
const MIN_BATTERY_TAKEOFF = 50;
const MIN_BATTERY = 30;

type LinkStatus = 'LIVE' | 'STALE' | 'OFFLINE';

/** LIVE if the drone's report timestamp changed within STALE_MS *by this device's clock* --
 *  comparing the server's timestamp to the device clock made a live drone look stale whenever
 *  the two clocks disagreed by more than a few seconds. */
function useLinkStatus(state: DroneState | null | undefined): LinkStatus {
  const seen = useRef<{ updatedAt: string | null; at: number }>({ updatedAt: null, at: 0 });
  const [, tick] = useState(0);
  if (state?.updatedAt && state.updatedAt !== seen.current.updatedAt) {
    // the first report seen proves nothing about freshness; the next change does (~2s when live)
    seen.current = { updatedAt: state.updatedAt, at: seen.current.updatedAt === null ? 0 : Date.now() };
  }
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);
  if (!state || !state.connected) return 'OFFLINE';
  return seen.current.at && Date.now() - seen.current.at <= STALE_MS ? 'LIVE' : 'STALE';
}

const EXAMPLES = [
  'Take off to 15 m, fly a 40 m square, come home',
  'Climb to 30 m, hold for 20 seconds, land',
  'Fly 80 m north at 20 m, then return home',
];

/** DRONE: WYRD's ground control station. The link, the aircraft's instruments, the tactical
 *  map, a pre-flight checklist, a console to tell WYRD where to fly, and the flight log. */
export function DroneTab() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const { state, missions, isOperator, reloadMissions } = useDrone();

  // WYRD says what the drone is doing as its missions change (not for ones already under way on arrival)
  const seen = useRef<Map<number, string> | null>(null);
  useEffect(() => {
    const now = new Map(missions.filter((m) => m.id != null).map((m) => [m.id!, m.status]));
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    for (const m of missions) {
      // only a change WYRD watched happen: the flight log loading in (or a mission it hasn't seen
      // before) is history, not news
      const was = m.id == null ? undefined : before.get(m.id);
      if (was === undefined || was === m.status) continue;
      // "returning home" only while a flight is really being called back: an abort command going
      // out or under way, or a flight that was in the air being aborted
      const recalling = m.kind === 'abort' ? m.status === 'sent' || m.status === 'running' : m.status === 'aborted' && (was === 'sent' || was === 'running');
      if (recalling) { sfx('alert'); void voice('drone-abort'); return; }
      if (m.kind === 'abort') continue;
      if (m.status === 'running') { sfx('gateEnter'); void voice('drone-takeoff'); return; }
      if (m.status === 'done') { sfx('ready'); void voice('drone-home'); return; }
      if (m.status === 'rejected') { sfx('error'); return; }
    }
  }, [missions]);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmAbort, setConfirmAbort] = useState(false);

  const status = useLinkStatus(state);
  const active = missions.find((m) => m.kind === 'mission' && ['pending', 'sent', 'running'].includes(m.status));

  const fromHome = useMemo(() => {
    if (state?.lat == null || state?.lon == null || state.homeLat == null || state.homeLon == null) return null;
    const p = toLocal(state.lat, state.lon, state.homeLat, state.homeLon);
    return Math.hypot(p.north, p.east);
  }, [state]);

  const checks: [string, boolean | null, string][] = [
    ['Link to the drone', status === 'LIVE' ? true : status === 'STALE' ? null : false, status === 'LIVE' ? 'live' : status === 'STALE' ? 'reports are late' : 'no connection'],
    ['GPS 3D fix', state?.gpsFix == null ? false : state.gpsFix >= 3, state?.gpsFix == null ? 'no data' : `${state.satellites ?? 0} satellites`],
    ['Battery for takeoff', state?.batteryPct == null ? false : state.batteryPct >= MIN_BATTERY_TAKEOFF, state?.batteryPct == null ? 'no data' : `${state.batteryPct}% (needs ${MIN_BATTERY_TAKEOFF}%)`],
    ['Inside the fence', fromHome == null ? null : fromHome <= FENCE_M, fromHome == null ? 'no position' : `${Math.round(fromHome)} m of ${FENCE_M} m`],
    ['No flight in progress', !active, active ? 'abort it first' : 'clear'],
  ];
  const ready = checks.every(([, ok]) => ok === true);
  const canPlan = isOperator && !busy && Boolean(instruction.trim()) && status === 'LIVE' && !active;

  const plan = async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.dronePlan(text);
      if (result.accepted && result.mission) {
        setNotice({ ok: true, text: `Planned and queued: ${result.mission.summary}` });
        setInstruction('');
      } else {
        setNotice({ ok: false, text: `Refused — ${result.reason ?? 'the plan did not pass the safety checks'}` });
      }
      reloadMissions();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? e.message : 'could not reach WYRD' });
    } finally {
      setBusy(false);
    }
  };

  const abort = async () => {
    setConfirmAbort(false);
    setNotice(null);
    try {
      await api.droneAbort();
      setNotice({ ok: true, text: 'Abort sent: the drone is cancelling its mission and coming home.' });
      reloadMissions();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? e.message : 'could not reach WYRD' });
    }
  };

  const instruments = (
    <View style={styles.instruments}>
      <Dial label="ALTITUDE · CEILING 60 m" value={state?.relativeAltM} max={MAX_ALT_M + 10} limit={MAX_ALT_M} unit="METRES" digits={1} />
      <Dial label="GROUND SPEED" value={state?.groundSpeedMs} max={15} unit="M / S" digits={1} />
      <Compass heading={state?.headingDeg} />
      <Battery pct={state?.batteryPct} floor={MIN_BATTERY} takeoff={MIN_BATTERY_TAKEOFF} />
      <Tether distance={fromHome} fence={FENCE_M} />
      <Satellites count={state?.satellites} fix={state?.gpsFix} />
    </View>
  );

  const console_ = isOperator ? (
    <View style={styles.console}>
      <View style={styles.consoleHead}>
        <Mono style={styles.consoleTitle}>COMMAND · TELL WYRD WHERE TO FLY</Mono>
        <Mono style={styles.consoleSub}>checked against the fence, ceiling and battery twice before it flies</Mono>
      </View>
      <View style={styles.prompt}>
        <Mono style={styles.caret}>WYRD&gt;</Mono>
        <TextInput
          value={instruction}
          onChangeText={setInstruction}
          placeholder="describe the flight in plain words…"
          placeholderTextColor="#6f6f6f"
          style={styles.consoleInput}
          multiline
          editable={!busy}
        />
      </View>
      <View style={styles.examples}>
        {EXAMPLES.map((e) => (
          <Pressable key={e} onPress={() => setInstruction(e)} style={({ pressed }) => [styles.example, pressed && { opacity: 0.6 }]}>
            <Mono style={styles.exampleText}>{e}</Mono>
          </Pressable>
        ))}
      </View>
      <View style={styles.buttonRow}>
        <Pressable onPress={plan} disabled={!canPlan} style={({ pressed }) => [styles.planBtn, !canPlan && styles.btnDisabled, pressed && styles.btnPressed]}>
          {busy ? <ActivityIndicator color={colors.mint} /> : <Mono style={styles.planText}>PLAN &amp; FLY →</Mono>}
        </Pressable>
        {confirmAbort ? (
          <View style={[styles.buttonRow, { flex: 1 }]}>
            <Pressable onPress={abort} style={({ pressed }) => [styles.abortConfirm, pressed && styles.btnPressed]}>
              <Mono style={styles.abortConfirmText}>CONFIRM ABORT</Mono>
            </Pressable>
            <Pressable onPress={() => setConfirmAbort(false)} style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}>
              <Mono style={styles.cancelText}>CANCEL</Mono>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmAbort(true)} style={({ pressed }) => [styles.abortBtn, pressed && styles.btnPressed]}>
            <Hazard />
            <Mono style={styles.abortText}>ABORT · RETURN HOME</Mono>
          </Pressable>
        )}
      </View>
      {status !== 'LIVE' ? <Mono style={styles.consoleHint}>Planning needs a live connection to the drone.</Mono> : null}
      {active ? <Mono style={styles.consoleHint}>A flight is in progress: abort it to plan a new one.</Mono> : null}
      {notice ? <Mono style={[styles.notice, !notice.ok && styles.noticeBad]}>{notice.text}</Mono> : null}
    </View>
  ) : (
    <View style={styles.viewOnly}>
      <Mono style={styles.label}>VIEW ONLY</Mono>
      <Mono style={styles.muted}>You can watch every flight here. Flights are planned from the operator account.</Mono>
    </View>
  );

  const checklist = (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Mono style={styles.label}>PRE-FLIGHT CHECKLIST</Mono>
        <Mono style={[styles.readyTag, ready ? styles.readyOn : null]}>{ready ? 'READY TO FLY' : 'NOT READY'}</Mono>
      </View>
      {checks.map(([name, ok, detail]) => (
        <View key={name} style={styles.checkRow}>
          <View style={[styles.checkBox, ok === true && styles.checkOk, ok === false && styles.checkBad]}>
            <Mono style={[styles.checkMark, ok === true && { color: '#FFFAF2' }, ok === false && { color: colors.danger }]}>{ok === true ? '✓' : ok === false ? '✕' : '·'}</Mono>
          </View>
          <Mono style={styles.checkName}>{name}</Mono>
          <Mono style={[styles.checkDetail, ok === false && { color: colors.danger }]}>{detail}</Mono>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]} keyboardShouldPersistTaps="handled">
      {/* station header */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Mono style={[styles.label, { color: colors.signal }]}>DRONE · GROUND CONTROL</Mono>
          <Display style={[styles.callsign, wide && { fontSize: 62, lineHeight: 64 }]}>{state?.droneId ? state.droneId.toUpperCase() : 'WYRD-1'}</Display>
          <Mono style={styles.muted}>WYRD plans the mission; the autopilot flies it. You watch, and can always bring it home.</Mono>
        </View>
        <LinkBadge status={status} state={state} />
      </View>

      {state?.missionError ? (
        <View style={styles.alert}>
          <Mono style={styles.alertText}>⚠ {state.missionError}</Mono>
        </View>
      ) : null}

      {wide ? (
        <View style={{ gap: 18 }}>
          <View style={styles.deck}>
            <View style={{ flex: 1.2, minWidth: 0 }}>
              <View style={styles.mapFrame}><MissionMap state={state} mission={active} /></View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>{instruments}</View>
          </View>
          <View style={styles.deck}>
            <View style={{ flex: 1, minWidth: 0 }}>{checklist}</View>
            <View style={{ flex: 1.1, minWidth: 0 }}>{console_}</View>
            <View style={{ flex: 1, minWidth: 0 }}><FlightLog missions={missions} /></View>
          </View>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={styles.mapFrame}><MissionMap state={state} mission={active} /></View>
          {instruments}
          {checklist}
          {console_}
        </View>
      )}

      {!wide ? <FlightLog missions={missions} /> : null}
    </ScrollView>
  );
}

function LinkBadge({ status, state }: { status: LinkStatus; state: DroneState | null | undefined }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (status !== 'LIVE') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);
  const live = status === 'LIVE';
  return (
    <View style={[styles.link, live && styles.linkLive]}>
      <View style={styles.linkRow}>
        <Animated.View style={[styles.linkDot, live ? { backgroundColor: '#FFFAF2', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }) } : status === 'STALE' ? { backgroundColor: '#A8957F' } : null]} />
        <Mono style={[styles.linkStatus, live && { color: '#FFFAF2' }]}>LINK {status}</Mono>
      </View>
      <Mono style={[styles.linkMeta, live && { color: '#C9B89F' }]}>
        {state && status !== 'OFFLINE' ? `${state.mode ?? 'NO MODE'}${state.armed ? ' · ARMED' : ' · DISARMED'}` : 'bridge not connected'}
      </Mono>
      {state ? <Mono style={[styles.linkMeta, live && { color: '#C9B89F' }]}>last report {timeAgo(state.updatedAt)}</Mono> : null}
    </View>
  );
}

function Hazard() {
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20">
      <Path d="M10 2 L19 18 L1 18 Z" fill={colors.danger} />
      <Rect x={9} y={7} width={2} height={6} fill="#FFFAF2" />
      <Rect x={9} y={14.5} width={2} height={2} fill="#FFFAF2" />
    </Svg>
  );
}

const STATUS_WORD: Record<DroneMission['status'], string> = {
  pending: 'QUEUED', sent: 'SENT', running: 'FLYING', done: 'COMPLETED', aborted: 'ABORTED', rejected: 'REFUSED',
};

function FlightLog({ missions }: { missions: DroneMission[] }) {
  return (
    <View style={styles.log}>
      <View style={styles.cardHead}>
        <Mono style={styles.label}>FLIGHT LOG</Mono>
        <Mono style={styles.muted}>{missions.length ? `${missions.length} most recent` : ''}</Mono>
      </View>
      {missions.length === 0 ? (
        <Mono style={styles.muted}>No flights yet. The first one will be logged here, with what was asked and what happened.</Mono>
      ) : (
        missions.map((m, i) => {
          const bad = m.status === 'aborted' || m.status === 'rejected';
          const live = ['pending', 'sent', 'running'].includes(m.status);
          return (
            <View key={m.id} style={styles.logRow}>
              <View style={styles.rail}>
                <View style={[styles.node, live && styles.nodeLive, bad && styles.nodeBad, m.status === 'done' && styles.nodeDone]} />
                {i < missions.length - 1 && <View style={styles.railLine} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, paddingBottom: 14, gap: 3 }}>
                <View style={styles.logTop}>
                  <Mono numberOfLines={1} style={styles.logTitle}>{m.kind === 'abort' ? 'Abort — return home' : m.summary}</Mono>
                  <Mono style={[styles.badge, live && styles.badgeLive, bad && styles.badgeBad]}>{STATUS_WORD[m.status]}</Mono>
                </View>
                {m.kind === 'mission' ? <Mono numberOfLines={2} style={styles.logQuote}>“{m.instruction}”</Mono> : null}
                {m.reason ? <Mono style={[styles.logMeta, bad && { color: colors.danger }]}>{m.reason}</Mono> : null}
                <Mono style={styles.logMeta}>#{m.id} · {timeAgo(m.createdAt)}</Mono>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 16 },
  pageWide: { maxWidth: 1180, width: '100%', alignSelf: 'center', paddingHorizontal: 28 },
  label: { fontSize: 11, letterSpacing: 1.8, color: colors.greenDim },
  muted: { fontSize: 11, lineHeight: 16, color: colors.greenDim },

  header: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.mint, paddingBottom: 14 },
  callsign: { fontSize: 36, lineHeight: 40, color: colors.mint, letterSpacing: 2 },
  link: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 18, paddingVertical: 12, gap: 3, minWidth: 210, backgroundColor: '#FFFAF2', borderRadius: 999 },
  linkLive: { backgroundColor: colors.palm, borderColor: colors.palm }, // live: the palm of a good link
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#A8957F' },
  linkStatus: { fontSize: 13, letterSpacing: 2.4, color: colors.mint },
  linkMeta: { fontSize: 10, color: colors.greenDim },
  alert: { borderWidth: 2, borderColor: colors.danger, padding: 10 },
  alertText: { color: colors.danger, fontSize: 12 },

  deck: { flexDirection: 'row', gap: 18, alignItems: 'stretch' },
  mapFrame: { borderWidth: 1, borderColor: colors.greenBorder, padding: 8, backgroundColor: colors.sand, borderRadius: 24, overflow: 'hidden' },
  instruments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  card: { borderWidth: 1, borderColor: colors.greenBorder, padding: 18, gap: 10, backgroundColor: '#FFFAF2', borderRadius: 20 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  readyTag: { fontSize: 9, letterSpacing: 1.6, color: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 16 },
  readyOn: { color: '#FFFAF2', backgroundColor: colors.signal, borderColor: colors.signal },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  checkBox: { width: 18, height: 18, borderWidth: 1, borderColor: colors.greenBorder, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  checkOk: { backgroundColor: colors.palm, borderColor: colors.palm },
  checkBad: { borderColor: colors.danger },
  checkMark: { fontSize: 11, color: colors.greenDim, lineHeight: 14 },
  checkName: { fontSize: 12, color: colors.mint, flex: 1 },
  checkDetail: { fontSize: 10, color: colors.greenDim, textAlign: 'right' },

  console: { backgroundColor: '#2A1F17', borderRadius: 22, padding: 20, gap: 12 },
  consoleHead: { gap: 3 },
  consoleTitle: { fontSize: 10, letterSpacing: 2.2, color: '#FFFAF2' },
  consoleSub: { fontSize: 10, color: '#8a8a8a' },
  prompt: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: '#3a3a3a', padding: 10, alignItems: 'flex-start', borderRadius: 16 },
  caret: { color: '#FFFAF2', fontSize: 13, marginTop: 2 },
  consoleInput: { flex: 1, minHeight: 58, color: '#FFFAF2', fontFamily: 'ShareTechMono_400Regular', fontSize: 14, textAlignVertical: 'top' },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  example: { borderWidth: 1, borderColor: '#3a3a3a', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 16 },
  exampleText: { color: '#bdbdbd', fontSize: 10 },
  buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  planBtn: { flex: 1, minWidth: 150, backgroundColor: '#FFFAF2', paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  planText: { color: colors.mint, fontSize: 12, letterSpacing: 2 },
  abortBtn: { flex: 1, minWidth: 150, flexDirection: 'row', gap: 8, borderWidth: 2, borderColor: colors.danger, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  abortText: { color: colors.danger, fontSize: 11, letterSpacing: 1.5 },
  abortConfirm: { flex: 1, backgroundColor: colors.danger, paddingVertical: 13, alignItems: 'center' },
  abortConfirmText: { color: '#FFFAF2', fontSize: 11, letterSpacing: 1.6 },
  cancelBtn: { borderWidth: 1, borderColor: '#7A6656', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16 },
  cancelText: { color: '#D9C7AC', fontSize: 11, letterSpacing: 1.4 },
  btnDisabled: { opacity: 0.3 },
  btnPressed: { opacity: 0.7 },
  consoleHint: { fontSize: 10.5, color: '#8a8a8a' },
  notice: { fontSize: 12, lineHeight: 17, color: '#FFFAF2' },
  noticeBad: { color: '#ff7070' },
  viewOnly: { borderWidth: 1, borderColor: colors.greenBorder, borderStyle: 'dashed', padding: 14, gap: 4, borderRadius: 16 },

  log: { borderTopWidth: 2, borderTopColor: colors.mint, paddingTop: 12, gap: 12 },
  logRow: { flexDirection: 'row', gap: 12 },
  rail: { width: 14, alignItems: 'center' },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.greenBorder, backgroundColor: '#FFFAF2', marginTop: 2 },
  nodeLive: { borderColor: colors.signal, backgroundColor: colors.signal },
  nodeDone: { borderColor: colors.greenBorder },
  nodeBad: { borderColor: colors.danger },
  railLine: { flex: 1, width: 1, backgroundColor: colors.greenBorderDim, marginTop: 2 },
  logTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logTitle: { flex: 1, fontSize: 13, color: colors.mint },
  logQuote: { fontSize: 11.5, color: colors.greenDim, fontStyle: 'italic' },
  logMeta: { fontSize: 10, color: colors.greenDim },
  badge: { fontSize: 9, letterSpacing: 1.2, color: colors.mint, borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 16 },
  badgeLive: { color: '#FFFAF2', backgroundColor: colors.signal },
  badgeBad: { color: colors.danger, borderColor: colors.danger },
});
