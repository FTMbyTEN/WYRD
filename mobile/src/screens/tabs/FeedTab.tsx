import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Display, Mono, Panel } from '../../components/ui';
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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel style={styles.vocabPanel}>
        <View style={styles.vocabHead}>
          <Mono style={styles.label}>VOCABULARY</Mono>
          <Mono style={styles.label}>NEXT WORD IN {countdown(stats?.nextTickAt)}</Mono>
        </View>
        <Display style={styles.vocabCount}>{(stats?.learned ?? 0).toLocaleString()} words understood</Display>
        <Mono numberOfLines={1} style={styles.recentWords}>recent · {recentWords || '—'}</Mono>
        <View style={styles.linkRow}>
          <LinkBtn label="CONCEPT MAP" onPress={onOpenConcept} />
          <LinkBtn label="GROWTH" onPress={onOpenGrowth} />
          <LinkBtn label="WORLD MAP" onPress={onOpenGlobe} />
        </View>
      </Panel>

      <View style={styles.feedHeadRow}>
        <Mono style={styles.label}>LIVE DATA FEED</Mono>
        <Pressable onPress={() => api.triggerFeed()} style={styles.ingestBtn}>
          <Mono style={{ fontSize: 9, letterSpacing: 1, color: colors.greenDim }}>INGEST NOW</Mono>
        </Pressable>
      </View>

      <View style={{ gap: 10, marginTop: 4 }}>
        {feed.length === 0 && <Mono style={{ color: colors.greenBorderDim, fontSize: 11.5, textAlign: 'center', marginTop: 10 }}>no ingests yet</Mono>}
        {feed.map((f) => (
          <View key={`${f.timestamp}-${f.title}`} style={styles.feedItem}>
            <View style={styles.feedItemHead}>
              <Mono style={styles.label}>[{f.feedSource}]</Mono>
              <Mono style={styles.label}>{timeAgo(f.timestamp)}</Mono>
            </View>
            <Mono style={styles.feedTitle}>{f.title}</Mono>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function LinkBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.linkBtn}>
      <Mono style={{ fontSize: 9.5, letterSpacing: 1, color: colors.greenDim }}>{label}</Mono>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 10, paddingBottom: 40 },
  vocabPanel: { padding: 13 },
  vocabHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  vocabCount: { marginTop: 5, fontSize: 26, lineHeight: 26 },
  recentWords: { marginTop: 5, fontSize: 10.5, color: colors.greenDim },
  linkRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  linkBtn: { flex: 1, borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2, paddingVertical: 9, alignItems: 'center' },
  feedHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  ingestBtn: { borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2, paddingHorizontal: 10, paddingVertical: 6 },
  feedItem: { backgroundColor: 'rgba(0,15,4,0.72)', borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 4, padding: 10 },
  feedItemHead: { flexDirection: 'row', justifyContent: 'space-between' },
  feedTitle: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: colors.mint },
});
