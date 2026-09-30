import { Skia, type SkCanvas } from '@shopify/react-native-skia';

/**
 * The few Skia canvas calls WYRD's animations make (clear, points, circles, lines, rects, paths,
 * transforms), drawn with the browser's own 2D canvas instead. On web, Skia (CanvasKit, running
 * in WebAssembly) costs ~5 ms per frame to present a full-screen canvas no matter what is drawn
 * -- a third of the main thread at 60 fps; the same vortex frame on a 2D canvas is ~0.8 ms.
 * The drawing code doesn't change: it gets this in place of an SkCanvas.
 */

type Rgba = ArrayLike<number>; // Skia colors are [r, g, b, a] in 0..1

/** A paint that is just JavaScript: records what's set, for the 2D canvas to use. */
class LitePaint {
  readonly lite = true;
  color: Rgba = [0, 0, 0, 1];
  style = 0; // 0 fill, 1 stroke
  width = 0;
  cap = 0; // 0 butt, 1 round, 2 square
  alpha = 1;
  setColor(c: Rgba) { this.color = c; }
  setStyle(s: number) { this.style = s; }
  setStrokeWidth(w: number) { this.width = w; }
  setStrokeCap(c: number) { this.cap = c; }
  // as in Skia, alpha is the color's alpha: setting one sets the other
  setAlphaf(a: number) { this.color = [this.color[0], this.color[1], this.color[2], a]; }
  getColor() { return this.color; }
  getStrokeWidth() { return this.width; }
  getStrokeCap() { return this.cap; }
  getAlphaf() { return this.color[3]; }
  setAntiAlias() {}
  setBlendMode() {}
  setMaskFilter() {}
  setShader() {}
  setColorFilter() {}
  setImageFilter() {}
  setPathEffect() {}
  setStrokeJoin() {}
  dispose() {}
  copy() { const p = new LitePaint(); Object.assign(p, this); return p; }
}

interface PaintLike {
  lite?: boolean;
  color?: Rgba; style?: number; width?: number; cap?: number; alpha?: number;
  getColor?: () => Rgba; getStrokeWidth?: () => number; getStrokeCap?: () => number; getAlphaf?: () => number;
}

function read(p: PaintLike) {
  if (p.lite) return { color: p.color!, style: p.style!, width: p.width!, cap: p.cap!, alpha: p.alpha! };
  // a real Skia paint made outside the frame (the vortex's): read what it can report
  // (CanvasKit reports enums as objects like { value: 1 })
  const cap = p.getStrokeCap?.() as unknown;
  return {
    color: p.getColor?.() ?? [0, 0, 0, 1],
    style: 0,
    width: p.getStrokeWidth?.() ?? 0,
    cap: typeof cap === 'object' && cap !== null ? Number((cap as { value?: number }).value ?? 0) : Number(cap ?? 0),
    alpha: 1, // a Skia paint's alpha is its color's alpha, already in `color`
  };
}

const css = (c: Rgba, alpha = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${(c[3] * alpha).toFixed(3)})`;

export class Canvas2DAdapter {
  constructor(private ctx: CanvasRenderingContext2D, private w: number, private h: number) {}

  clear(c: Rgba) {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (c[3] > 0) { ctx.fillStyle = css(c); ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
    ctx.restore();
  }

  drawPoints(mode: number, pts: { x: number; y: number }[], paint: PaintLike) {
    const p = read(paint);
    const { ctx } = this;
    if (mode === 0) { // points: a dot per point, the stroke width wide
      const s = Math.max(1, p.width);
      ctx.fillStyle = css(p.color, p.alpha);
      if (p.cap === 1 && s > 1.5) {
        const r = s / 2;
        ctx.beginPath();
        for (const q of pts) { ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); }
        ctx.fill();
      } else {
        for (const q of pts) ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
      return;
    }
    // lines (pairs) or polygon (a joined run)
    this.stroke(p);
    ctx.beginPath();
    if (mode === 1) for (let i = 0; i + 1 < pts.length; i += 2) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); }
    else pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  }

  /** Many filled circles in one path and one fill: [x, y, r, x, y, r, ...] (not a Skia call; BrainCanvas uses it when present). */
  fillCircles(xyr: number[], paint: PaintLike) {
    const p = read(paint);
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < xyr.length; i += 3) { const r = Math.max(0, xyr[i + 2]); ctx.moveTo(xyr[i] + r, xyr[i + 1]); ctx.arc(xyr[i], xyr[i + 1], r, 0, Math.PI * 2); }
    ctx.fillStyle = css(p.color, p.alpha);
    ctx.fill();
  }

  drawCircle(x: number, y: number, r: number, paint: PaintLike) {
    const p = read(paint);
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    if (p.style === 1) { this.stroke(p); ctx.stroke(); } else { ctx.fillStyle = css(p.color, p.alpha); ctx.fill(); }
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, paint: PaintLike) {
    const { ctx } = this;
    this.stroke(read(paint));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  drawRect(r: { x: number; y: number; width: number; height: number }, paint: PaintLike) {
    const p = read(paint);
    if (p.style === 1) { this.stroke(p); this.ctx.strokeRect(r.x, r.y, r.width, r.height); }
    else { this.ctx.fillStyle = css(p.color, p.alpha); this.ctx.fillRect(r.x, r.y, r.width, r.height); }
  }

  drawPath(path: { toSVGString?: () => string }, paint: PaintLike) {
    const d = path.toSVGString?.();
    if (!d) return;
    const p = read(paint);
    const p2d = new Path2D(d);
    if (p.style === 1) { this.stroke(p); this.ctx.stroke(p2d); } else { this.ctx.fillStyle = css(p.color, p.alpha); this.ctx.fill(p2d); }
  }

  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
  translate(x: number, y: number) { this.ctx.translate(x, y); }
  scale(x: number, y: number) { this.ctx.scale(x, y); }
  rotate(deg: number, rx = 0, ry = 0) { this.ctx.translate(rx, ry); this.ctx.rotate((deg * Math.PI) / 180); this.ctx.translate(-rx, -ry); }

  private stroke(p: ReturnType<typeof read>) {
    const { ctx } = this;
    ctx.strokeStyle = css(p.color, p.alpha);
    ctx.lineWidth = Math.max(0.5, p.width);
    ctx.lineCap = p.cap === 1 ? 'round' : p.cap === 2 ? 'square' : 'butt';
  }
}

let warned = false;
/**
 * Runs one frame's drawing against a 2D canvas: Skia.Paint() hands out LitePaints meanwhile, so
 * nothing in the frame touches WebAssembly. Calls the adapter doesn't know are skipped (once
 * reported in the console).
 */
export function draw2d(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, draw: (c: SkCanvas) => void) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const adapter = new Canvas2DAdapter(ctx, w, h);
  const canvas = new Proxy(adapter, {
    get(target, key) {
      const v = (target as unknown as Record<string | symbol, unknown>)[key];
      if (v !== undefined) return typeof v === 'function' ? v.bind(target) : v;
      if (!warned) { warned = true; console.warn(`[canvas2d] ${String(key)} isn't supported; skipped`); }
      return () => {};
    },
  }) as unknown as SkCanvas;
  const S = Skia as unknown as { Paint: () => unknown };
  const realPaint = S.Paint;
  S.Paint = () => new LitePaint();
  try {
    draw(canvas);
  } finally {
    S.Paint = realPaint;
  }
}
