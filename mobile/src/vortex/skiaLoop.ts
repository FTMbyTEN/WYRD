import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { disposeSoon, pageHidden, withArena } from './arena';
import { ANIMATION_FPS } from '../util/perf';
import { draw2d } from './canvas2d';

export type DrawFn = (canvas: SkCanvas, width: number, height: number, nowMs: number) => void;

/**
 * Imperative per-frame drawing for Skia, mirroring the original design's canvas-2d `ctx` calls
 * almost 1:1 (drawCircle/drawLine/drawRect/drawPoints/save/restore/translate/scale). Each tick
 * records a fresh SkPicture and swaps it in (native). On web the same drawing goes to a plain 2D
 * canvas instead (canvas2d.ts): presenting a Skia canvas there costs ~5 ms a frame whatever is drawn
 * -- a third of the main thread at 60 fps -- against under 1 ms for the 2D canvas. No React render
 * per frame on either.
 *
 * Memory: every frame's paints and paths are freed right after drawing (withArena), and each
 * picture is freed once the next has replaced it -- CanvasKit never frees them by itself.
 * Speed: capped at [fps] (30 by default -- smooth for these slow drifting visuals, half the work
 * of 60), and resting entirely while the page is hidden.
 */
/** What SkiaLoopView needs: the canvas element to draw on (web), or the latest picture (native). */
export interface SkiaLoop {
  canvasRef: { current: HTMLCanvasElement | null };
  picture: SkPicture | null;
}

const direct = Platform.OS === 'web';

export function useSkiaLoop(draw: DrawFn, width: number, height: number, active = true, fps = ANIMATION_FPS): SkiaLoop {
  const [picture, setPicture] = useState<SkPicture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const current = useRef<SkPicture | null>(null);

  useEffect(() => {
    if (!active || width <= 0 || height <= 0) return;
    let raf = 0;
    let last = 0;
    const minGap = 1000 / fps;
    const bounds = Skia.XYWHRect(0, 0, width, height);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // a frame is due when the gap has (almost) passed: a millisecond of vsync jitter must not
      // skip a frame, and keeping to the grid (not `last = now`) keeps the steps even
      if (pageHidden() || now - last < minGap - 2) return;
      last = now - last > minGap * 3 ? now : last + minGap * Math.max(1, Math.floor((now - last + 2) / minGap));
      if (direct) {
        const el = canvasRef.current;
        const ctx = el?.getContext('2d');
        if (!el || !ctx) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
        if (el.width !== pw || el.height !== ph) { el.width = pw; el.height = ph; }
        // any Skia objects the drawing still makes (paths) are freed by the arena after the frame
        withArena(() => draw2d(ctx, width, height, dpr, (c) => drawRef.current(c, width, height, now)));
        return;
      }
      const recorder = Skia.PictureRecorder();
      const canvas = recorder.beginRecording(bounds);
      withArena(() => drawRef.current(canvas, width, height, now));
      const next = recorder.finishRecordingAsPicture();
      (recorder as unknown as { dispose?: () => void }).dispose?.();
      disposeSoon(current.current as unknown as { dispose?: () => void });
      current.current = next;
      setPicture(next);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      disposeSoon(current.current as unknown as { dispose?: () => void });
      current.current = null;
    };
  }, [width, height, active, fps]);

  return { canvasRef, picture };
}
