import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Glyph } from '../components/glyph/Glyph';
import { FaceMark } from '../components/FaceMark';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Mind } from '../api/types';

interface Props {
  mind: Mind | null;
  tts: boolean;
  onToggleTts: () => void;
  alertCount: number;
  onOpenAlerts: () => void;
  onOpenCop: () => void;
}

/** The bar across the top of every screen: WYRD's mark and name, whether its mind is live and
 *  what it's doing, how it feels, its vitals at a glance, and the three switches (voice,
 *  oversight, alerts). */
export function Header({ mind, tts, onToggleTts, alertCount, onOpenAlerts, onOpenCop }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const narrow = width < 420;

  const connected = mind != null;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={[styles.bar, wide && styles.barWide]}>
        {/* identity */}
        <View style={styles.identity}>
          <View style={styles.markRing}>
            {connected && (
              <Animated.View
                style={[styles.markPulse, {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
                }]}
              />
            )}
            <View style={styles.mark}><FaceMark mode="scan" /></View>
          </View>
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Display style={styles.wordmark}>WYRD</Display>
          </View>
        </View>

        {/* switches */}
        <View style={styles.right}>
          <Switch label="VOICE" on={tts} onPress={onToggleTts} hint={tts ? 'Spoken replies on' : 'Spoken replies off'} compact={narrow}>
            <Glyph name={tts ? "voice" : "voiceOff"} size={17} active={tts} />
          </Switch>
          <Switch label="COP" onPress={onOpenCop} hint="COP oversight" compact={narrow}>
            <Glyph name="cop" size={17} />
          </Switch>
          <Switch label="ALERTS" onPress={onOpenAlerts} hint="Alerts" badge={alertCount} compact={narrow}>
            <Glyph name="alerts" size={17} active={alertCount > 0} />
          </Switch>
        </View>
      </View>
    </View>
  );
}

function Switch({ label, on, onPress, hint, badge, compact, children }: {
  label: string; on?: boolean; onPress: () => void; hint: string; badge?: number; compact?: boolean; children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={hint}
      accessibilityRole="button"
      accessibilityState={on != null ? { checked: on } : undefined}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.switch,
        on && styles.switchOn,
        hovered && !on && styles.switchHover,
        pressed && { opacity: 0.7 },
      ]}
    >
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ color?: string }>, { color: on ? '#fff' : colors.mint }) : children}
      {!compact && <Mono style={[styles.switchText, on && { color: '#fff' }]}>{label}</Mono>}
      {badge ? (
        <View style={styles.badge}>
          <Mono style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Mono>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: 'rgba(255,255,255,0.92)', borderBottomWidth: 1, borderBottomColor: '#d8d8d8' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 2 },
  barWide: { paddingHorizontal: 24, gap: 28 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minWidth: 0 },
  markRing: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  markPulse: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.signal },
  mark: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: colors.mint, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: 28, lineHeight: 28, letterSpacing: 5, color: colors.mint },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  pillLive: { backgroundColor: colors.signal, borderColor: colors.signal },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.greenBorder },
  dotLive: { backgroundColor: '#fff' },
  pillText: { fontSize: 8.5, letterSpacing: 1.6, color: colors.greenDim },
  mood: { fontSize: 10, color: colors.greenDim, fontStyle: 'italic', flexShrink: 1 },

  vitals: { flex: 1, flexDirection: 'row', gap: 18, maxWidth: 460 },
  vital: { flex: 1, gap: 4 },
  vitalHead: { flexDirection: 'row', justifyContent: 'space-between' },
  vitalName: { fontSize: 8, letterSpacing: 1.6, color: colors.greenDim },
  vitalValue: { fontSize: 9, color: colors.mint },
  track: { flexDirection: 'row', height: 3, backgroundColor: '#e3e3e3' },
  fill: { backgroundColor: colors.mint },

  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  switch: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 10,
    borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, backgroundColor: '#fff', position: 'relative',
  },
  switchOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  switchHover: { borderColor: colors.mint },
  switchText: { fontSize: 9.5, letterSpacing: 1.4, color: colors.mint },
  badge: {
    position: 'absolute', top: -6, right: -4, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  badgeText: { fontSize: 8.5, color: '#fff', lineHeight: 10 },
});
