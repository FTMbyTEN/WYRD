import React from 'react';
import { Text, View, type TextProps, type ViewProps } from 'react-native';
import { colors, fonts } from '../theme';

export function Mono({ style, ...props }: TextProps) {
  return <Text {...props} style={[{ fontFamily: fonts.mono, color: colors.greenDim }, style]} />;
}

export function Display({ style, ...props }: TextProps) {
  return <Text {...props} style={[{ fontFamily: fonts.display, color: colors.mint }, style]} />;
}

export function Label({ style, ...props }: TextProps) {
  return (
    <Mono
      {...props}
      style={[{ fontSize: 9, letterSpacing: 1, color: colors.greenDim }, style]}
    />
  );
}

export function Panel({ style, ...props }: ViewProps) {
  return (
    <View
      {...props}
      style={[
        { backgroundColor: 'rgba(0,15,4,0.75)', borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 4 },
        style,
      ]}
    />
  );
}

export function Meter({ pct, height = 6 }: { pct: number; height?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height, borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${clamped}%`, backgroundColor: colors.green }} />
    </View>
  );
}
