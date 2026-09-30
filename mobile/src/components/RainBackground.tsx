import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Image, Skia } from '@shopify/react-native-skia';
import { useSkiaSurfaceLoop } from '../vortex/skiaSurfaceLoop';
import { pageHidden } from '../vortex/arena';

const CHARS = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ<>/\\|=+*#$%'.split('');
const FS = 13; // character size and column width
const STEP_MS = 62; // the original's cadence

/** Port of `initRain()` — matrix-style falling characters behind every screen, at 10% opacity
 *  in the design. The trail is a translucent white wash over the previous frame, so the canvas is
 *  never cleared. On web it's a plain 2D canvas at half resolution (the browser draws text there
 *  natively, for next to nothing); on native, a persistent Skia surface. */
export function RainBackground({ opacity = 0.1 }: { opacity?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity }} onLayout={onLayout}>
      {size.width > 0 && (Platform.OS === 'web'
        ? <WebRain width={size.width} height={size.height} />
        : <SkiaRain width={size.width} height={size.height} />)}
    </View>
  );
}

function WebRain({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const scale = 0.5; // a faint texture: half resolution looks the same
    el.width = Math.ceil(width * scale);
    el.height = Math.ceil(height * scale);
    ctx.scale(scale, scale);
    ctx.font = `${FS}px monospace`;
    ctx.textBaseline = 'alphabetic';
    const cols = Math.max(1, Math.floor(width / FS));
    const drops = Array.from({ length: cols }, () => (Math.random() * height) / FS);
    let raf = 0, last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (pageHidden() || now - last < STEP_MS) return;
      last = now;
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < cols; i++) {
        const y = drops[i] * FS;
        ctx.fillStyle = Math.random() > 0.96 ? '#111' : '#000';
        ctx.fillText(CHARS[(Math.random() * CHARS.length) | 0], i * FS, y);
        if (y > height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 1;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);
  return React.createElement('canvas', { ref, style: { width, height, display: 'block' } });
}

function SkiaRain({ width, height }: { width: number; height: number }) {
  const stateRef = useRef<{ drops: number[]; cols: number } | null>(null);
  const lastRef = useRef(0);
  const font = useMemo(() => Skia.Font(undefined, FS), []);

  const image = useSkiaSurfaceLoop(
    (canvas, w, h, now) => {
      const cols = Math.max(1, Math.floor(w / FS));
      if (!stateRef.current || stateRef.current.cols !== cols) {
        stateRef.current = { cols, drops: Array.from({ length: cols }, () => (Math.random() * h) / FS) };
      }
      if (now - lastRef.current < STEP_MS) return false; // nothing new: no snapshot this frame
      lastRef.current = now;

      const st = stateRef.current;
      canvas.drawColor(Skia.Color('rgba(255,255,255,0.09)'));
      const paint = Skia.Paint();
      for (let i = 0; i < st.cols; i++) {
        const ch = CHARS[(Math.random() * CHARS.length) | 0];
        const y = st.drops[i] * FS;
        paint.setColor(Skia.Color(Math.random() > 0.96 ? '#111111' : '#000000'));
        canvas.drawText(ch, i * FS, y, paint, font);
        if (y > h && Math.random() > 0.975) st.drops[i] = 0;
        st.drops[i] += 1;
      }
    },
    width,
    height,
    true,
    0.5, // a faint texture: half resolution looks the same at a quarter of the memory
  );

  return (
    <Canvas style={{ width, height }}>
      {image && <Image image={image} x={0} y={0} width={width} height={height} />}
    </Canvas>
  );
}
