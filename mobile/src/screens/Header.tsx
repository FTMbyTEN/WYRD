import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FaceMark } from '../components/FaceMark';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import { clockHHMM } from '../util/time';
import type { Mind } from '../api/types';

interface Props {
  mind: Mind | null;
  tts: boolean;
  onToggleTts: () => void;
  alertCount: number;
  onOpenAlerts: () => void;
}

export function Header({ mind, tts, onToggleTts, alertCount, onOpenAlerts }: Props) {
  const statusLine = mind
    ? `STATUS: ${(mind.curiosity ?? 0) > 0.7 ? 'INGESTING' : 'IDLE'} // ${new Date(mind.updatedAt).toTimeString().slice(0, 8)}`
    : 'STATUS: CONNECTING…';

  return (
    <View>
      <View style={styles.clockRow}>
        <Mono style={{ color: colors.mint, fontSize: 11 }}>{clockHHMM()}</Mono>
        <Mono style={{ color: colors.greenDim, fontSize: 11 }}>▮▮▮ LTE ▰</Mono>
      </View>
      <View style={styles.idRow}>
        <View style={styles.avatar}>
          <FaceMark mode="scan" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.wordmarkRow}>
            <Display style={styles.wordmark}>WYRD</Display>
            <View style={styles.turboBadge}>
              <Mono style={styles.turboText}>TURBO</Mono>
            </View>
          </View>
          <Mono numberOfLines={1} style={styles.statusText}>{statusLine}</Mono>
        </View>
        <Pressable onPress={onToggleTts} style={styles.iconBtn}>
          <Mono style={{ fontSize: 10, letterSpacing: 1, color: tts ? colors.green : colors.greenDim }}>TTS</Mono>
        </Pressable>
        <Pressable onPress={onOpenAlerts} style={styles.iconBtn}>
          <Mono style={{ fontSize: 10, letterSpacing: 1, color: colors.greenDim }}>ALERTS</Mono>
          {alertCount > 0 && (
            <View style={styles.badge}>
              <Mono style={styles.badgeText}>{alertCount}</Mono>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clockRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4,
  },
  idRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#063d13',
  },
  avatar: { width: 34, height: 34 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wordmark: { fontSize: 24, letterSpacing: 3, lineHeight: 24, textShadowColor: colors.green, textShadowRadius: 10 },
  turboBadge: { backgroundColor: colors.green, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2 },
  turboText: { fontSize: 8, letterSpacing: 1, color: '#000' },
  statusText: { fontSize: 9, letterSpacing: 1, color: '#0a9c2f', marginTop: 2 },
  iconBtn: {
    borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 2,
    paddingHorizontal: 9, paddingVertical: 7, position: 'relative',
  },
  badge: {
    position: 'absolute', top: -6, right: -6, minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  badgeText: { fontSize: 9, color: '#000', lineHeight: 11 },
});
