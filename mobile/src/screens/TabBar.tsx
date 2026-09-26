import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Mono } from '../components/ui';
import { colors } from '../theme';

export type TabKey = 'wyrd' | 'journal' | 'drone' | 'you';

const TABS: { key: TabKey; label: string; Icon: (p: { color: string }) => React.ReactElement }[] = [
  { key: 'wyrd', label: 'WYRD', Icon: MindIcon },
  { key: 'journal', label: 'JOURNAL', Icon: JournalIcon },
  { key: 'drone', label: 'DRONE', Icon: DroneIcon },
  { key: 'you', label: 'YOU', Icon: YouIcon },
];

/** Four tabs, each a line icon over a label; the active one sits in a solid ink pill. */
export function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {TABS.map(({ key, label, Icon }) => {
          const on = key === active;
          const ink = on ? colors.black : colors.greenDim;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              style={({ pressed }) => [styles.btn, on && styles.btnOn, pressed && !on && styles.btnPressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
            >
              <Icon color={ink} />
              <Mono style={[styles.label, { color: ink }]}>{label}</Mono>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const ICON = 20;
const STROKE = 1.5;

/** Three linked nodes -- WYRD's mind. */
function MindIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 20 20">
      <Line x1="5" y1="6" x2="14" y2="5" stroke={color} strokeWidth={STROKE} />
      <Line x1="5" y1="6" x2="10" y2="15" stroke={color} strokeWidth={STROKE} />
      <Line x1="14" y1="5" x2="10" y2="15" stroke={color} strokeWidth={STROKE} />
      <Circle cx="5" cy="6" r="2.4" fill={color} />
      <Circle cx="14" cy="5" r="2.4" fill={color} />
      <Circle cx="10" cy="15" r="2.4" fill={color} />
    </Svg>
  );
}

/** An open notebook with ruled lines. */
function JournalIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 20 20">
      <Rect x="3.5" y="2.5" width="13" height="15" rx="1.5" stroke={color} strokeWidth={STROKE} fill="none" />
      <Line x1="7" y1="7" x2="13" y2="7" stroke={color} strokeWidth={STROKE} />
      <Line x1="7" y1="10" x2="13" y2="10" stroke={color} strokeWidth={STROKE} />
      <Line x1="7" y1="13" x2="11" y2="13" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

/** A quadcopter from above: X frame, four rotors. */
function DroneIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 20 20">
      <Line x1="5" y1="5" x2="15" y2="15" stroke={color} strokeWidth={STROKE} />
      <Line x1="15" y1="5" x2="5" y2="15" stroke={color} strokeWidth={STROKE} />
      {[
        [4.5, 4.5],
        [15.5, 4.5],
        [4.5, 15.5],
        [15.5, 15.5],
      ].map(([x, y]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r="3" stroke={color} strokeWidth={STROKE} fill="none" />
      ))}
      <Rect x="8.3" y="8.3" width="3.4" height="3.4" fill={color} />
    </Svg>
  );
}

/** Head and shoulders. */
function YouIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 20 20">
      <Circle cx="10" cy="7" r="3.5" stroke={color} strokeWidth={STROKE} fill="none" />
      <Path d="M3.5 17.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke={color} strokeWidth={STROKE} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.greenBorder,
    backgroundColor: colors.black, paddingHorizontal: 10, paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
  },
  row: { flexDirection: 'row', gap: 6 },
  btn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 7, borderRadius: 14 },
  btnOn: { backgroundColor: colors.green },
  btnPressed: { backgroundColor: 'rgba(0,0,0,0.06)' },
  label: { fontSize: 8.5, letterSpacing: 1.5 },
});
