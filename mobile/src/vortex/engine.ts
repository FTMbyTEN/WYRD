// Direct port of the `makeVortex()` engine from `WYRD Mobile.dc.html` — same count-preserving
// per-vertex lerp between shapes, same timing/easing constants, now driving a Skia canvas
// instead of a 2D `ctx`.
import { Skia, PointMode, type SkCanvas } from '@shopify/react-native-skia';
import { VN, buildShapes, type VortexShape } from './shapes';
import { morph } from '../theme';

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutElastic(t: number) {
  const c = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
}

const { MORPH_MS, HOLD_MS, BURST_MS } = morph;

export interface VortexEngine {
  frame: (canvas: SkCanvas, width: number, height: number, nowMs: number) => void;
  burst: () => void;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
  setIntensity: (v: number) => void;
  togglePause: () => boolean;
  /** Name of the shape it starts on — announce this yourself via an effect, not during render;
   *  the engine no longer calls `onShape` synchronously at construction time (see VortexCanvas). */
  initialShapeName: string;
}

export function makeVortexEngine(onShape?: (name: string) => void): VortexEngine {
  const shapes: VortexShape[] = buildShapes();
  let idx = 0;
  const pos = new Float32Array(shapes[0].pts);
  let from = new Float32Array(shapes[0].pts);
  let to: Float32Array = shapes[0].pts;
  let morphStart = -Infinity;
  let nextAt = performance.now() + HOLD_MS;
  let burstStart = -Infinity;
  let intensity = 0;
  let intensityTarget = 0;
  let paused = false;
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() }));

  function jump(next: number) {
    from = pos.slice();
    idx = next;
    to = shapes[idx].pts;
    morphStart = performance.now();
    nextAt = morphStart + HOLD_MS + MORPH_MS;
    onShape?.(shapes[idx].name);
  }
  function rand() {
    let n: number;
    do { n = Math.floor(Math.random() * shapes.length); } while (n === idx);
    return n;
  }

  const starPaint = Skia.Paint();
  starPaint.setColor(Skia.Color('rgba(0,255,65,0.18)'));

  // Quantize per-point alpha into buckets so we can batch-draw with drawPoints instead of one
  // draw call per particle (720x/frame) — keeps the depth-fade look at a fraction of the cost.
  const BUCKETS = 10;
  const bucketPaints = Array.from({ length: BUCKETS }, () => {
    const p = Skia.Paint();
    p.setStrokeCap(1); // round
    return p;
  });
  const bucketPoints: { x: number; y: number }[][] = Array.from({ length: BUCKETS }, () => []);

  return {
    initialShapeName: shapes[0].name,
    burst() { burstStart = performance.now(); jump(rand()); },
    next() { jump((idx + 1) % shapes.length); },
    prev() { jump((idx - 1 + shapes.length) % shapes.length); },
    goTo(i: number) { if (i !== idx) jump(i); },
    setIntensity(v: number) { intensityTarget = v; },
    togglePause() { paused = !paused; return paused; },

    frame(canvas: SkCanvas, width: number, height: number, now: number) {
      if (!paused && now >= nextAt) { burstStart = -Infinity; jump(rand()); }
      if (now - morphStart < MORPH_MS) {
        const t = easeInOutCubic(Math.min(1, (now - morphStart) / MORPH_MS));
        for (let i = 0; i < pos.length; i++) pos[i] = from[i] + (to[i] - from[i]) * t;
      }
      intensity += (intensityTarget - intensity) * 0.08;

      canvas.clear(Skia.Color('#000000'));
      const starPts = stars.map((s) => ({ x: s.x * width, y: s.y * height }));
      starPaint.setStrokeWidth(1.4);
      canvas.drawPoints(PointMode.Points, starPts, starPaint);

      const yaw = now * (0.00035 + intensity * 0.0009);
      const pitch = Math.sin(now * 0.00015) * 0.15;
      let scale = 1;
      const bt = (now - burstStart) / BURST_MS;
      if (bt >= 0 && bt < 1) scale = 1 + easeOutElastic(bt) * 0.22 * (1 - bt);
      const F = Math.min(width, height) * 0.62 * scale;
      const cx = width / 2, cy = height / 2;
      const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const breathe = Math.sin(now * 0.0016) * 0.06;
      const size = 1.0 + intensity * 0.5;

      for (let b = 0; b < BUCKETS; b++) bucketPoints[b].length = 0;

      for (let i = 0; i < VN; i++) {
        const x0 = pos[i * 3], y0 = pos[i * 3 + 1], z0 = pos[i * 3 + 2];
        const x1 = x0 * cy0 - z0 * sy0, z1 = x0 * sy0 + z0 * cy0;
        const y1 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp;
        const d = 7.5 - z2;
        if (d <= 0.4) continue;
        const k = F / d;
        const sx = cx + x1 * k, sy = cy - y1 * k;
        const a = Math.max(0.05, Math.min(1, (0.55 + breathe + intensity * 0.2) * (1.9 / d)));
        const bucket = Math.min(BUCKETS - 1, Math.max(0, Math.round(a * (BUCKETS - 1))));
        bucketPoints[bucket].push({ x: sx, y: sy });
      }
      for (let b = 0; b < BUCKETS; b++) {
        const pts = bucketPoints[b];
        if (!pts.length) continue;
        const alpha = (b + 1) / BUCKETS;
        bucketPaints[b].setColor(Skia.Color(`rgba(0,255,65,${alpha.toFixed(3)})`));
        bucketPaints[b].setStrokeWidth(Math.max(1, size * dprGuess()));
        canvas.drawPoints(PointMode.Points, pts, bucketPaints[b]);
      }
    },
  };
}

function dprGuess() {
  // Skia canvas here is already sized in logical points by the RN <Canvas>, so a flat ~1.6px
  // stroke reads the same across densities without needing PixelRatio at the call site.
  return 1.6;
}
