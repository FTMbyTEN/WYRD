import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Display } from './ui';
import { colors, fonts } from '../theme';

/** A person's profile picture, or the first letter of their name on ochre when they have none. */
export function Avatar({ uri, name, size, ring }: { uri?: string | null; name: string; size: number; ring?: string }) {
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? Math.max(2, size / 24) : 0, borderColor: ring };
  if (uri) return <Image source={{ uri }} style={[styles.base, box]} accessibilityLabel={`${name}'s picture`} />;
  return (
    <View style={[styles.base, styles.empty, box]}>
      <Display style={{ fontSize: size * 0.46, lineHeight: size * 0.52, color: colors.indigo, fontFamily: fonts.displayBold }}>
        {(name.trim()[0] ?? 'Y').toUpperCase()}
      </Display>
    </View>
  );
}


const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  empty: { backgroundColor: colors.ochre, alignItems: 'center', justifyContent: 'center' },
});
