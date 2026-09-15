import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { useSkiaLoop } from '../vortex/skiaLoop';
import type { GrowthSnapshot } from '../api/types';

/** Port of `initChart()` — GROWTH overlay. The design plots two synthetic curves; this plots the
 *  real vocabulary count and digest % from GET /api/growth, normalized to 0..1 each so both
 *  fit the same axes (the snapshot array starts empty on a fresh deploy — "no back-filled
 *  history" per the backend's own comment, so a short/empty chart here is accurate, not a bug). */
export function GrowthChartCanvas({ snapshots }: { snapshots: GrowthSnapshot[] }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const font = useMemo(() => Skia.Font(undefined, 10), []);

  const { vocab, digest } = useMemo(() => {
    if (!snapshots.length) return { vocab: [] as number[], digest: [] as number[] };
    const maxVocab = Math.max(1, ...snapshots.map((s) => s.vocabCount));
    return {
      vocab: snapshots.map((s) => s.vocabCount / maxVocab),
      digest: snapshots.map((s) => s.digestPercent / 100),
    };
  }, [snapshots]);

  const picture = useSkiaLoop(
    (canvas, W, H) => {
      const pad = 26;
      canvas.clear(Skia.Color('rgba(0,0,0,0)'));

      const gridPaint = Skia.Paint();
      gridPaint.setStyle(1);
      gridPaint.setStrokeWidth(1);
      gridPaint.setColor(Skia.Color('rgba(6,61,19,0.9)'));
      for (let i = 0; i <= 4; i++) {
        const y = pad + ((H - pad * 2) * i) / 4;
        canvas.drawLine(pad, y, W - pad, y, gridPaint);
      }

      const line = (arr: number[], color: string) => {
        if (arr.length < 2) return;
        const path = Skia.Path.Make();
        arr.forEach((v, i) => {
          const x = pad + ((W - pad * 2) * i) / (arr.length - 1);
          const y = H - pad - (H - pad * 2) * v;
          i ? path.lineTo(x, y) : path.moveTo(x, y);
        });
        const paint = Skia.Paint();
        paint.setStyle(1);
        paint.setStrokeWidth(1.6);
        paint.setColor(Skia.Color(color));
        canvas.drawPath(path, paint);
      };
      line(vocab, '#00ff41');
      line(digest, '#33ccff');

      const labelPaint1 = Skia.Paint();
      labelPaint1.setColor(Skia.Color('#00ff41'));
      canvas.drawText('— vocabulary', pad, pad - 8, labelPaint1, font);
      const labelPaint2 = Skia.Paint();
      labelPaint2.setColor(Skia.Color('#33ccff'));
      canvas.drawText('— digest %', pad + 110, pad - 8, labelPaint2, font);

      if (!snapshots.length) {
        const emptyPaint = Skia.Paint();
        emptyPaint.setColor(Skia.Color('#063d13'));
        const msg = 'no snapshots yet — tracked forward from here';
        canvas.drawText(msg, W / 2 - font.getTextWidth(msg) / 2, H / 2, emptyPaint, font);
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
    <View style={{ width: '100%', height: '100%' }} onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      )}
    </View>
  );
}
