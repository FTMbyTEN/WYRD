import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mono } from '../components/ui';
import { colors } from '../theme';
import { Glyph } from '../components/glyph/Glyph';
import type { GlyphName } from '../components/glyph/glyphs';

export type TabKey = 'wyrd' | 'journal' | 'academy' | 'games' | 'drone' | 'you';

const TABS: { key: TabKey; label: string; glyph: GlyphName }[] = [
  { key: 'wyrd', label: 'WYRD', glyph: 'mind' },
  { key: 'journal', label: 'JOURNAL', glyph: 'journal' },
  { key: 'academy', label: 'ACADEMY', glyph: 'academy' },
  { key: 'games', label: 'GAMES', glyph: 'games' },
  { key: 'drone', label: 'DRONE', glyph: 'drone' },
  { key: 'you', label: 'YOU', glyph: 'you' },
];

/** The tabs, each a HUD glyph over a label; the live one turns cobalt and its ring turns. Bottom bar
 *  on phones/tablets; `vertical` is the desktop sidebar (icon beside label, full-height rail). */
export function TabBar({ active, onChange, vertical, drone }: { active: TabKey; onChange: (t: TabKey) => void; vertical?: boolean; drone?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={vertical
        ? [styles.rail, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]
        : [styles.bar, { paddingBottom: Math.max(10, insets.bottom + 4) }]}
    >
      <View style={vertical ? styles.column : styles.row}>
        {TABS.filter((t) => t.key !== 'drone' || drone).map(({ key, label, glyph }) => {
          const on = key === active;
          const ink = on ? colors.signal : colors.greenDim;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              style={({ pressed }) => [vertical ? styles.railBtn : styles.btn, on && styles.btnOn, pressed && !on && styles.btnPressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
            >
              <Glyph name={glyph} size={vertical ? 30 : 32} color={ink} active={on} />
              <Mono style={[vertical ? styles.railLabel : styles.label, { color: ink }]}>{label}</Mono>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.greenBorder,
    backgroundColor: colors.black, paddingHorizontal: 10, paddingTop: 8,
  },
  row: { flexDirection: 'row', gap: 6 },
  btn: { flex: 1, alignItems: 'center', gap: 1, paddingVertical: 3, borderRadius: 14 },
  btnOn: { backgroundColor: colors.signalSoft },
  btnPressed: { backgroundColor: 'rgba(0,0,0,0.06)' },
  label: { fontSize: 8.5, letterSpacing: 1.5 },

  rail: {
    width: 176, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.greenBorder,
    backgroundColor: colors.black, paddingHorizontal: 12,
  },
  column: { gap: 6 },
  railBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12 },
  railLabel: { fontSize: 11, letterSpacing: 2 },
});
