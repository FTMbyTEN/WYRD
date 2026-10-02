import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { colors } from '../../theme';

/** The Academy building, in line art: a pediment with a small globe, columns, steps, and a lit
 *  window for each book you have on the go. */
export function Campus({ width = 260, lit = 0 }: { width?: number; lit?: number }) {
  const ink = colors.mint;
  const grey = '#8a8a8a';
  const cols = [44, 76, 108, 152, 184, 216];
  return (
    <Svg width={width} height={(width * 150) / 260} viewBox="0 0 260 150">
      {/* ground and steps */}
      <Line x1="0" y1="146" x2="260" y2="146" stroke={ink} strokeWidth="1.4" />
      <Rect x="22" y="136" width="216" height="10" stroke={ink} strokeWidth="1" fill="none" />
      <Rect x="30" y="128" width="200" height="8" stroke={ink} strokeWidth="1" fill="none" />
      {/* entablature */}
      <Rect x="30" y="54" width="200" height="12" stroke={ink} strokeWidth="1.2" fill="none" />
      {[...Array(24)].map((_, i) => (
        <Line key={i} x1={36 + i * 8} y1="57" x2={36 + i * 8} y2="63" stroke={grey} strokeWidth="0.8" />
      ))}
      {/* pediment */}
      <Path d="M24 54 L130 14 L236 54 Z" stroke={ink} strokeWidth="1.4" fill="none" />
      <Path d="M44 50 L130 22 L216 50 Z" stroke={grey} strokeWidth="0.7" fill="none" />
      {/* globe in the pediment */}
      <Circle cx="130" cy="38" r="9" stroke={ink} strokeWidth="1.1" fill="#fff" />
      <Path d="M121 38 H139 M130 29 C125 34 125 42 130 47 M130 29 C135 34 135 42 130 47" stroke={ink} strokeWidth="0.8" fill="none" />
      {/* columns */}
      {cols.map((x) => (
        <React.Fragment key={x}>
          <Rect x={x - 7} y="66" width="14" height="4" stroke={ink} strokeWidth="0.9" fill="none" />
          <Line x1={x - 5} y1="70" x2={x - 5} y2="124" stroke={ink} strokeWidth="1" />
          <Line x1={x + 5} y1="70" x2={x + 5} y2="124" stroke={ink} strokeWidth="1" />
          <Line x1={x} y1="72" x2={x} y2="122" stroke={grey} strokeWidth="0.6" />
          <Rect x={x - 7} y="124" width="14" height="4" stroke={ink} strokeWidth="0.9" fill="none" />
        </React.Fragment>
      ))}
      {/* the door, and a lit window per book in progress */}
      <Path d="M121 128 V100 A9 9 0 0 1 139 100 V128" stroke={ink} strokeWidth="1.1" fill="none" />
      {[0, 1, 2, 3].map((i) => (
        <Rect
          key={i}
          x={i < 2 ? 88 + i * 12 - 4 : 160 + (i - 2) * 12 - 4}
          y="92"
          width="7"
          height="10"
          stroke={ink}
          strokeWidth="0.8"
          fill={i < lit ? ink : 'none'}
        />
      ))}
    </Svg>
  );
}

