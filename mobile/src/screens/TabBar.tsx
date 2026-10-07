import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mono } from '../components/ui';
import { colors, fonts } from '../theme';
import { Glyph } from '../components/glyph/Glyph';
import { Avatar } from '../components/Avatar';
import { useProfile } from '../api/hooks';
import { useAuth } from '../api/AuthContext';
import type { GlyphName } from '../components/glyph/glyphs';

export type TabKey = 'wyrd' | 'journal' | 'academy' | 'games' | 'drone' | 'you' | 'settings';

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
  const { profile } = useProfile();
  const { email } = useAuth();
  const me = profile?.username || (email ?? 'You').split('@')[0];
  return (
    <View
      style={vertical
        ? [styles.rail, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]
        : [styles.bar, { paddingBottom: Math.max(10, insets.bottom + 4) }]}
    >
      <View style={vertical ? styles.column : styles.row}>
        {TABS.filter((t) => ((t.key !== 'drone' && t.key !== 'journal') || drone) && !(vertical && t.key === 'you')).map(({ key, label, glyph }) => {
          const on = key === active;
          const ink = on ? colors.onSignal : colors.greenDim; // the active tab: cream on a terracotta pill
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
              <Mono style={[vertical ? styles.railLabel : styles.label, { color: ink }]}>{label === 'WYRD' ? label : label.charAt(0) + label.slice(1).toLowerCase()}</Mono>
            </Pressable>
          );
        })}
      </View>
      {/* desktop: settings sits apart, at the foot of the rail */}
      {vertical ? (() => {
        const on = active === 'settings' || active === 'you'; // desktop: you and your settings are one page
        const ink = on ? colors.onSignal : colors.greenDim;
        return (
          <Pressable onPress={() => onChange('settings')} style={({ pressed }) => [styles.railBtn, styles.settingsBtn, on && styles.btnOn, pressed && !on && styles.btnPressed]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel="You and settings">
            <Avatar uri={profile?.avatar} name={me} size={34} ring={on ? colors.onSignal : undefined} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Mono numberOfLines={1} style={[styles.railLabel, { color: ink, textTransform: 'none' }]}>{me}</Mono>
              <Mono style={[styles.railSub, { color: ink }]}>Settings</Mono>
            </View>
          </Pressable>
        );
      })() : null}
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
  btnOn: { backgroundColor: colors.signal },
  btnPressed: { backgroundColor: colors.signalSoft },
  label: { fontSize: 9.5, letterSpacing: 0.4, fontFamily: fonts.bodyBold },

  rail: {
    width: 176, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.greenBorder,
    backgroundColor: colors.black, paddingHorizontal: 12,
  },
  column: { gap: 6 },
  railBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  settingsBtn: { marginTop: 'auto', paddingLeft: 8 },
  railSub: { fontSize: 10, letterSpacing: 0.3, opacity: 0.8 },
  railLabel: { fontSize: 13, letterSpacing: 0.4, fontFamily: fonts.bodyBold, textTransform: 'capitalize' },
});
