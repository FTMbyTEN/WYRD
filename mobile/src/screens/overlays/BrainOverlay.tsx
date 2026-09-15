import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { OverlayShell } from './OverlayShell';
import { BrainCanvas } from '../../components/BrainCanvas';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useGrowth, useLexicon } from '../../api/hooks';

/** The design's brain visual scales purely on look, not a literal node count; the real backend's
 *  brain3d.html derives neuron growth client-side with no dedicated endpoint (confirmed absent
 *  from server.js). We show the real vocabulary count as "NEURONS" (a genuinely growing number
 *  from GET /api/lexicon/stats) and the vocab delta since local midnight as "LEARNED TODAY" from
 *  GET /api/growth's snapshot history, instead of a fabricated neuron counter. */
export function BrainOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { stats } = useLexicon();
  const { snapshots } = useGrowth();

  const learnedToday = useMemo(() => {
    if (!snapshots.length) return null;
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const before = [...snapshots].reverse().find((s) => new Date(s.timestamp).getTime() < midnight.getTime());
    const latest = snapshots[snapshots.length - 1];
    if (!before) return null;
    return Math.max(0, latest.vocabCount - before.vocabCount);
  }, [snapshots]);

  return (
    <OverlayShell
      visible={visible}
      title="BRAIN_3D"
      onClose={onClose}
      footer={
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Mono style={styles.statLabel}>NEURONS</Mono>
            <Display style={styles.statValue}>{(stats?.learned ?? 0).toLocaleString()}</Display>
          </View>
          <View style={styles.statCell}>
            <Mono style={styles.statLabel}>LEARNED TODAY</Mono>
            <Display style={styles.statValue}>{learnedToday ?? '—'}</Display>
          </View>
        </View>
      }
    >
      <View style={{ flex: 1 }}>
        <BrainCanvas nodeCount={Math.min(400, Math.max(80, stats?.learned ?? 150))} />
        <Mono style={styles.caption}>NODES GROW AS IT LEARNS · NOT A FIXED PROP</Mono>
      </View>
    </OverlayShell>
  );
}

const styles = StyleSheet.create({
  caption: { position: 'absolute', left: 14, bottom: 14, fontSize: 9.5, letterSpacing: 1, color: colors.greenDim },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.greenBorder, paddingBottom: 18 },
  statCell: { flex: 1, padding: 13, borderRightWidth: 1, borderRightColor: colors.greenBorder },
  statLabel: { fontSize: 8.5, letterSpacing: 1, color: colors.greenDim },
  statValue: { fontSize: 24, marginTop: 2 },
});
