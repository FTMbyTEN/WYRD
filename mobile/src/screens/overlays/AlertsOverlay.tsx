import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { OverlayShell } from './OverlayShell';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useAlerts } from '../../api/alerts';

export function AlertsOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const alerts = useAlerts();
  return (
    <OverlayShell visible={visible} title="ALERTS" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        {alerts.length === 0 && (
          <Mono style={{ color: colors.greenBorderDim, fontSize: 11.5, textAlign: 'center', marginTop: 20 }}>
            nothing to report yet — derived from what WYRD has already logged (diary, COP, dreams, digest milestones)
          </Mono>
        )}
        {alerts.map((a) => (
          <View key={a.id} style={styles.item}>
            <View style={styles.itemHead}>
              <Mono style={styles.tag}>{a.tag}</Mono>
              <Mono style={styles.tag}>{a.ago}</Mono>
            </View>
            <Mono style={styles.body}>{a.body}</Mono>
          </View>
        ))}
      </ScrollView>
    </OverlayShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 10 },
  item: {
    backgroundColor: 'rgba(0,15,4,0.72)', borderWidth: 1, borderColor: colors.greenBorderDim,
    borderLeftWidth: 2, borderLeftColor: colors.green, borderRadius: 4, padding: 10,
  },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between' },
  tag: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  body: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: colors.mint },
});
