import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Picture, PointMode, Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { useSkiaLoop } from '../vortex/skiaLoop';
import { faceProject } from '../face/faceProject';
import { FACE_FACES } from '../face/faceMeshData';

type Mode = 'wire' | 'scan' | 'points';

interface Props {
  mode?: Mode;
  spin?: boolean;
  style?: React.ComponentProps<typeof View>['style'];
}

function drawFace(canvas: SkCanvas, W: number, H: number, mode: Mode, yaw: number) {
  const pad = Math.max(6, W * 0.07);
  const P = faceProject(W, H, yaw, 0.06, pad);
  canvas.clear(Skia.Color('rgba(0,0,0,0)'));
  if (!P) return;

  if (mode === 'wire') {
    (FACE_FACES || []).forEach((f) => {
      const a = P[f[0]], b = P[f[1]], c = P[f[2]];
      if (!a || !b || !c) return;
      const d = (a.d + b.d + c.d) / 3;
      const paint = Skia.Paint();
      paint.setStyle(1); // Stroke
      paint.setStrokeWidth(0.6);
      paint.setColor(Skia.Color(`rgba(0,255,65,${(0.12 + d * 0.62).toFixed(3)})`));
      const tri = Skia.Path.Make();
      tri.moveTo(a.x, a.y); tri.lineTo(b.x, b.y); tri.lineTo(c.x, c.y); tri.close();
      canvas.drawPath(tri, paint);
    });
  } else if (mode === 'scan') {
    const bands = 30;
    let minY = Infinity, maxY = -Infinity;
    P.forEach((p) => { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });
    for (let b = 0; b < bands; b++) {
      const y0 = minY + ((maxY - minY) * b) / bands;
      const y1 = minY + ((maxY - minY) * (b + 1)) / bands;
      const row = P.filter((p) => p.y >= y0 && p.y < y1).sort((m, n) => m.x - n.x);
      if (row.length < 2) continue;
      const alpha = 0.35 + 0.5 * (1 - Math.abs(b / bands - 0.45) * 2);
      const paint = Skia.Paint();
      paint.setStyle(1);
      paint.setStrokeWidth(1.5);
      paint.setStrokeCap(1); // round
      paint.setColor(Skia.Color(`rgba(0,255,65,${alpha.toFixed(3)})`));
      const midY = (y0 + y1) / 2;
      const linePath = Skia.Path.Make();
      row.forEach((p, i) => (i ? linePath.lineTo(p.x, midY) : linePath.moveTo(p.x, midY)));
      canvas.drawPath(linePath, paint);
    }
  } else {
    const s = Math.max(1, W > 300 ? 1.7 : 1);
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('rgba(0,255,65,0.55)'));
    paint.setStrokeWidth(s);
    paint.setStrokeCap(0); // butt — original drew flat squares, round would soften the look
    canvas.drawPoints(PointMode.Points, P.map((p) => ({ x: p.x, y: p.y })), paint);
  }
}

/** Port of `initFaceMark()` — the 468-point MediaPipe mesh rendered wire/scan/points, used for
 *  the header logo, YOU-tab avatar, and the vortex gate identity mark. A static mark draws once
 *  (matching the original's non-`data-spin` canvases); `spin` keeps redrawing every frame. */
export function FaceMark({ mode = 'scan', spin = false, style }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const loopPicture = useSkiaLoop(
    (canvas, W, H, now) => drawFace(canvas, W, H, mode, Math.sin(now * 0.00022) * 0.5),
    size.width,
    size.height,
    spin,
  );

  const staticPicture = useMemo<SkPicture | null>(() => {
    if (spin || size.width <= 0 || size.height <= 0) return null;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, size.width, size.height));
    drawFace(canvas, size.width, size.height, mode, 0.18);
    return recorder.finishRecordingAsPicture();
  }, [spin, size.width, size.height, mode]);

  const picture = spin ? loopPicture : staticPicture;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={[{ width: '100%', height: '100%' }, style]} onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      )}
    </View>
  );
}
