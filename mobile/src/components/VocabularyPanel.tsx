import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Display, Mono } from './ui';
import { colors } from '../theme';
import type { LexiconStats } from '../api/types';

/**
 * WYRD's vocabulary: how many words it truly understands, the newest one featured with its
 * definition, and the other recent words as chips you can tap to feature instead.
 */
export function VocabularyPanel({ stats, actions }: { stats: LexiconStats | null; actions?: React.ReactNode }) {
  const recent = [...(stats?.recent ?? [])].reverse(); // newest first
  const [picked, setPicked] = useState<string | null>(null);
  const featured = recent.find((w) => w.word === picked) ?? recent[0];
  const learned = stats?.learned ?? 0;
  const attempted = stats?.attempted ?? 0;
  const rate = attempted > 0 ? Math.round((learned / attempted) * 100) : 0;

  return (
    <View style={styles.card}>
      <Mono style={styles.eyebrow}>VOCABULARY</Mono>

      <View style={styles.countRow}>
        <Display style={styles.count}>{learned.toLocaleString()}</Display>
        <View style={{ flex: 1 }}>
          <Mono style={styles.countLabel}>words understood</Mono>
          <Mono style={styles.countSub}>
            {attempted.toLocaleString()} looked up · {rate}% had a real definition
          </Mono>
        </View>
      </View>
      <View style={styles.meter}>
        <View style={[styles.meterFill, { width: `${rate}%` }]} />
      </View>

      {featured ? (
        <View style={styles.featured}>
          <View style={styles.featuredHead}>
            <Display style={styles.word}>{featured.word}</Display>
            {featured.partOfSpeech ? <Mono style={styles.pos}>{featured.partOfSpeech.toUpperCase()}</Mono> : null}
            {featured === recent[0] ? <Mono style={styles.newest}>NEWEST</Mono> : null}
          </View>
          <Mono style={styles.definition}>{featured.definition || 'no definition stored'}</Mono>
        </View>
      ) : (
        <Mono style={styles.empty}>No words learned yet. WYRD looks one up every 30 seconds.</Mono>
      )}

      {recent.length > 1 && (
        <View style={styles.chips}>
          {recent.map((w) => {
            const on = w.word === featured?.word;
            return (
              <Pressable key={w.word} onPress={() => setPicked(w.word)} style={[styles.chip, on && styles.chipOn]}>
                <Mono style={[styles.chipText, on && styles.chipTextOn]}>{w.word}</Mono>
              </Pressable>
            );
          })}
        </View>
      )}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.green, padding: 14, gap: 10, backgroundColor: colors.black },
  eyebrow: { fontSize: 9, letterSpacing: 2.5, color: colors.greenDim },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { fontSize: 44, lineHeight: 46, color: colors.green },
  countLabel: { fontSize: 13, color: colors.green },
  countSub: { marginTop: 2, fontSize: 10, color: colors.greenDim },
  meter: { height: 2, backgroundColor: colors.greenBorderDim },
  meterFill: { height: '100%', backgroundColor: colors.signal },
  featured: { borderLeftWidth: 2, borderLeftColor: colors.green, paddingLeft: 12, paddingVertical: 2 },
  featuredHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  word: { fontSize: 26, lineHeight: 28, color: colors.green },
  pos: { fontSize: 9, letterSpacing: 1.5, color: colors.black, backgroundColor: colors.green, paddingHorizontal: 5, paddingVertical: 1 },
  newest: { fontSize: 8.5, letterSpacing: 1.5, color: colors.greenDim },
  definition: { marginTop: 4, fontSize: 12.5, lineHeight: 19, color: colors.mint },
  empty: { fontSize: 11.5, color: colors.greenDim },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  chipText: { fontSize: 11, color: colors.green },
  chipTextOn: { color: colors.black },
  actions: { flexDirection: 'row', gap: 7, marginTop: 2 },
});
