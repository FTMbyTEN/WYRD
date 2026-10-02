import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Display, Mono } from './ui';
import { colors } from '../theme';
import { api } from '../api/client';
import type { FilterReport } from '../api/types';
import { timeAgo } from '../util/time';

/** FEED tab: the first stage of WYRD's pipeline, the ingest filter -- what it let in today, what
 *  it skipped as already known, what it kept out and why. */
export function FilterCard() {
  const [r, setR] = useState<FilterReport | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.filterReport().then((x) => { if (alive) setR(x); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!r) return null;
  const seen = r.kept + r.duplicates + r.quarantined;
  const reasons = Object.entries(r.reasons).sort((a, b) => b[1] - a[1]);
  const cats = Object.entries(r.categories).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(([, n]) => n));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Mono style={styles.label}>FILTER · WHAT GETS INTO WYRD'S MEMORY TODAY</Mono>
        <Mono style={styles.sub}>{seen} items looked at</Mono>
      </View>

      <View style={styles.stats}>
        <Stat v={r.kept} k="let in" strong />
        <Stat v={r.duplicates} k="already known, skipped" />
        <Stat v={r.quarantined} k="kept out" />
      </View>

      {seen > 0 && (
        <View style={styles.bar}>
          {r.kept > 0 && <View style={[styles.seg, { flex: r.kept, backgroundColor: colors.green }]} />}
          {r.duplicates > 0 && <View style={[styles.seg, { flex: r.duplicates, backgroundColor: colors.greenBorder }]} />}
          {r.quarantined > 0 && <View style={[styles.seg, { flex: r.quarantined, backgroundColor: colors.danger }]} />}
        </View>
      )}

      {cats.length > 0 && (
        <View style={styles.block}>
          <Mono style={styles.label}>SORTED INTO</Mono>
          {cats.map(([c, n]) => (
            <View key={c} style={styles.catRow}>
              <Mono style={styles.catName}>{c}</Mono>
              <View style={styles.catTrack}><View style={[styles.catFill, { width: `${(n / maxCat) * 100}%` }]} /></View>
              <Mono style={styles.catN}>{n}</Mono>
            </View>
          ))}
        </View>
      )}

      {reasons.length > 0 && (
        <View style={styles.block}>
          <Mono style={styles.label}>WHY THINGS WERE KEPT OUT</Mono>
          <View style={styles.chips}>
            {reasons.map(([why, n]) => (
              <View key={why} style={styles.chip}><Mono style={styles.chipText}>{why} · {n}</Mono></View>
            ))}
          </View>
        </View>
      )}

      {r.recent.length > 0 && (
        <Pressable onPress={() => setOpen((o) => !o)}>
          <Mono style={styles.toggle}>{open ? '− hide' : '+ show'} the latest {r.recent.length} kept out</Mono>
        </Pressable>
      )}
      {open && r.recent.map((q) => (
        <Pressable key={q.id ?? q.timestamp} disabled={!q.url} onPress={() => q.url && Linking.openURL(q.url)} style={styles.item}>
          <Mono style={styles.itemMeta}>{q.source.toUpperCase()} · {timeAgo(q.timestamp)} · quality {Math.round(q.score * 100)}%</Mono>
          <Mono style={styles.itemTitle} numberOfLines={2}>{q.title}</Mono>
          <Mono style={styles.itemWhy}>{q.reasons.join(' · ')}</Mono>
        </Pressable>
      ))}

      {seen === 0 && <Mono style={styles.sub}>Nothing has come in yet today.</Mono>}
    </View>
  );
}

function Stat({ v, k, strong }: { v: number; k: string; strong?: boolean }) {
  return (
    <View style={styles.stat}>
      <Display style={[styles.statV, strong && { color: colors.green }]}>{v.toLocaleString()}</Display>
      <Mono style={styles.sub}>{k}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.greenBorder, padding: 12, gap: 10, marginTop: 14 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim },
  sub: { fontSize: 10, color: colors.greenDim },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { minWidth: 90 },
  statV: { fontSize: 22, color: colors.mint },
  bar: { flexDirection: 'row', height: 6, gap: 2 },
  seg: { height: 6 },
  block: { gap: 5 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catName: { width: 70, fontSize: 11, color: colors.mint },
  catTrack: { flex: 1, height: 5, backgroundColor: colors.greenBorderDim },
  catFill: { height: 5, backgroundColor: colors.signal },
  catN: { width: 30, textAlign: 'right', fontSize: 10, color: colors.greenDim },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { fontSize: 10, color: colors.mint },
  toggle: { fontSize: 10.5, color: colors.greenDim },
  item: { borderLeftWidth: 2, borderLeftColor: colors.danger, paddingLeft: 10, paddingVertical: 3, gap: 2 },
  itemMeta: { fontSize: 9, letterSpacing: 1.2, color: colors.greenDim },
  itemTitle: { fontSize: 12, color: colors.mint },
  itemWhy: { fontSize: 10.5, color: colors.danger },
});
