import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Mono } from '../components/ui';
import { api } from '../api/client';
import type { CityStats } from '../api/types';

/**
 * The city's pulse: a small live counter (players online) that opens a panel -- online now, joined,
 * new today, missions done, today's talk with WYRD, TEN/AMA bodies and the leading citizens. The
 * game sends its own heartbeat every 30 s so you count as online; the numbers refresh every 30 s.
 */
export function CityPulse() {
  const [s, setS] = useState<CityStats | null>(null);
  const [open, setOpen] = useState(false);
  const [blink, setBlink] = useState(true);
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      api.cityPulse().catch(() => {});
      api.cityStats().then((x) => { if (alive) { setS(x); setDown(false); } }).catch(() => alive && setDown(true));
    };
    tick();
    const t = setInterval(tick, 30000), b = setInterval(() => setBlink((v) => !v), 900);
    return () => { alive = false; clearInterval(t); clearInterval(b); };
  }, []);

  return (
    <View style={{ alignItems: 'flex-end', gap: 6 }} pointerEvents="box-none">
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.chip} accessibilityLabel="Players in the city">
        <Mono style={[styles.dot, { opacity: blink ? 1 : 0.3 }]}>●</Mono>
        <Mono style={styles.chipText}>{s ? `${s.online} ONLINE` : 'CITY'}</Mono>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          <Mono style={styles.eyebrow}>◉ NAIJA 2099 · THE CITY NOW</Mono>
          {s ? (
            <>
              <View style={styles.grid}>
                <Stat n={s.online} label="ONLINE" color="#1aff9c" />
                {s.joined != null ? <Stat n={s.joined} label="JOINED" color="#00e5ff" /> : null}
                {s.joinedToday != null ? <Stat n={s.joinedToday} label="NEW TODAY" color="#ff2bd6" /> : null}
                <Stat n={s.missionsDone} label="MISSIONS" color="#ffc400" />
                <Stat n={s.talksToday} label="TALKS W/ WYRD" color="#8ea0ff" />
                {s.citizens != null ? <Stat n={s.citizens} label="CITIZENS" color="#ffffff" /> : null}
              </View>
              {s.bodies ? <Mono style={styles.small}>TEN {s.bodies.ten} · AMA {s.bodies.ama} · owner only</Mono> : null}
              {s.leaders.length ? <Mono style={styles.eyebrow}>LEADING CITIZENS</Mono> : null}
              {s.leaders.map((l, i) => (
                <View key={i} style={styles.row}>
                  <Mono style={styles.rank}>{i + 1}</Mono>
                  <Mono style={styles.name} numberOfLines={1}>{l.name}</Mono>
                  <Mono style={styles.small}>{l.standing > 0 ? '+' : ''}{l.standing} · {l.missions}◆</Mono>
                </View>
              ))}
            </>
          ) : <Mono style={styles.small}>{down ? 'City stats are offline right now -- trying again every 30 s.' : 'Counting who is in the city…'}</Mono>}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Mono style={[styles.num, { color }]}>{n}</Mono>
      <Mono style={styles.label}>{label}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#1aff9c', backgroundColor: 'rgba(8,12,20,0.75)', paddingHorizontal: 9, paddingVertical: 5 },
  dot: { fontSize: 9, color: '#1aff9c' },
  chipText: { fontSize: 10, letterSpacing: 1.5, color: '#1aff9c' },
  panel: { width: 250, backgroundColor: 'rgba(8,10,18,0.92)', borderWidth: 1, borderColor: '#1aff9c', padding: 10, gap: 8 },
  eyebrow: { fontSize: 9.5, letterSpacing: 1.8, color: '#1aff9c' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: { width: 72, borderWidth: 1, borderColor: '#1e2433', paddingVertical: 5, alignItems: 'center' },
  num: { fontSize: 18 },
  label: { fontSize: 7.5, letterSpacing: 1, color: '#8a90a0', textAlign: 'center' },
  small: { fontSize: 9.5, color: '#9aa0b0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { fontSize: 11, color: '#ffc400', width: 12 },
  name: { flex: 1, fontSize: 11, color: '#ffffff' },
});
