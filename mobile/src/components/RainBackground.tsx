import React, { useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Image, Skia } from '@shopify/react-native-skia';
import { useSkiaSurfaceLoop } from '../vortex/skiaSurfaceLoop';

const CHARS = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ<>/\\|=+*#$%'.split('');

/** Port of `initRain()` — matrix-style falling characters behind every screen, at 10% opacity
 *  in the design. Backed by a persistent Skia surface (not cleared each frame) so the fade-trail
 *  look — a translucent black rect painted over the previous frame — works the same as the
 *  original canvas-2d version. Throttled to the same ~62ms cadence as the original. */
export function RainBackground({ opacity = 0.1 }: { opacity?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const stateRef = useRef<{ drops: number[]; cols: number } | null>(null);
  const lastRef = useRef(0);
  const font = useMemo(() => Skia.Font(undefined, 13), []);

  const image = useSkiaSurfaceLoop(
    (canvas, w, h, now) => {
      const fs = 13;
      const cols = Math.max(1, Math.floor(w / fs));
      if (!stateRef.current || stateRef.current.cols !== cols) {
        stateRef.current = { cols, drops: Array.from({ length: cols }, () => (Math.random() * h) / fs) };
      }
      if (now - lastRef.current < 62) return;
      lastRef.current = now;

      const st = stateRef.current;
      canvas.drawColor(Skia.Color('rgba(0,0,0,0.09)'));
      const paint = Skia.Paint();
      for (let i = 0; i < st.cols; i++) {
        const ch = CHARS[(Math.random() * CHARS.length) | 0];
        const y = st.drops[i] * fs;
        paint.setColor(Skia.Color(Math.random() > 0.96 ? '#baffc9' : '#00ff41'));
        canvas.drawText(ch, i * fs, y, paint, font);
        if (y > h && Math.random() > 0.975) st.drops[i] = 0;
        st.drops[i] += 1;
      }
    },
    size.width,
    size.height,
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity }} onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          {image && <Image image={image} x={0} y={0} width={size.width} height={size.height} />}
        </Canvas>
      )}
    </View>
  );
}
