import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Mono } from './ui';
import { colors } from '../theme';
import { api } from '../api/client';
import type { TrustReport, TrustScore } from '../api/types';

/** FEED tab: Bias 2 -- the sources and topics WYRD has learned to trust or doubt, from people's
 *  ratings, the filter's verdicts and corrections. */
export function TrustCard() {
  const [r, setR] = useState<TrustReport | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.trust().then((x) => { if (alive) setR(x); }).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!r) return null;
  const empty = !r.trustedSources.length && !r.doubtedSources.length && !r.trustedTopics.length && !r.doubtedTopics.length;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Mono style={styles.label}>BIAS 2 · WHAT WYRD HAS LEARNED TO TRUST</Mono>
        <Mono style={styles.sub}>{r.tracked} tracked · {Math.round(r.evidence)} pieces of evidence</Mono>
      </View>
      <Mono style={styles.explain}>
        Built from your 👍/👎, the filter's verdicts and corrections. Trusted sources rank higher when WYRD recalls what it knows; doubted ones have to work harder to get in.
      </Mono>
      {empty && <Mono style={styles.sub}>No firm opinions yet: trust forms as evidence builds up.</Mono>}
      <View style={styles.cols}>
        <Column title="TRUSTED SOURCES" items={r.trustedSources} />
        <Column title="DOUBTED SOURCES" items={r.doubtedSources} doubt />
        <Column title="TRUSTED TOPICS" items={r.trustedTopics} />
        <Column title="DOUBTED TOPICS" items={r.doubtedTopics} doubt />
      </View>
    </View>
  );
}

function Column({ title, items, doubt }: { title: string; items: TrustScore[]; doubt?: boolean }) {
  if (!items.length) return null;
  return (
    <View style={styles.col}>
      <Mono style={styles.label}>{title}</Mono>
      {items.map((s) => (
        <View key={s.key} style={styles.row}>
          <Mono style={styles.key} numberOfLines={1}>{s.key}</Mono>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(s.score * 100)}%`, backgroundColor: doubt ? colors.danger : colors.green }]} />
          </View>
          <Mono style={styles.pct}>{Math.round(s.score * 100)}%</Mono>
          <Mono style={styles.ev}>{Math.round(s.good)}+ {Math.round(s.bad)}−</Mono>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.greenBorder, padding: 12, gap: 8, marginTop: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim },
  sub: { fontSize: 10, color: colors.greenDim },
  explain: { fontSize: 11, lineHeight: 16, color: colors.greenDim },
  cols: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  col: { flexGrow: 1, flexBasis: 220, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  key: { width: 100, fontSize: 11, color: colors.mint },
  track: { flex: 1, height: 5, backgroundColor: colors.greenBorderDim },
  fill: { height: 5 },
  pct: { width: 32, textAlign: 'right', fontSize: 10, color: colors.mint },
  ev: { width: 44, textAlign: 'right', fontSize: 9, color: colors.greenDim },
});
