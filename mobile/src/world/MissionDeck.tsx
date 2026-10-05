import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Mono } from '../components/ui';
import type { CityMission } from '../api/types';

/**
 * The mission deck: on the map, every mission open to you down the left side -- WYRD's own board and
 * the street board -- in a neon panel. One is picked (glowing gold, its brief and distance shown) and
 * TAKE sets it, drops you to the street and draws the gold route. On the street, the mission you're
 * on stays on the left as a compact card.
 */
const KIND: Record<CityMission['kind'], { icon: string; color: string }> = {
  reach: { icon: '➤', color: '#00e5ff' },
  deliver: { icon: '▣', color: '#ffc400' },
  find: { icon: '◎', color: '#ff2bd6' },
  greet: { icon: '✦', color: '#1aff9c' },
};
const km = (d: number) => (d > 999 ? `${(d / 1000).toFixed(1)} KM` : `${Math.round(d)} M`);

export function MissionDeck({ missions, active, from, onTake, onPeek, compact }: {
  missions: CityMission[];
  active: CityMission | null;
  from: { x: number; z: number };
  onTake: (m: CityMission) => void;
  onPeek: (m: CityMission) => void;
  compact: boolean;
}) {
  const [pick, setPick] = useState<CityMission | null>(null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => { const t = setInterval(() => setPulse((p) => (p + 1) % 2), 900); return () => clearInterval(t); }, []);
  const dist = (m: CityMission) => (m.x != null && m.z != null ? Math.hypot(m.x - from.x, m.z - from.z) : null);
  const list = [...missions].sort((a, b) => (dist(a) ?? 1e9) - (dist(b) ?? 1e9));
  const sel = pick ?? list[0] ?? null;

  return (
    <View style={[styles.deck, compact && styles.deckCompact]}>
      <View style={styles.head}>
        <Mono style={[styles.headDot, { opacity: pulse ? 1 : 0.35 }]}>●</Mono>
        <Mono style={styles.headText}>MISSIONS · {list.length} OPEN</Mono>
      </View>
      <View style={styles.scan} />
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 4 }}>
        {list.map((m) => {
          const k = KIND[m.kind] ?? KIND.reach, on = sel === m, d = dist(m), mine = active && (active.id ?? active.title) === (m.id ?? m.title);
          return (
            <Pressable key={m.id ?? m.title} onPress={() => { setPick(m); onPeek(m); }} style={[styles.card, on && styles.cardOn, { borderLeftColor: k.color }]}>
              <View style={styles.cardRow}>
                <Mono style={[styles.icon, { color: k.color }]}>{k.icon}</Mono>
                <Mono style={[styles.title, on && { color: '#ffffff' }]} numberOfLines={1}>{m.title}</Mono>
                {!on && d != null ? <Mono style={styles.dist}>{km(d)}</Mono> : null}
                <Mono style={styles.reward}>+{m.reward}</Mono>
              </View>
              {on ? <Mono style={styles.meta}>{m.street ?? 'LAGOS'}{d != null ? ` · ${km(d)}` : ''}{mine ? ' · ACTIVE' : ''}</Mono> : null}
              {on && !compact ? <Mono style={styles.brief} numberOfLines={2}>{m.brief}</Mono> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {sel ? (
        <Pressable onPress={() => onTake(sel)} style={styles.take}>
          <Mono style={styles.takeText}>TAKE MISSION ➤</Mono>
        </Pressable>
      ) : null}
    </View>
  );
}

/** On the street: the mission you're on, as a compact card on the left. */
export function MissionCard({ m, distance }: { m: CityMission; distance: number | null }) {
  const k = KIND[m.kind] ?? KIND.reach;
  return (
    <View style={[styles.card, styles.cardOn, styles.onStreet, { borderLeftColor: k.color }]}>
      <Mono style={styles.headText}>◆ ON MISSION · +{m.reward}</Mono>
      <View style={styles.cardRow}>
        <Mono style={[styles.icon, { color: k.color }]}>{k.icon}</Mono>
        <Mono style={[styles.title, { color: '#fff' }]} numberOfLines={1}>{m.title}</Mono>
      </View>
      <Mono style={styles.brief} numberOfLines={2}>{m.brief}</Mono>
      <Mono style={styles.meta}>{m.street ?? 'The marked place'}{distance != null ? ` · ${km(distance)}` : ''} · FOLLOW THE GOLD LINE</Mono>
    </View>
  );
}

const GOLD = '#ffc400';
const styles = StyleSheet.create({
  deck: {
    position: 'absolute', top: 14, left: 14, maxHeight: '58%', width: 250, padding: 9, gap: 6,
    backgroundColor: 'rgba(8,10,18,0.86)', borderWidth: 1, borderColor: 'rgba(255,196,0,0.55)',
    shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
  },
  deckCompact: { width: 190, padding: 6, gap: 4, top: 6, left: 6, maxHeight: '92%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headDot: { color: '#ff2bd6', fontSize: 10 },
  headText: { fontSize: 10, letterSpacing: 2.2, color: GOLD },
  scan: { height: 1, backgroundColor: GOLD, opacity: 0.5 },
  card: { borderLeftWidth: 3, borderWidth: 1, borderColor: '#1e2433', backgroundColor: 'rgba(20,24,36,0.7)', paddingHorizontal: 7, paddingVertical: 5, gap: 2 },
  cardOn: { borderColor: GOLD, backgroundColor: 'rgba(60,46,0,0.35)' },
  onStreet: { width: 230, backgroundColor: 'rgba(8,10,18,0.86)', marginTop: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  icon: { fontSize: 13 },
  title: { flex: 1, fontSize: 11, color: '#c9ccd3' },
  dist: { fontSize: 8.5, color: '#6a7488' },
  reward: { fontSize: 10.5, color: GOLD },
  meta: { fontSize: 8.5, letterSpacing: 1.2, color: '#8ea0ff' },
  brief: { fontSize: 10.5, lineHeight: 15, color: '#d8dce6' },
  take: { backgroundColor: GOLD, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  takeText: { fontSize: 10.5, letterSpacing: 1.6, color: '#0d0f14' },
});
