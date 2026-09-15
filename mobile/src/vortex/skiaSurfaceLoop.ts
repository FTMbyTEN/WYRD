import { useEffect, useRef, useState } from 'react';
import { Skia, type SkCanvas, type SkImage } from '@shopify/react-native-skia';

export type SurfaceDrawFn = (canvas: SkCanvas, width: number, height: number, nowMs: number) => void;

/**
 * Like useSkiaLoop, but backed by a persistent offscreen SkSurface instead of a fresh
 * PictureRecorder every frame — needed for effects that deliberately DON'T clear each frame
 * (the matrix-rain trail fade relies on drawing a translucent rect over the previous frame's
 * pixels rather than starting blank, exactly like the original canvas-2d `ctx`).
 */
export function useSkiaSurfaceLoop(draw: SurfaceDrawFn, width: number, height: number, active = true) {
  const [image, setImage] = useState<SkImage | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!active || width <= 0 || height <= 0) return;
    const surface = Skia.Surface.Make(Math.ceil(width), Math.ceil(height));
    if (!surface) return;
    const canvas = surface.getCanvas();
    let raf = 0;
    const tick = () => {
      drawRef.current(canvas, width, height, performance.now());
      surface.flush();
      setImage(surface.makeImageSnapshot());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height, active]);

  return image;
}
