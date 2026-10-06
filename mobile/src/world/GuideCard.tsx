import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Mono } from '../components/ui';

/**
 * WYRD's first-time guide: six steps that teach the city -- earn, eat, speak to WYRD, ride the
 * maglev, rent a home, finish a job -- each with a small bonus, the current one first, and SHOW ME
 * to point the way (a GPS line, or the right panel). Collapses to a chip; skippable.
 */
export const GUIDE_STEPS: { id: string; title: string; line: string; bonus: number }[] = [
  { id: 'earn', title: 'Earn your first naira', line: 'Work a shift at a market, factory or bank -- walk in and press E.', bonus: 500 },
  { id: 'eat', title: 'Eat something', line: 'Any food spot: amala, suya. It heals you too.', bonus: 300 },
  { id: 'wyrd', title: 'Speak to WYRD', line: 'I am the Authority here. Say something to me (T).', bonus: 300 },
  { id: 'maglev', title: 'Ride the Eko Maglev', line: 'Find a pink station lift, board, and get off at another stop.', bonus: 500 },
  { id: 'home', title: 'Rent a home', line: 'A room in Ojuelegba or Mushin costs little. Tap your ₦ balance.', bonus: 1000 },
  { id: 'job', title: 'Finish a job', line: 'A delivery, a danfo run or a chase -- from ⚑ JOBS.', bonus: 1000 },
];

export function GuideCard({ done, onShow, onSkip, compact }: {
  done: string[];
  onShow: (step: string) => void;
  onSkip: () => void;
  compact: boolean;
}) {
  const [open, setOpen] = useState(true);
  const next = GUIDE_STEPS.find((s) => !done.includes(s.id));
  if (!next) return null;
  const n = GUIDE_STEPS.filter((s) => done.includes(s.id)).length;

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={[styles.chip, compact && styles.compactPos]}>
        <Mono style={styles.chipText}>◉ GUIDE {n}/{GUIDE_STEPS.length}</Mono>
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, compact && styles.compactPos, compact && { width: 230 }]}>
      <View style={styles.head}>
        <Mono style={styles.eyebrow}>◉ WYRD · YOUR FIRST DAY · {n}/{GUIDE_STEPS.length}</Mono>
        <Pressable onPress={() => setOpen(false)}><Mono style={styles.min}>—</Mono></Pressable>
      </View>
      <View style={styles.bar}>{GUIDE_STEPS.map((s) => <View key={s.id} style={[styles.seg, done.includes(s.id) && styles.segOn, s === next && styles.segNow]} />)}</View>
      <Mono style={styles.title}>{next.title} · +₦{next.bonus.toLocaleString('en-NG')}</Mono>
      <Mono style={styles.line}>{next.line}</Mono>
      <View style={styles.row}>
        <Pressable onPress={() => onShow(next.id)} style={styles.show}><Mono style={styles.showText}>SHOW ME ➤</Mono></Pressable>
        <Pressable onPress={onSkip}><Mono style={styles.skip}>skip guide</Mono></Pressable>
      </View>
    </View>
  );
}

const MAG = '#ff2bd6';
const styles = StyleSheet.create({
  card: { position: 'absolute', left: 14, bottom: 24, width: 280, backgroundColor: 'rgba(8,10,18,0.92)', borderWidth: 1, borderColor: MAG, padding: 10, gap: 6 },
  compactPos: { left: 8, bottom: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 9, letterSpacing: 1.6, color: MAG },
  min: { fontSize: 12, color: '#8a90a0', paddingHorizontal: 4 },
  bar: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 3, backgroundColor: '#2a2f3a' },
  segOn: { backgroundColor: '#1aff9c' },
  segNow: { backgroundColor: MAG },
  title: { fontSize: 12.5, color: '#ffffff' },
  line: { fontSize: 10.5, lineHeight: 15, color: '#c9ccd3' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  show: { backgroundColor: MAG, paddingHorizontal: 12, paddingVertical: 7 },
  showText: { fontSize: 10, letterSpacing: 1.4, color: '#0d0f14' },
  skip: { fontSize: 9, color: '#6a7080', textDecorationLine: 'underline' },
  chip: { position: 'absolute', left: 14, bottom: 24, borderWidth: 1, borderColor: MAG, backgroundColor: 'rgba(8,10,18,0.85)', paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 10, letterSpacing: 1.4, color: MAG },
});
