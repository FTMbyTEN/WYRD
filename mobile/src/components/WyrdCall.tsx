import React from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { FaceMark } from './FaceMark';
import { frosted } from './glass';
import { colors } from '../theme';
import { useElastic } from './motion';

/**
 * ASK WYRD: WYRD's face mark in a round glass button, floating over every screen but home and
 * Dialogue Link. It opens Dialogue Link
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
          <View style={styles.mark}><FaceMark mode="scan" /></View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 18, bottom: 22, zIndex: 900 },
  raised: { bottom: 92 }, // phones: above the tab bar
  btn: {
    width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29,
    backgroundColor: Platform.OS === 'web' ? colors.glassBg : colors.glassBgSolid,
    borderWidth: 1, borderColor: colors.glassBorder,
    shadowColor: colors.shadow, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  hover: { borderColor: colors.signal },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  mark: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
});
