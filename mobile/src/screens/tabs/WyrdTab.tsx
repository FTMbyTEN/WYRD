import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BrainCanvas } from '../../components/BrainCanvas';
import { GroundLight } from '../../components/Holo';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useBrainActivitySignal, useFeed, useFeedNext, useMind, useReasoning, useReasoningNext } from '../../api/hooks';
import { countdown, timeAgo } from '../../util/time';
import { firstLineFromMarkdown } from '../../util/text';

export function WyrdTab({ onOpenBrain, onOpenLink }: { onOpenBrain: () => void; onOpenLink: () => void }) {
  const { mind } = useMind();
  const { items: feed } = useFeed();
  const feedNext = useFeedNext();
  const { notes } = useReasoning();
  const reasoningNext = useReasoningNext();
  const brainActivity = useBrainActivitySignal();

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
        <BrainCanvas activitySignal={brainActivity} />
      </View>
      <View style={styles.heroWrap}>
        <View style={styles.hero}>
          <Mono style={styles.moodLabel}>MOOD</Mono>
          <Display style={styles.moodValue}>{mood}</Display>
          <Mono style={styles.focusLine}>focus · {focus}</Mono>
        </View>

        <HoloStat label="CURIOSITY" value={`${curPct}%`} pct={curPct} style={styles.holoLeft} beamStyle={styles.beamLeft} />
        <HoloStat label="CONFIDENCE" value={`${confPct}%`} pct={confPct} style={styles.holoRight} beamStyle={styles.beamRight} />
        <HoloStat label="DIGEST" value={`${digestPct}%`} pct={digestPct} style={styles.holoCenter} beamStyle={styles.beamCenter} big />
      </View>

      <View style={styles.actionRow}>
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

/** A holographic readout projected off the brain, sci-fi-HUD style: a thin beam rising from the
 *  brain into a glass panel, with a soft green glow pooling underneath it — not a bordered stat
 *  box sitting in a row. `pct` drives both the meter fill and how bright the panel reads, so a
 *  higher value visibly "lights up" more, same idea as the projection intensifying with signal. */
function HoloStat({ label, value, pct, style, beamStyle, big }: {
  label: string; value: string; pct: number; style: any; beamStyle: any; big?: boolean;
}) {
  const glow = 0.25 + Math.min(1, Math.max(0, pct / 100)) * 0.55;
  return (
    <View style={[styles.holoWrap, style]} pointerEvents="none">
      <View style={[styles.beam, beamStyle]} />
      <View style={styles.beamAnchor} />
      <View style={[styles.holoCard, big && styles.holoCardBig, { shadowOpacity: glow, borderColor: `rgba(0,255,65,${glow})` }]}>
        <Mono style={styles.holoLabel}>{label}</Mono>
        <Display style={[styles.holoValue, big && styles.holoValueBig, { textShadowRadius: 10 + glow * 14 }]}>{value}</Display>
        <View style={styles.holoMeter}>
          <View style={[styles.holoMeterFill, { width: `${pct}%`, opacity: 0.6 + glow * 0.4 }]} />
        </View>
      </View>
      <GroundLight glow={glow} />
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
  heroWrap: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  hero: {
    alignItems: 'center', paddingVertical: 22, paddingHorizontal: 26,
    backgroundColor: 'rgba(0,15,4,0.4)', borderRadius: 999,
  },
  moodLabel: { fontSize: 10, letterSpacing: 3, color: colors.greenDim },
  moodValue: { fontSize: 56, lineHeight: 56, textShadowColor: colors.green, textShadowRadius: 22 },
  focusLine: { marginTop: 6, fontSize: 11, color: colors.greenDim },

  // ---- Holographic projections: beam rising off the brain into a floating glass readout, with
  // a soft glow pooling under it — sci-fi HUD callout, not a bordered stat box in a row. Percent
  // positions keep the three readouts anchored around the brain regardless of screen size.
  holoWrap: { position: 'absolute', alignItems: 'center' },
  holoLeft: { left: '2%', bottom: '20%' },
  holoRight: { right: '2%', bottom: '20%' },
  holoCenter: { bottom: '2%', alignSelf: 'center' },
  beam: { width: 1, backgroundColor: 'rgba(0,255,65,0.45)' },
  beamLeft: { height: 34 },
  beamRight: { height: 34 },
  beamCenter: { height: 20 },
  beamAnchor: {
    position: 'absolute', top: -3, width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.green, shadowColor: colors.green, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  holoCard: {
    marginTop: 2, width: 112, padding: 9, borderRadius: 6, borderWidth: 1,
    backgroundColor: 'rgba(0,15,4,0.38)',
    shadowColor: colors.green, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  holoCardBig: { width: 128, alignItems: 'center' },
  holoLabel: { fontSize: 8, letterSpacing: 1.5, color: colors.greenDim },
  holoValue: { fontSize: 20, marginTop: 3, textShadowColor: colors.green },
  holoValueBig: { fontSize: 30 },
  holoMeter: { marginTop: 6, height: 4, borderRadius: 2, backgroundColor: 'rgba(10,156,47,0.25)', overflow: 'hidden', width: '100%' },
  holoMeterFill: { height: '100%', backgroundColor: colors.green },
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
