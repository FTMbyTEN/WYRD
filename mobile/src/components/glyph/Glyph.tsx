import React, { useEffect, useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme';
import { GLYPHS, type GlyphName } from './glyphs';

/**
 * A WYRD glyph: the symbol assembles from dust, breathes, and glitches when touched. With `hud`
 * (default at 30 px and up) it sits in a targeting frame -- corner brackets and ticks -- with a
 * segmented ring that turns while `active`. At 64 px and up it carries a readout (code + number).
 *
 * Every glyph on screen shares one animation loop; glyphs scrolled out of view, and all of them
 * while the tab is hidden, are skipped, so a screen full of them costs about what one does. It all
 * draws on the device: the server never knows. On native it draws the same strokes, still.
 */
export function Glyph({ name, size = 20, color = colors.mint, active = false, hud, readout, style }: {
  name: GlyphName;
  size?: number;
  color?: string;
  active?: boolean;
  hud?: boolean;
  readout?: number | string;
  style?: StyleProp<ViewStyle>;
}) {
  const host = useRef<View>(null);
  const inst = useRef<Inst | null>(null);
  const withHud = hud ?? size >= 30;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    const cv = document.createElement('canvas');
    cv.style.width = `${size}px`; cv.style.height = `${size}px`; cv.style.display = 'block';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(size * dpr);
    el.appendChild(cv);
    const i = new Inst(cv, name, size, withHud);
    inst.current = i;
    engine.add(i);
    return () => { engine.remove(i); cv.remove(); inst.current = null; };
  }, [name, size, withHud]);

  // props that change every render are read live, without rebuilding the particles
  useEffect(() => {
    const i = inst.current;
    if (!i) return;
    // becoming live: a quick glitch, then the ring turns; any other change just redraws
    i.hit(i.active !== active && active ? 0.8 : 0);
    i.active = active; i.color = color; i.readout = readout;
  }, [active, color, readout]);

  if (Platform.OS !== 'web') return <StaticGlyph name={name} size={size} color={color} style={style} />;
  return (
    <View
      ref={host}
      style={[{ width: size, height: size }, style]}
      pointerEvents="box-none"
      // touching the glyph (or the button around it) glitches it
      {...({ onPointerDown: () => inst.current?.hit(1), onPointerEnter: () => inst.current?.hit(0.45) } as object)}
    />
  );
}

/** Native: the same strokes, drawn once. */
function StaticGlyph({ name, size, color, style }: { name: GlyphName; size: number; color: string; style?: StyleProp<ViewStyle> }) {
  const g = GLYPHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style as object}>
      {g.d.map((d, i) => <Path key={i} d={d} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      {('o' in g ? g.o : []).map(([cx, cy, r], i) => <Circle key={`o${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={1.6} fill="none" />)}
    </Svg>
  );
}

// ---- the engine (web) --------------------------------------------------------------------------

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// the symbol's strokes sampled into points, once per glyph and size
const sampled = new Map<string, [number, number][]>();
function points(name: GlyphName, count: number): [number, number][] {
  const key = `${name}:${count}`;
  const hit = sampled.get(key);
  if (hit) return hit;
  const S = 72, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  x.scale(S / 24, S / 24);
  x.lineWidth = 1.8; x.lineCap = 'round'; x.lineJoin = 'round';
  const g = GLYPHS[name];
  for (const d of g.d) x.stroke(new Path2D(d));
  for (const [cx, cy, r] of ('o' in g ? g.o : []) as [number, number, number][]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
  const px = x.getImageData(0, 0, S, S).data, all: [number, number][] = [];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (px[(j * S + i) * 4 + 3] > 110) all.push([i / S, j / S]);
  // evenly spread over the strokes, so a small glyph still reads
  const out: [number, number][] = [];
  for (let k = 0; k < count; k++) out.push(all[Math.floor((k / count) * all.length)] ?? [0.5, 0.5]);
  sampled.set(key, out);
  return out;
}

type P = { x: number; y: number; vx: number; vy: number; s: number };

class Inst {
  active = false;
  color: string = colors.mint;
  readout?: number | string;
  private x: CanvasRenderingContext2D;
  private t: [number, number][];
  private p: P[];
  private glitch = 0;
  private rot = Math.random() * 6;
  private born = performance.now();
  private settled = 0; // frames since everything came to rest: a still glyph isn't redrawn
  visible = true;

  constructor(public cv: HTMLCanvasElement, public name: GlyphName, private size: number, private hud: boolean) {
    this.x = cv.getContext('2d')!;
    const n = size <= 22 ? 90 : size <= 40 ? 150 : size <= 80 ? 260 : 520;
    this.t = points(name, n);
    const still = reduceMotion();
    this.p = this.t.map(([tx, ty]) => (still ? { x: tx, y: ty, vx: 0, vy: 0, s: Math.random() } : { x: Math.random(), y: Math.random(), vx: 0, vy: 0, s: Math.random() }));
  }

  hit(k: number) {
    this.glitch = Math.max(this.glitch, k);
    this.settled = 0;
    for (const q of this.p) { q.vx += (Math.random() - 0.5) * 0.06 * k; q.vy += (Math.random() - 0.5) * 0.06 * k; }
  }

  frame(now: number, dt: number) {
    const still = reduceMotion();
    // nothing moving and not live: the last frame is still right
    if (!this.active && this.glitch === 0 && this.settled > 90) return;
    const { x, cv } = this, W = cv.width;
    x.clearRect(0, 0, W, W);
    const lw = Math.max(1, W / 90);

    // the core occupies the middle; with a frame around it, a little less of it
    const span = this.hud ? (this.size < 48 ? 0.6 : 0.5) : 0.86, off = (1 - span) / 2;

    if (this.hud) {
      const b = W * 0.06, L = W * 0.14, e = W - b, m = W / 2;
      x.strokeStyle = this.color; x.lineWidth = lw;
      x.globalAlpha = this.active ? 0.9 : 0.4;
      x.beginPath();
      for (const [cx, cy, dx, dy] of [[b, b, 1, 1], [e, b, -1, 1], [b, e, 1, -1], [e, e, -1, -1]]) { x.moveTo(cx, cy + dy * L); x.lineTo(cx, cy); x.lineTo(cx + dx * L, cy); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; x.moveTo(m + Math.cos(a) * W * 0.38, m + Math.sin(a) * W * 0.38); x.lineTo(m + Math.cos(a) * W * 0.43, m + Math.sin(a) * W * 0.43); }
      x.stroke();
      // the ring: segmented, turning while live
      if (this.active && !still) this.rot += dt * 0.7;
      x.globalAlpha = this.active ? 0.85 : 0.18; x.lineWidth = lw * 1.3;
      const R = W * 0.345, seg = this.size >= 64 ? 30 : 18;
      for (let i = 0; i < seg; i++) {
        if (i % 6 === 5) continue;
        const a0 = this.rot + (i * 2 * Math.PI) / seg;
        x.beginPath(); x.arc(m, m, R, a0, a0 + ((2 * Math.PI) / seg) * 0.55); x.stroke();
      }
    }

    // the core: particles settle into the strokes, breathe, and shear when glitched
    this.glitch = Math.max(0, this.glitch - dt * 3.4);
    const age = Math.min(1, (now - this.born) / 1000);
    const pull = still ? 1 : 0.08 + age * 0.14;
    const rad = Math.max(1, (W / this.size) * (this.size <= 22 ? 1.25 : 1.1));
    x.fillStyle = this.color;
    let motion = 0;
    for (let i = 0; i < this.p.length; i++) {
      const q = this.p[i], [tx0, ty0] = this.t[i];
      const tx = off + tx0 * span, ty = off + ty0 * span;
      q.vx += (tx - q.x) * pull; q.vy += (ty - q.y) * pull; q.vx *= 0.7; q.vy *= 0.7;
      q.x += q.vx; q.y += q.vy;
      motion += Math.abs(q.vx) + Math.abs(q.vy);
      const breathe = still || !this.active ? 0 : Math.sin(now / 700 + q.s * 6.28) * 0.004;
      let px = q.x + breathe, py = q.y - breathe;
      if (this.glitch > 0.04) { const band = Math.floor(py * 8); px += ((((band * 73) % 7) - 3) * 0.014) * this.glitch; }
      x.globalAlpha = 0.6 + q.s * 0.4;
      x.fillRect(px * W - rad / 2, py * W - rad / 2, rad, rad);
    }
    this.settled = motion < 0.002 * this.p.length ? this.settled + 1 : 0;

    if (this.hud && this.size >= 64) {
      const b = W * 0.06;
      x.globalAlpha = this.active ? 1 : 0.6; x.fillStyle = this.color;
      x.font = `${Math.round(W * 0.075)}px "ShareTechMono_400Regular", "Share Tech Mono", monospace`;
      x.textAlign = 'left'; x.fillText(GLYPHS[this.name].code, b, W - b * 0.2);
      if (this.readout != null) { x.textAlign = 'right'; x.fillText(String(this.readout), W - b, W - b * 0.2); }
    }
    x.globalAlpha = 1;
  }
}

const engine = (() => {
  const live = new Set<Inst>();
  let raf = 0, last = 0;
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((es) => es.forEach((e) => { for (const i of live) if (i.cv === e.target) i.visible = e.isIntersecting; }))
    : null;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (document.visibilityState === 'hidden') return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    for (const i of live) if (i.visible) i.frame(now, dt);
  };
  return {
    add(i: Inst) { live.add(i); io?.observe(i.cv); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } },
    remove(i: Inst) { live.delete(i); io?.unobserve(i.cv); if (!live.size && raf) { cancelAnimationFrame(raf); raf = 0; } },
  };
})();
