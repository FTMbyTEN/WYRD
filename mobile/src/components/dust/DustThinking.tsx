import React, { useEffect, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme';

/**
 * WYRD thinking, in dust: a small cloud of fine grains carried on a slow current, gathering into
 * three knots that brighten one after another -- typing dots made of the same dust as the gate.
 * A small 2D canvas (a few hundred grains), paused when off-screen or when the tab is hidden.
 * Reusable wherever WYRD is busy: pass a width/height and a colour.
 */
export function DustThinking({ width = 64, height = 22, color = colors.signal, style }: {
  width?: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const host = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    cv.style.width = `${width}px`;
    cv.style.height = `${height}px`;
    cv.style.display = 'block';
    el.appendChild(cv);
    const x = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // grains: each belongs to one of three knots, and has its own orbit around it
    const N = Math.round(Math.min(420, width * height * 0.18));
    const g = Array.from({ length: N }, (_, i) => ({
      k: i % 3,
      a: Math.random() * Math.PI * 2,
      r: Math.abs((Math.random() + Math.random() - 1)) * 0.5 + 0.05, // most near the knot's heart
      s: 0.6 + Math.random() * 1.4,
      x: Math.random() * W, y: Math.random() * H, // they gather in from wherever they start
      seed: Math.random() * 100,
    }));
    const knots = [0.2, 0.5, 0.8];

    let raf = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(cv);
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.visibilityState === 'hidden') return;
      const t = (now - t0) / 1000;
      x.clearRect(0, 0, W, H);
      x.fillStyle = color;
      const knotR = Math.min(W / 7, H * 0.42);
      for (const p of g) {
        // each knot breathes in turn: tighter and brighter when it's "its" beat
        const beat = 0.5 + 0.5 * Math.sin(t * 4.2 - p.k * 1.9);
        const cx = knots[p.k] * W, cy = H / 2;
        // a slow swirling current around the knot, plus a little wander of its own
        const a = p.a + t * p.s * (reduce ? 0 : 1.1);
        const rr = knotR * p.r * (1.15 - beat * 0.45);
        const wx = Math.sin(t * 1.3 + p.seed) * knotR * 0.12, wy = Math.cos(t * 1.7 + p.seed) * knotR * 0.12;
        const tx = cx + Math.cos(a) * rr * 1.3 + wx, ty = cy + Math.sin(a) * rr + wy;
        // drift towards its place rather than jump there (that's what makes it read as dust)
        p.x += (tx - p.x) * (reduce ? 1 : 0.12);
        p.y += (ty - p.y) * (reduce ? 1 : 0.12);
        x.globalAlpha = 0.25 + beat * 0.65 * (1 - p.r);
        const size = dpr * (0.8 + (1 - p.r) * 0.9);
        x.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
      x.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); cv.remove(); };
  }, [width, height, color]);

  if (Platform.OS !== 'web') return <View style={[{ width, height }, style]} />;
  return <View ref={host} style={[{ width, height }, style]} accessibilityLabel="WYRD is thinking" />;
}
