import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { HoloButton, HoloFrame } from '../../components/Holo';
import { colors } from '../../theme';
import { api } from '../../api/client';
import { useFeed, useLexicon } from '../../api/hooks';
import { countdown, timeAgo } from '../../util/time';

interface Props {
  onOpenConcept: () => void;
  onOpenGrowth: () => void;
  onOpenGlobe: () => void;
}

export function FeedTab({ onOpenConcept, onOpenGrowth, onOpenGlobe }: Props) {
  const { stats } = useLexicon();
  const { items: feed } = useFeed();
  const recentWords = (stats?.recent ?? []).map((w) => w.word).join(' · ');

  const learned = stats?.learned ?? 0;
  const vocabGlow = Math.min(1, 0.35 + learned / 4000);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <HoloFrame glow={vocabGlow} beam={false} style={styles.vocabWrap}>
        <View style={styles.vocabPanel}>
          <View style={styles.vocabHead}>
            <Mono style={styles.label}>VOCABULARY</Mono>
            <Mono style={styles.label}>NEXT WORD IN {countdown(stats?.nextTickAt)}</Mono>
          </View>
          <Display style={styles.vocabCount}>{learned.toLocaleString()} words understood</Display>
          <Mono numberOfLines={1} style={styles.recentWords}>recent · {recentWords || '—'}</Mono>
          <View style={styles.linkRow}>
            <HoloButton label="CONCEPT MAP" onPress={onOpenConcept} />
            <HoloButton label="GROWTH" onPress={onOpenGrowth} />
            <HoloButton label="WORLD MAP" onPress={onOpenGlobe} />
          </View>
        </View>
      </HoloFrame>

      <View style={styles.feedHeadRow}>
        <Mono style={styles.label}>LIVE DATA FEED</Mono>
        <View style={{ width: 110 }}><HoloButton label="INGEST NOW" onPress={() => api.triggerFeed()} /></View>
      </View>

      <View style={{ gap: 10, marginTop: 4 }}>
        {feed.length === 0 && <Mono style={{ color: colors.greenBorderDim, fontSize: 11.5, textAlign: 'center', marginTop: 10 }}>no ingests yet</Mono>}
        {feed.map((f) => (
          <View key={`${f.timestamp}-${f.title}`} style={styles.feedItem}>
            <View style={styles.feedItemGlow} />
            <View style={styles.feedItemBody}>
              <View style={styles.feedItemHead}>
                <Mono style={styles.label}>[{f.feedSource}]</Mono>
                <Mono style={styles.label}>{timeAgo(f.timestamp)}</Mono>
              </View>
              <Mono style={styles.feedTitle}>{f.title}</Mono>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 14, paddingBottom: 40 },
  vocabWrap: { width: '100%' },
  vocabPanel: { padding: 13 },
  vocabHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  vocabCount: { marginTop: 5, fontSize: 26, lineHeight: 26 },
  recentWords: { marginTop: 5, fontSize: 10.5, color: colors.greenDim },
  linkRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  feedHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  // A thin glowing "signal" bar on each feed item instead of a full holo-frame per row — the
  // full projection treatment reads fine once (vocabulary), but repeated down a scrolling list
  // it would be noise; this keeps the same light-source language at a lighter touch.
  feedItem: { flexDirection: 'row', borderRadius: 4, overflow: 'hidden' },
  feedItemGlow: {
    width: 3, backgroundColor: colors.green, shadowColor: colors.green,
    shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  feedItemBody: { flex: 1, backgroundColor: 'rgba(0,15,4,0.72)', borderWidth: 1, borderLeftWidth: 0, borderColor: colors.greenBorderDim, padding: 10 },
  feedItemHead: { flexDirection: 'row', justifyContent: 'space-between' },
  feedTitle: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: colors.mint },
});
