import React from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Glyph } from './glyph/Glyph';
import { Mono } from './ui';
import { frosted } from './glass';
import { colors } from '../theme';
import { useElastic } from './motion';

/**
 * ASK WYRD: a glass button floating over every screen but Dialogue Link. It opens Dialogue Link
 * already knowing where you are (AppShell passes the screen with each message), so "change this",
 * "make it darker" or "take me to my games" mean what you're looking at.
 */
export function WyrdCall({ visible, onPress, raised }: { visible: boolean; onPress: () => void; raised?: boolean }) {
  const pop = useElastic(visible);
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, raised && styles.raised]}>
      <Animated.View style={pop.pane}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Ask WYRD about this screen"
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.btn, frosted, hovered && styles.hover, pressed && styles.pressed]}
        >
          <Glyph name="chat" size={22} color={colors.signal} active />
          <Mono style={styles.label}>ASK WYRD</Mono>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 18, bottom: 22, zIndex: 900 },
  raised: { bottom: 92 }, // phones: above the tab bar
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999,
    backgroundColor: Platform.OS === 'web' ? colors.glassBg : colors.glassBgSolid,
    borderWidth: 1, borderColor: colors.glassBorder,
    shadowColor: colors.shadow, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  hover: { borderColor: colors.signal },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  label: { fontSize: 11, letterSpacing: 1.6, color: colors.mint },
});
