import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { FENCE_M, MissionMap, toLocal } from '../../components/MissionMap';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api, ApiError } from '../../api/client';
import { useDrone } from '../../api/hooks';
import type { DroneMission, DroneState } from '../../api/types';
import { timeAgo } from '../../util/time';

const STALE_MS = 10000;

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

export function DroneTab() {
  const { state, missions, isOperator, reloadMissions } = useDrone();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const status = useLinkStatus(state);
  const active = missions.find((m) => m.kind === 'mission' && ['pending', 'sent', 'running'].includes(m.status));

  const fromHome = useMemo(() => {
    if (state?.lat == null || state?.lon == null || state.homeLat == null || state.homeLon == null) return null;
    const p = toLocal(state.lat, state.lon, state.homeLat, state.homeLon);
    return Math.hypot(p.north, p.east);
  }, [state]);

  const plan = async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.dronePlan(text);
      if (result.accepted && result.mission) {
        setNotice({ ok: true, text: `Planned: ${result.mission.summary}` });
        setInstruction('');
      } else {
        setNotice({ ok: false, text: result.reason ?? 'refused' });
      }
      reloadMissions();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? e.message : 'could not reach WYRD' });
    } finally {
      setBusy(false);
    }
  };

  const abort = async () => {
    setNotice(null);
    try {
      await api.droneAbort();
      setNotice({ ok: true, text: 'Abort sent: returning home.' });
      reloadMissions();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? e.message : 'could not reach WYRD' });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Display style={styles.heading}>{'>_ DRONE'}</Display>
      <Mono style={styles.sub}>
        WYRD plans the missions; the autopilot flies. Every plan is checked against the fence, ceiling and battery
        limits twice before it flies.
      </Mono>

      <View style={styles.statusRow}>
        <View style={[styles.dot, status === 'LIVE' ? styles.dotLive : status === 'STALE' ? styles.dotStale : null]} />
        <Mono style={styles.statusText}>
          {status}
          {state && status !== 'OFFLINE' ? ` · ${state.mode ?? '—'}${state.armed ? ' · ARMED' : ''}` : ''}
        </Mono>
        {state ? <Mono style={styles.updated}>{timeAgo(state.updatedAt)}</Mono> : null}
      </View>

      <View style={styles.grid}>
        <Stat label="ALTITUDE" value={fmt(state?.relativeAltM, 1, 'm')} />
        <Stat label="SPEED" value={fmt(state?.groundSpeedMs, 1, 'm/s')} />
        <Stat label="BATTERY" value={state?.batteryPct != null ? `${state.batteryPct}%` : '—'} warn={(state?.batteryPct ?? 100) < 30} />
        <Stat label="FROM HOME" value={fromHome != null ? `${Math.round(fromHome)} m` : '—'} warn={(fromHome ?? 0) > FENCE_M * 0.9} />
        <Stat label="GPS" value={state?.gpsFix != null ? `${state.gpsFix >= 3 ? '3D' : 'NO FIX'} · ${state.satellites ?? 0}` : '—'} warn={(state?.gpsFix ?? 3) < 3} />
        <Stat label="MISSION" value={state?.missionStatus && state.missionStatus !== 'idle' ? `${state.missionStatus}${state.missionStep ? ` ${state.missionStep}` : ''}` : 'idle'} />
      </View>

      <MissionMap state={state} mission={active} />

      {isOperator ? (
        <View style={styles.controls}>
          <Mono style={styles.label}>TELL WYRD WHERE TO FLY</Mono>
          <TextInput
            value={instruction}
            onChangeText={setInstruction}
            placeholder="take off to 15 m, fly a 40 m square, come home"
            placeholderTextColor={colors.greenBorder}
            style={styles.input}
            multiline
            editable={!busy}
          />
          <View style={styles.buttonRow}>
            <Pressable
              onPress={plan}
              disabled={busy || !instruction.trim() || status !== 'LIVE' || Boolean(active)}
              style={({ pressed }) => [
                styles.planBtn,
                (busy || !instruction.trim() || status !== 'LIVE' || active) && styles.btnDisabled,
                pressed && styles.btnPressed,
              ]}
            >
              {busy ? <ActivityIndicator color={colors.black} /> : <Mono style={styles.planText}>PLAN &amp; FLY</Mono>}
            </Pressable>
            <Pressable onPress={abort} style={({ pressed }) => [styles.abortBtn, pressed && styles.btnPressed]}>
              <Mono style={styles.abortText}>ABORT · RETURN HOME</Mono>
            </Pressable>
          </View>
          {status !== 'LIVE' ? <Mono style={styles.hint}>Planning needs a live drone connection.</Mono> : null}
          {active ? <Mono style={styles.hint}>A flight is in progress: abort it to plan a new one.</Mono> : null}
          {notice ? <Mono style={[styles.notice, !notice.ok && styles.noticeBad]}>{notice.text}</Mono> : null}
        </View>
      ) : (
        <Mono style={styles.hint}>View only. Flights can be planned from the operator account.</Mono>
      )}

      <Mono style={[styles.label, { marginTop: 18 }]}>MISSIONS</Mono>
      {missions.length === 0 ? <Mono style={styles.hint}>none yet</Mono> : null}
      {missions.map((m) => (
        <MissionRow key={m.id} mission={m} />
      ))}
    </ScrollView>
  );
}

function fmt(v: number | null | undefined, digits: number, unit: string) {
  return v == null ? '—' : `${v.toFixed(digits)} ${unit}`;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={[styles.stat, warn && styles.statWarn]}>
      <Mono style={styles.statLabel}>{label}</Mono>
      <Display style={[styles.statValue, warn && styles.warnText]}>{value}</Display>
    </View>
  );
}

function MissionRow({ mission }: { mission: DroneMission }) {
  const bad = mission.status === 'aborted' || mission.status === 'rejected';
  return (
    <View style={styles.missionRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Mono numberOfLines={1} style={styles.missionTitle}>{mission.summary}</Mono>
        <Mono numberOfLines={1} style={styles.missionMeta}>
          “{mission.instruction}” · {timeAgo(mission.createdAt)}
        </Mono>
        {mission.reason ? <Mono style={[styles.missionMeta, bad && styles.warnText]}>{mission.reason}</Mono> : null}
      </View>
      <Mono style={[styles.badge, bad && styles.badgeBad]}>{mission.status.toUpperCase()}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 30, color: colors.green },
  sub: { marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.greenDim },
  statusRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.greenDim },
  dotLive: { backgroundColor: colors.green, borderColor: colors.green },
  dotStale: { backgroundColor: colors.greenBorder, borderColor: colors.greenBorder },
  statusText: { fontSize: 12, letterSpacing: 2, color: colors.green, flex: 1 },
  updated: { fontSize: 10, color: colors.greenDim },
  grid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '31.5%', borderWidth: 1, borderColor: colors.greenBorder, padding: 8 },
  statWarn: { borderColor: colors.danger },
  statLabel: { fontSize: 8, letterSpacing: 1.5, color: colors.greenDim },
  statValue: { marginTop: 3, fontSize: 18, color: colors.green },
  warnText: { color: colors.danger },
  map: { marginTop: 14, width: '100%', aspectRatio: 1, borderWidth: 1, borderColor: colors.greenBorder },
  controls: { marginTop: 16, gap: 8 },
  label: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  input: {
    borderWidth: 1, borderColor: colors.green, minHeight: 64, padding: 10,
    fontFamily: 'ShareTechMono_400Regular', fontSize: 13, color: colors.green, textAlignVertical: 'top',
  },
  buttonRow: { flexDirection: 'row', gap: 8 },
  planBtn: { flex: 1, backgroundColor: colors.green, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  planText: { color: colors.black, fontSize: 12, letterSpacing: 2 },
  abortBtn: { flex: 1, borderWidth: 2, borderColor: colors.danger, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  abortText: { color: colors.danger, fontSize: 11, letterSpacing: 1.5 },
  btnDisabled: { opacity: 0.35 },
  btnPressed: { opacity: 0.7 },
  hint: { marginTop: 6, fontSize: 10.5, color: colors.greenDim },
  notice: { marginTop: 4, fontSize: 11.5, lineHeight: 16, color: colors.green },
  noticeBad: { color: colors.danger },
  missionRow: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.greenBorder, paddingBottom: 8,
  },
  missionTitle: { fontSize: 12, color: colors.green },
  missionMeta: { marginTop: 2, fontSize: 10, color: colors.greenDim },
  badge: { fontSize: 9, letterSpacing: 1, color: colors.green, borderWidth: 1, borderColor: colors.green, paddingHorizontal: 5, paddingVertical: 2 },
  badgeBad: { color: colors.danger, borderColor: colors.danger },
});
