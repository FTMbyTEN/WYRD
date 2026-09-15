import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Mono } from '../components/ui';
import { colors } from '../theme';

export type TabKey = 'wyrd' | 'diary' | 'cop' | 'feed' | 'you';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'wyrd', label: 'WYRD' },
  { key: 'diary', label: 'DIARY' },
  { key: 'cop', label: 'COP' },
  { key: 'feed', label: 'FEED' },
  { key: 'you', label: 'YOU' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <View style={styles.row}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={styles.btn}>
            <View style={[styles.topBorder, { backgroundColor: isActive ? colors.green : 'transparent' }]} />
            <Mono style={{ fontSize: 9, letterSpacing: 1, color: isActive ? colors.green : colors.greenDim }}>
              {t.label}
            </Mono>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.greenBorder,
    backgroundColor: 'rgba(0,15,4,0.92)', paddingBottom: Platform.OS === 'ios' ? 18 : 10,
  },
  btn: { flex: 1, alignItems: 'center', paddingTop: 11, paddingBottom: 7 },
  topBorder: { position: 'absolute', top: -1, left: 0, right: 0, height: 2 },
});
