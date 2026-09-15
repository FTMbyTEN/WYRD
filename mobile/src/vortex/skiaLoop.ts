import { useEffect, useRef, useState } from 'react';
import { Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';

export type DrawFn = (canvas: SkCanvas, width: number, height: number, nowMs: number) => void;

/**
 * Imperative per-frame drawing for Skia, mirroring the original design's canvas-2d `ctx` calls
 * almost 1:1 (drawCircle/drawLine/drawRect/drawPoints/save/restore/translate/scale). Each RAF
 * tick records a fresh SkPicture and swaps it in — React only ever re-renders one <Picture> node,
 * the actual pixel work happens off the JS thread inside Skia.
 */
export function useSkiaLoop(draw: DrawFn, width: number, height: number, active = true) {
  const [picture, setPicture] = useState<SkPicture | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!active || width <= 0 || height <= 0) return;
    let raf = 0;
    const bounds = Skia.XYWHRect(0, 0, width, height);
    const tick = () => {
      const recorder = Skia.PictureRecorder();
      const canvas = recorder.beginRecording(bounds);
      drawRef.current(canvas, width, height, performance.now());
      setPicture(recorder.finishRecordingAsPicture());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height, active]);

  return picture;
}
