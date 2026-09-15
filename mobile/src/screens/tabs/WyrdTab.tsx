import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BrainCanvas } from '../../components/BrainCanvas';
import { Display, Mono, Panel } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import { useFeed, useFeedNext, useMind, useReasoning, useReasoningNext } from '../../api/hooks';
import { countdown, timeAgo } from '../../util/time';
import { firstLineFromMarkdown } from '../../util/text';

export function WyrdTab({ onOpenBrain, onOpenLink }: { onOpenBrain: () => void; onOpenLink: () => void }) {
  const { mind } = useMind();
  const { items: feed } = useFeed();
  const feedNext = useFeedNext();
  const { notes } = useReasoning();
  const reasoningNext = useReasoningNext();

  const mood = mind?.mood ?? '—';
  const focus = mind?.focusTopic ?? 'nothing yet';
  const curPct = Math.round((mind?.curiosity ?? 0) * 100);
  const confPct = Math.round((mind?.confidence ?? 0) * 100);
  const digestPct = mind?.digest?.percent ?? 0;
  const latestFeed = feed[0];
  const latestNote = notes[0];

  return (
    <View style={{ flex: 1 }}>
      <View style={StyleSheet.absoluteFill}>
        <BrainCanvas />
      </View>
      <View style={styles.heroWrap}>
        <View style={styles.hero}>
          <Mono style={styles.moodLabel}>MOOD</Mono>
          <Display style={styles.moodValue}>{mood}</Display>
          <Mono style={styles.focusLine}>focus · {focus}</Mono>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Panel style={[styles.statCell, styles.noRadius]}>
          <Mono style={styles.statLabel}>CURIOSITY</Mono>
          <View style={styles.miniMeter}><View style={[styles.miniMeterFill, { width: `${curPct}%` }]} /></View>
        </Panel>
        <Panel style={[styles.statCell, styles.noRadius]}>
          <Mono style={styles.statLabel}>CONFIDENCE</Mono>
          <View style={styles.miniMeter}><View style={[styles.miniMeterFill, { width: `${confPct}%` }]} /></View>
        </Panel>
        <Panel style={[styles.statCell, styles.noRadius]}>
          <Mono style={styles.statLabel}>DIGEST</Mono>
          <Display style={styles.digestValue}>{digestPct}%</Display>
        </Panel>
      </View>

      <View style={styles.actionRow}>
        <ActionBtn label="INGEST NOW" onPress={() => api.triggerFeed()} />
        <ActionBtn label="THINK NOW" onPress={() => api.triggerReasoning()} />
        <ActionBtn label="BRAIN_3D ↗" onPress={onOpenBrain} />
      </View>

      <View style={styles.tickerRow}>
        <TickerCard
          label={`NET_FEED · NEXT ${countdown(feedNext?.nextTickAt)}`}
          text={latestFeed ? `[${latestFeed.feedSource}] ${latestFeed.title}` : 'waiting on the first ingest…'}
        />
        <TickerCard
          label={`REASONING · NEXT ${countdown(reasoningNext?.nextTickAt)}`}
          text={latestNote ? firstLineFromMarkdown(latestNote.content, 60) : 'no reasoning notes yet'}
        />
      </View>

      <View style={styles.lastThoughtWrap}>
        <Mono style={styles.lastThoughtLabel}>
          LAST THOUGHT · {latestNote ? timeAgo(mind?.updatedAt ?? Date.now()) : '—'}
        </Mono>
        <Mono style={styles.lastThoughtText}>
          {latestNote ? firstLineFromMarkdown(latestNote.content) : mind?.activeGoal || 'still forming one.'}
        </Mono>
        <Pressable onPress={onOpenLink} style={styles.dialogueBtn}>
          <Mono style={{ color: colors.green, fontSize: 12, letterSpacing: 2 }}>{'> OPEN DIALOGUE_LINK'}</Mono>
        </Pressable>
      </View>
    </View>
  );
}

function ActionBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn}>
      <Mono style={{ fontSize: 9.5, letterSpacing: 1, color: colors.greenDim }}>{label}</Mono>
    </Pressable>
  );
}

function TickerCard({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.tickerCard}>
      <View style={styles.tickerHeadRow}>
        <View style={styles.pulseDot} />
        <Mono style={styles.tickerLabel}>{label}</Mono>
      </View>
      <Mono numberOfLines={1} style={styles.tickerText}>{text}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  hero: {
    alignItems: 'center', paddingVertical: 22, paddingHorizontal: 26,
    backgroundColor: 'rgba(0,15,4,0.4)', borderRadius: 999,
  },
  moodLabel: { fontSize: 10, letterSpacing: 3, color: colors.greenDim },
  moodValue: { fontSize: 56, lineHeight: 56, textShadowColor: colors.green, textShadowRadius: 22 },
  focusLine: { marginTop: 6, fontSize: 11, color: colors.greenDim },
  statsRow: { flexDirection: 'row' },
  noRadius: { borderRadius: 0, borderLeftWidth: 0, borderRightWidth: 0 },
  statCell: { flex: 1, padding: 10, gap: 5 },
  statLabel: { fontSize: 8.5, letterSpacing: 1, color: colors.greenDim },
  miniMeter: { height: 6, borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2, overflow: 'hidden' },
  miniMeterFill: { height: '100%', backgroundColor: colors.green },
  digestValue: { fontSize: 19, marginTop: 2 },
  actionRow: {
    flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: 'rgba(0,10,3,0.92)',
  },
  actionBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2,
    paddingVertical: 9, alignItems: 'center',
  },
  tickerRow: {
    flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: 'rgba(0,10,3,0.92)',
  },
  tickerCard: { flex: 1, borderWidth: 1, borderColor: '#063d13', borderRadius: 2, padding: 9, minWidth: 0 },
  tickerHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pulseDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  tickerLabel: { fontSize: 8.5, letterSpacing: 1, color: colors.greenDim },
  tickerText: { marginTop: 3, fontSize: 10.5, color: colors.mint },
  lastThoughtWrap: { padding: 14, backgroundColor: 'rgba(0,10,3,0.92)' },
  lastThoughtLabel: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  lastThoughtText: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: colors.mint },
  dialogueBtn: {
    marginTop: 12, borderWidth: 1, borderColor: colors.green, borderRadius: 2,
    paddingVertical: 14, alignItems: 'center',
  },
});
