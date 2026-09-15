import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Pattern, Rect, RadialGradient, Stop } from 'react-native-svg';

/** Scanline + vignette overlay present on every phone surface in the design:
 *  `repeating-linear-gradient(0deg,rgba(0,0,0,.32) 0 1px,transparent 1px 3px)` for scanlines,
 *  `box-shadow: inset 0 0 110px rgba(0,0,0,.95)` for the vignette (approximated with a radial
 *  gradient since RN has no inset box-shadow). */
export function ScreenEffects() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <Svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <Defs>
          <Pattern id="scanlines" patternUnits="userSpaceOnUse" width={3} height={3}>
            <Rect x={0} y={0} width={3} height={1} fill="rgba(0,0,0,0.32)" />
          </Pattern>
          <RadialGradient id="vignette" cx="50%" cy="50%" r="72%">
            <Stop offset="55%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.95} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#scanlines)" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#vignette)" />
      </Svg>
    </View>
  );
}
