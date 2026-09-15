import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { useSkiaLoop } from '../vortex/skiaLoop';
import type { CountryListItem } from '../api/types';

interface Props {
  countries: CountryListItem[];
  focused?: CountryListItem | null;
}

/** Port of `initGlobe()` — the WORLD_MAP overlay's wireframe globe with lat/long rings and
 *  marker dots. `focused` (resolved from the chat's `open_world_map` action or a marker tap)
 *  gets highlighted the way the design highlights its first/"home" marker. */
export function GlobeCanvas({ countries, focused }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const marks = countries.length ? countries : [{ lat: 64.1, lng: -21.9 } as CountryListItem];

  const picture = useSkiaLoop(
    (canvas, W, H, now) => {
      const R = Math.min(W, H) * 0.38, cx = W / 2, cy = H / 2;
      const yaw = now * 0.00022;
      canvas.clear(Skia.Color('rgba(0,0,0,0)'));

      const latPaint = Skia.Paint();
      latPaint.setStyle(1);
      latPaint.setStrokeWidth(0.6);
      latPaint.setColor(Skia.Color('rgba(10,156,47,0.5)'));
      for (let la = -60; la <= 60; la += 30) {
        const r = R * Math.cos((la * Math.PI) / 180);
        const y = cy - R * Math.sin((la * Math.PI) / 180);
        const oval = Skia.XYWHRect(cx - r, y - r * 0.22, r * 2, r * 0.44);
        canvas.drawOval(oval, latPaint);
      }
      for (let lo = 0; lo < 180; lo += 22.5) {
        const a = (lo * Math.PI) / 180 + yaw;
        const lonPaint = Skia.Paint();
        lonPaint.setStyle(1);
        lonPaint.setStrokeWidth(0.6);
        lonPaint.setColor(Skia.Color(`rgba(10,156,47,${(0.25 + 0.35 * Math.abs(Math.cos(a))).toFixed(3)})`));
        const rw = Math.abs(R * Math.cos(a));
        canvas.drawOval(Skia.XYWHRect(cx - rw, cy - R, rw * 2, R * 2), lonPaint);
      }
      const rimPaint = Skia.Paint();
      rimPaint.setStyle(1);
      rimPaint.setStrokeWidth(1);
      rimPaint.setColor(Skia.Color('rgba(0,255,65,0.75)'));
      canvas.drawCircle(cx, cy, R, rimPaint);

      marks.forEach((c) => {
        const a = (c.lng * Math.PI) / 180 + yaw, b = (c.lat * Math.PI) / 180;
        const x = Math.cos(b) * Math.sin(a), z = Math.cos(b) * Math.cos(a), y = Math.sin(b);
        if (z < 0) return;
        const sx = cx + x * R, sy = cy - y * R;
        const isFocused = focused && c.cca3 === focused.cca3;
        const dotPaint = Skia.Paint();
        dotPaint.setColor(Skia.Color(isFocused ? '#baffc9' : 'rgba(0,255,65,0.85)'));
        canvas.drawCircle(sx, sy, isFocused ? 3.4 : 2.2, dotPaint);
        if (isFocused) {
          const ringPaint = Skia.Paint();
          ringPaint.setStyle(1);
          ringPaint.setStrokeWidth(1);
          ringPaint.setColor(Skia.Color('rgba(186,255,201,0.6)'));
          canvas.drawCircle(sx, sy, 8, ringPaint);
        }
      });
    },
    size.width,
    size.height,
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={{ width: '100%', height: '100%' }} onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      )}
    </View>
  );
}
