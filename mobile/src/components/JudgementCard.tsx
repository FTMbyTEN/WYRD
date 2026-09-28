import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Display, Mono } from './ui';
import { colors } from '../theme';
import { api } from '../api/client';
import type { JudgementReport } from '../api/types';

/** FEED tab: the last stage of WYRD's pipeline -- the gate every reply passes before it reaches
 *  a person. Counts only; no conversation text is shown. */
export function JudgementCard() {
  const [r, setR] = useState<JudgementReport | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.judgementReport().then((x) => { if (alive) setR(x); }).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!r) return null;
  const parts: [string, number, string][] = [
    ['sent as written', r.passed, colors.green],
    ['softened', r.softened, colors.greenDim],
    ['corrected', r.corrected, colors.greenBorder],
    ['held back', r.blocked, colors.danger],
  ];
  const reasons = Object.entries(r.reasons).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Mono style={styles.label}>JUDGEMENT · EVERY REPLY CHECKED BEFORE IT GOES OUT</Mono>
        <Mono style={styles.sub}>{r.checked} replies this week</Mono>
      </View>
      <Mono style={styles.explain}>
        Is it safe, honest about what it did, and backed by something WYRD knows? Unbacked specifics get a "worth double-checking" note and aren't learned; secrets and other people's details never leave.
      </Mono>
      <View style={styles.stats}>
        {parts.map(([k, v, c]) => (
          <View key={k} style={styles.stat}>
            <Display style={[styles.statV, { color: v > 0 && k !== 'sent as written' ? c : colors.mint }]}>{v}</Display>
            <Mono style={styles.sub}>{k}</Mono>
          </View>
        ))}
      </View>
      {r.checked > 0 && (
        <View style={styles.bar}>
          {parts.filter(([, v]) => v > 0).map(([k, v, c]) => <View key={k} style={{ flex: v, height: 6, backgroundColor: c }} />)}
        </View>
      )}
      {reasons.length > 0 && (
        <View style={styles.chips}>
          {reasons.map(([why, n]) => <View key={why} style={styles.chip}><Mono style={styles.chipText}>{why} · {n}</Mono></View>)}
        </View>
      )}
      {r.checked === 0 && <Mono style={styles.sub}>No replies checked yet this week.</Mono>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.greenBorder, padding: 12, gap: 8, marginTop: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim },
  sub: { fontSize: 10, color: colors.greenDim },
  explain: { fontSize: 11, lineHeight: 16, color: colors.greenDim },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { minWidth: 80 },
  statV: { fontSize: 22, color: colors.mint },
  bar: { flexDirection: 'row', gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { fontSize: 10, color: colors.mint },
});
