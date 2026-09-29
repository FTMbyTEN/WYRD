import { useEffect, useRef, useState } from 'react';
import { Skia, type SkCanvas, type SkImage } from '@shopify/react-native-skia';
import { disposeSoon, pageHidden, withArena } from './arena';

/** Draws one frame; returns false when it chose not to draw (so no new snapshot is taken). */
export type SurfaceDrawFn = (canvas: SkCanvas, width: number, height: number, nowMs: number) => boolean | void;

/**
 * Like useSkiaLoop, but backed by a persistent offscreen SkSurface instead of a fresh
 * PictureRecorder every frame -- needed for effects that deliberately DON'T clear each frame
 * (the matrix-rain trail fade relies on drawing a translucent rect over the previous frame's
 * pixels rather than starting blank, exactly like the original canvas-2d `ctx`).
 *
 * Memory: a full-screen snapshot is several megabytes, so one is taken only when the frame
 * actually drew, and the previous one is freed once replaced; the surface itself is freed on
 * unmount. The surface is drawn at [scale] of the view's size (the rain is a faint texture, so
 * half resolution looks the same and costs a quarter of the memory). Rests while hidden.
 */
export function useSkiaSurfaceLoop(draw: SurfaceDrawFn, width: number, height: number, active = true, scale = 1) {
  const [image, setImage] = useState<SkImage | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const current = useRef<SkImage | null>(null);

  useEffect(() => {
    if (!active || width <= 0 || height <= 0) return;
    const w = Math.max(1, Math.ceil(width * scale));
    const h = Math.max(1, Math.ceil(height * scale));
    const surface = Skia.Surface.Make(w, h);
    if (!surface) return;
    const canvas = surface.getCanvas();
    if (scale !== 1) canvas.scale(scale, scale);
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (pageHidden()) return;
      const drew = withArena(() => drawRef.current(canvas, width, height, now));
      if (drew === false) return;
      surface.flush();
      const next = surface.makeImageSnapshot();
      disposeSoon(current.current as unknown as { dispose?: () => void });
      current.current = next;
      setImage(next);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      disposeSoon(current.current as unknown as { dispose?: () => void });
      current.current = null;
      disposeSoon(surface as unknown as { dispose?: () => void });
    };
  }, [width, height, active, scale]);

  return image;
}
