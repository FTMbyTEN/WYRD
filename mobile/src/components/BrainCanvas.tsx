import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { useSkiaLoop } from '../vortex/skiaLoop';

interface BrainPoint { x: number; y: number; z: number; s: number; ph: number }

/** Port of `initBrain()` — the node-brain visualization behind the WYRD home tab and the
 *  BRAIN_3D overlay. `nodeCount` scales the point cloud so it can visibly grow with the real
 *  neuron count once that's wired to a `nodeCount`/`bornToday` pair from the backend. */
export function BrainCanvas({ nodeCount = 150 }: { nodeCount?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const points = useMemo<BrainPoint[]>(() => {
    const N = Math.max(8, nodeCount);
    const pts: BrainPoint[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * Math.PI * (3 - Math.sqrt(5));
      let x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      z *= 1.35; x *= 0.92;
      const lobe = x > 0 ? 1 : -1;
      x += lobe * 0.12 * Math.abs(Math.sin(y * 3));
      pts.push({ x, y: y * 0.78, z, s: 0.6 + Math.random() * 0.9, ph: Math.random() * 6.28 });
    }
    return pts;
  }, [nodeCount]);

  const picture = useSkiaLoop(
    (canvas, W, H, now) => {
      const t = now * 0.00026;
      const R = Math.min(W, H) * 0.4;
      canvas.clear(Skia.Color('rgba(0,0,0,0)'));

      const ca = Math.cos(t), sa = Math.sin(t);
      const proj = points.map((p) => {
        const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca;
        const sc = 1 / (2.4 - z * 0.55);
        return { sx: W / 2 + x * R * sc * 1.6, sy: H / 2 + p.y * R * sc * 1.9, d: sc, ph: p.ph, s: p.s };
      });

      const linePaint = Skia.Paint();
      linePaint.setStyle(1);
      linePaint.setStrokeWidth(0.5);
      for (let i = 0; i < proj.length; i += 2) {
        const a = proj[i], b = proj[(i * 7 + 13) % proj.length];
        const dx = a.sx - b.sx, dy = a.sy - b.sy;
        if (dx * dx + dy * dy < (R * 0.6) * (R * 0.6)) {
          linePaint.setColor(Skia.Color(`rgba(10,156,47,${(0.14 * a.d * 2).toFixed(3)})`));
          canvas.drawLine(a.sx, a.sy, b.sx, b.sy, linePaint);
        }
      }

      const dotPaint = Skia.Paint();
      proj.forEach((p) => {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.002 + p.ph);
        dotPaint.setColor(Skia.Color(`rgba(0,255,65,${(0.25 + p.d * 0.9 * pulse).toFixed(3)})`));
        canvas.drawCircle(p.sx, p.sy, p.s * p.d * 1.5, dotPaint);
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
