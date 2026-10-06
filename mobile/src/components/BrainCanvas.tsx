import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { PointMode, Skia, type SkCanvas } from '@shopify/react-native-skia';
import { useSkiaLoop } from '../vortex/skiaLoop';
import { SkiaLoopView } from '../vortex/SkiaLoopView';

interface BrainPoint { x: number; y: number; z: number; s: number; ph: number; region: 'left' | 'right' | 'cerebellum' }
interface Edge { a: number; b: number; speed: number; phase: number }
interface Burst { start: number; nodeIdx: number }

const GAP = 0.16; // longitudinal fissure — the visible split down the middle of a real brain

/** Deformed twin-hemisphere point cloud with a fake sulci/gyri wrinkle pattern and a small
 *  cerebellum cluster tucked in at the back-bottom — reads as an actual brain silhouette from
 *  most rotations, not a lumpy sphere. Built once per nodeCount; the wrinkle noise is a few
 *  stacked sine terms over the point's own spherical angle, which is cheap and, because it's a
 *  function of the point's fixed position rather than time, holds still as the shape rotates. */
function buildBrain(nodeCount: number): BrainPoint[] {
  const cerebellumCount = Math.max(6, Math.round(nodeCount * 0.12));
  const hemiCount = Math.max(4, Math.round((nodeCount - cerebellumCount) / 2));
  const pts: BrainPoint[] = [];

  const wrinkle = (theta: number, phi: number) =>
    1 +
    0.07 * Math.sin(theta * 5 + phi * 2) +
    0.045 * Math.sin(phi * 7 - theta * 3) +
    0.03 * Math.sin(theta * 11 + phi * 9);

  (['left', 'right'] as const).forEach((region) => {
    const sign = region === 'left' ? 1 : -1;
    for (let i = 0; i < hemiCount; i++) {
      const y0 = 1 - (i / (hemiCount - 1)) * 2; // -1..1, fibonacci sphere lattice
      const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      let x = Math.cos(theta) * rad;
      let z = Math.sin(theta) * rad;
      const phi = Math.atan2(z, x);
      const w = wrinkle(theta, phi);

      // Real cerebrum proportions: longer front-to-back (z) than tall, flattened underside
      // (where a real brain sits on the brain stem / skull base) rather than a round bottom.
      let y = y0;
      if (y < -0.15) y = -0.15 + (y + 0.15) * 0.45; // compress the lower quarter
      x *= 0.72 * w;
      z *= 1.05 * w;
      y *= 0.62 * w;

      x = sign * (Math.abs(x) + GAP); // push apart across the fissure, mirror the two lobes

      pts.push({ x, y, z, s: 0.6 + Math.random() * 0.8, ph: Math.random() * 6.28, region });
    }
  });

  // Cerebellum: a distinctly smaller, denser cluster behind and below the main mass — the one
  // feature that actually reads as "brain" rather than "blob" from a side-on view.
  for (let i = 0; i < cerebellumCount; i++) {
    const y0 = 1 - (i / Math.max(1, cerebellumCount - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const theta = i * Math.PI * (3 - Math.sqrt(5)) * 1.3;
    const x = Math.cos(theta) * rad * 0.34;
    const z = Math.sin(theta) * rad * 0.24 - 0.62;
    const y = y0 * 0.22 - 0.42;
    pts.push({ x, y, z, s: 0.45 + Math.random() * 0.5, ph: Math.random() * 6.28, region: 'cerebellum' });
  }

  return pts;
}

// Shades of ink, quantized: each made once and reused every frame.
const SHADES = 32;
// Warm Lagos: the brain is Adire indigo; the packets travelling the mesh (WYRD thinking) are terracotta,
// and a burst of learning flares ochre
const signals: ReturnType<typeof Skia.Color>[] = [];
function signalInk(bucket: number) {
  return (signals[bucket] ??= Skia.Color(`rgba(196,87,46,${((bucket + 0.5) / SHADES).toFixed(3)})`));
}
const inks: ReturnType<typeof Skia.Color>[] = [];
function ink(bucket: number) {
  return (inks[bucket] ??= Skia.Color(`rgba(36,49,107,${((bucket + 0.5) / SHADES).toFixed(3)})`));
}
const shade = (alpha: number) => Math.max(0, Math.min(SHADES - 1, Math.floor(alpha * SHADES)));
function shadeBuckets<T>(): T[][] {
  return Array.from({ length: SHADES }, () => [] as T[]);
}
/** Filled circles given as [x, y, r, x, y, r, ...]: one call where the canvas can batch them. */
function fillCircles(canvas: SkCanvas, xyr: number[], paint: ReturnType<typeof Skia.Paint>) {
  const batch = (canvas as unknown as { fillCircles?: (xyr: number[], p: unknown) => void }).fillCircles;
  if (batch) { batch(xyr, paint); return; }
  for (let i = 0; i < xyr.length; i += 3) canvas.drawCircle(xyr[i], xyr[i + 1], xyr[i + 2], paint);
}

/** Nearest-2-neighbour mesh instead of arbitrary index pairing — edges follow the actual shape
 *  of the point cloud (short local connections) rather than drawing long chords across the whole
 *  brain, which is what makes it read as a neural mesh instead of a wireframe ball. O(n^2), fine
 *  at the node counts this ever runs at (capped at 400 by BrainOverlay). */
function buildEdges(points: BrainPoint[]): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const k = 2;
  for (let i = 0; i < points.length; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
      dists.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let n = 0; n < k && n < dists.length; n++) {
      const j = dists[n].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: i, b: j, speed: 0.35 + Math.random() * 0.5, phase: Math.random() });
    }
  }
  return edges;
}

// built once per node count and kept: the mesh is O(n^2), and BRAIN_3D opening shouldn't redo it
const built = new Map<number, { points: BrainPoint[]; edges: Edge[] }>();
export function brainFor(nodeCount: number) {
  let b = built.get(nodeCount);
  if (!b) {
    const points = buildBrain(nodeCount);
    b = { points, edges: buildEdges(points) };
    built.set(nodeCount, b);
  }
  return b;
}

// ---- WYRD's real brain -------------------------------------------------------------------------

export interface BrainMapData {
  neurons: { id: string; weight: number; degree: number }[];
  synapses: { a: string; b: string; weight: number }[];
  firings: { path: string[]; at: string }[];
}
interface RealEdge extends Edge { w: number }
interface RealBrain { points: BrainPoint[]; edges: RealEdge[]; ids: string[]; index: Map<string, number> }

/** WYRD's real network laid into the brain's shape: every neuron is one of its concepts, every line
 *  one of its synapses. Related concepts sit together: starting from the most central concept,
 *  each one takes the free spot nearest the neurons it's already wired to, so clusters of ideas
 *  become regions of the brain. Bigger neurons are more central concepts. */
function realBrain(map: BrainMapData): RealBrain {
  const n = map.neurons.length;
  const slots = buildBrain(n);
  const ids = map.neurons.map((x) => x.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const adj = new Map<number, { j: number; w: number }[]>();
  for (const s of map.synapses) {
    const a = index.get(s.a), b = index.get(s.b);
    if (a == null || b == null) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ j: b, w: s.weight });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ j: a, w: s.weight });
  }
  const placed = new Array<number>(n).fill(-1); // neuron -> slot
  const taken = new Array<boolean>(slots.length).fill(false);
  const nearestFree = (x: number, y: number, z: number) => {
    let best = -1, bd = Infinity;
    for (let k = 0; k < slots.length; k++) {
      if (taken[k]) continue;
      const d = (slots[k].x - x) ** 2 + (slots[k].y - y) ** 2 + (slots[k].z - z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  // breadth-first from the most central concept (neurons arrive sorted by weight)
  const order: number[] = [];
  const seen = new Set<number>();
  for (let root = 0; root < n; root++) {
    if (seen.has(root)) continue;
    const queue = [root];
    seen.add(root);
    while (queue.length) {
      const i = queue.shift()!;
      order.push(i);
      for (const { j } of (adj.get(i) ?? []).sort((x, y) => y.w - x.w)) if (!seen.has(j)) { seen.add(j); queue.push(j); }
    }
  }
  const maxW = Math.max(1e-6, ...map.neurons.map((x) => x.weight));
  for (const i of order) {
    const near = (adj.get(i) ?? []).filter(({ j }) => placed[j] >= 0);
    let k: number;
    if (!near.length) k = nearestFree((Math.random() - 0.5) * 0.6, 0.1 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4);
    else {
      let x = 0, y = 0, z = 0;
      for (const { j } of near) { x += slots[placed[j]].x; y += slots[placed[j]].y; z += slots[placed[j]].z; }
      k = nearestFree(x / near.length, y / near.length, z / near.length);
    }
    if (k < 0) { slots.push({ ...slots[i % slots.length], x: slots[i % slots.length].x * 0.9 }); k = slots.length - 1; } // never short of a place
    placed[i] = k;
    taken[k] = true;
  }
  const points = ids.map((_, i) => ({ ...slots[placed[i]], s: 0.5 + 1.6 * Math.sqrt(map.neurons[i].weight / maxW) }));
  const edges: RealEdge[] = [];
  for (const s of map.synapses) {
    const a = index.get(s.a), b = index.get(s.b);
    if (a != null && b != null) edges.push({ a, b, w: s.weight, speed: 1, phase: 0 });
  }
  return { points, edges, ids, index };
}

const HOP_MS = 520; // one synapse crossed
const IDLE_REPLAY_MS = 2600; // between thoughts, it replays one of its recent real ones

/**
 * The node-brain visualization behind the WYRD home tab and the BRAIN_3D overlay. Shaped like an
 * actual (stylized) brain — two hemispheres split by a fissure, a cerebellum lobe, a wrinkled
 * surface — with signal packets ("electrons") travelling the connections continuously, and real
 * ingestion/reasoning events (`activitySignal`, bump it on each one) triggering a bright expanding
 * pulse at a random node so "WYRD digesting something" is an actual visible event, not a metaphor.
 * `energy` (1 = resting) speeds up and thickens the signal traffic, e.g. while the brain is
 * opened up on the WYRD tab.
 */
export function BrainCanvas({ nodeCount = 150, activitySignal, energy = 1, map, onThought, radius = 0.42 }: {
  /** how big the brain is drawn, as a share of the view (home: 0.56, as in the first version) */
  radius?: number;
  nodeCount?: number;
  activitySignal?: number;
  energy?: number;
  /** WYRD's real network: when given, the brain is drawn from it and fires along real paths. */
  map?: BrainMapData | null;
  /** Called with the concepts a thought crosses, as it starts crossing them. */
  onThought?: (path: string[], live: boolean) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const burstsRef = useRef<Burst[]>([]);
  // Signal travel is integrated per frame (not now * speed) so changing energy never makes the
  // packets jump mid-edge.
  const energyRef = useRef(energy);
  energyRef.current = energy;
  const signalClock = useRef({ t: 0, last: 0 });
  const onThoughtRef = useRef(onThought);
  onThoughtRef.current = onThought;

  // the real brain, rebuilt only when the network itself changes (not on every firing)
  const shapeKey = map && map.neurons.length >= 8 ? `${map.neurons.map((x) => x.id).join('|')}#${map.synapses.length}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const real = useMemo(() => (shapeKey && map ? realBrain(map) : null), [shapeKey]);
  // the glowing cloud of the first version: a faint brain-shaped point field behind the real
  // neurons, so a young brain (few neurons yet) still reads as a full, living brain. It never fires.
  const cloud = useMemo(() => buildBrain(220), []);
  const { points, edges } = useMemo(() => real ?? brainFor(nodeCount), [real, nodeCount]);

  // thoughts to play: new real firings as they arrive; between them, replays of recent ones
  const play = useRef<{ queue: number[][]; cur: { path: number[]; start: number } | null; lastAt: string; idleSince: number; recent: number[][] }>(
    { queue: [], cur: null, lastAt: '', idleSince: 0, recent: [] },
  );
  useEffect(() => {
    if (!real || !map) return;
    const p = play.current;
    const asIdx = (path: string[]) => path.map((id) => real.index.get(id)).filter((i): i is number => i != null);
    p.recent = map.firings.map((f) => asIdx(f.path)).filter((x) => x.length >= 2);
    const fresh = map.firings.filter((f) => f.at > p.lastAt);
    // on first sight, play only the latest; after that, every new thought in order
    for (const f of p.lastAt ? fresh : fresh.slice(-1)) {
      const idx = asIdx(f.path);
      if (idx.length >= 2) p.queue.push(idx);
    }
    if (map.firings.length) p.lastAt = map.firings[map.firings.length - 1].at;
  }, [map, real]);

  useEffect(() => {
    if (activitySignal === undefined) return;
    burstsRef.current.push({ start: performance.now(), nodeIdx: Math.floor(Math.random() * points.length) });
    if (burstsRef.current.length > 12) burstsRef.current.shift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitySignal]);

  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const loop = useSkiaLoop(
    (canvas, W, H, now) => {
      const t = now * 0.00022;
      const R = Math.min(W, H) * radiusRef.current; // the home screen asks for a big brain, as in the first version
      canvas.clear(Skia.Color('rgba(255,255,255,0)'));
      const clock = signalClock.current;
      clock.t += (clock.last ? Math.min(64, now - clock.last) : 0) * energyRef.current;
      clock.last = now;
      const boost = Math.min(1, (energyRef.current - 1) / 1.5);

      const ca = Math.cos(t), sa = Math.sin(t);
      const proj = points.map((p) => {
        const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca;
        const sc = 1 / (2.6 - z * 0.6);
        return { sx: W / 2 + x * R * sc * 1.7, sy: H / 2 - p.y * R * sc * 1.9, d: sc, ph: p.ph, s: p.s };
      });

      // Everything is drawn in batches by shade -- a few dozen draw calls a frame instead of ~750,
      // with each shade's color made once rather than parsed from a string per item.
      const lines = shadeBuckets<{ x: number; y: number }>();
      const pulses = shadeBuckets<number>();
      const trails = shadeBuckets<{ x: number; y: number }>();
      const glow = shadeBuckets<{ x: number; y: number }>();
      const flashes = shadeBuckets<number>();
      const dots = shadeBuckets<number>();

      if (real) {
        // the synapses, darker where stronger
        for (const e of edges as RealEdge[]) {
          const a = proj[e.a], b = proj[e.b];
          const depth = (a.d + b.d) / 2;
          lines[shade(0.05 + Math.min(1, e.w) * 0.28 + depth * 0.15)].push({ x: a.sx, y: a.sy }, { x: b.sx, y: b.sy });
        }
        // the thought being played: the signal crosses each synapse of its real path in turn, the
        // synapses it has crossed stay lit, and each neuron flashes as the signal reaches it
        const p = play.current;
        if (!p.cur) {
          const fresh = p.queue.shift();
          const next = fresh ?? (now - p.idleSince > IDLE_REPLAY_MS && p.recent.length ? p.recent[Math.floor(Math.random() * p.recent.length)] : null);
          if (next) {
            p.cur = { path: next, start: now };
            onThoughtRef.current?.(next.map((i) => real.ids[i]), fresh != null); // live: a new thought, not a replay
          }
        }
        if (p.cur) {
          const hop = HOP_MS / Math.max(0.6, energyRef.current);
          const prog = (now - p.cur.start) / hop;
          const hops = p.cur.path.length - 1;
          const after = prog - hops; // > 0 once the signal has landed: the lit path fades out
          const fade = after > 0 ? Math.max(0, 1 - after / 3) : 1;
          for (let h = 0; h < hops; h++) {
            const a = proj[p.cur.path[h]], b = proj[p.cur.path[h + 1]];
            if (!a || !b || prog < h) break;
            const depth = (a.d + b.d) / 2;
            const head = Math.min(1, prog - h), tail = Math.max(0, head - 0.45);
            const hx = a.sx + (b.sx - a.sx) * head, hy = a.sy + (b.sy - a.sy) * head;
            // crossed already: lit end to end; crossing now: a streak with a tail
            const fx = head >= 1 ? a.sx : a.sx + (b.sx - a.sx) * tail, fy = head >= 1 ? a.sy : a.sy + (b.sy - a.sy) * tail;
            glow[shade((0.22 + depth * 0.2) * fade)].push({ x: fx, y: fy }, { x: hx, y: hy });
            trails[shade((0.7 + depth * 0.3) * fade)].push({ x: fx, y: fy }, { x: hx, y: hy });
            if (head < 1) pulses[shade(0.9)].push(hx, hy, (2.2 + depth * 1.6) * (1 + boost * 0.5));
          }
          for (let k = 0; k <= Math.min(hops, Math.floor(prog)); k++) {
            const q = proj[p.cur.path[k]];
            if (!q) continue;
            const since = prog - k; // how long ago the signal reached this neuron
            const r = (3 + q.d * 5) * (1 + Math.max(0, 0.8 - since) * 1.4);
            flashes[shade(Math.max(0.15, 0.75 - since * 0.15) * fade)].push(q.sx, q.sy, r);
          }
          if (after > 3) { p.cur = null; p.idleSince = now; }
        }
      }

      // Base mesh: dim connective tissue between neighbouring nodes.
      for (const e of real ? [] : edges) {
        const a = proj[e.a], b = proj[e.b];
        const depth = (a.d + b.d) / 2;
        const l = lines[shade(0.1 + depth * 0.25)];
        l.push({ x: a.sx, y: a.sy }, { x: b.sx, y: b.sy });

        // Firing: each synapse fires in turn (about a third of them at any moment), a cobalt streak
        // with a glowing tail racing from one neuron to the next, and the neuron it reaches flashes.
        // Firing is sparse and fast so it reads as electricity, not a crawl of dots.
        const cyc = clock.t * 0.0009 * e.speed + e.phase * 3;
        if (Math.floor(cyc) % 3 !== 0) continue;
        const tt = cyc % 1;
        const head = Math.min(1, tt * 1.35), tail = Math.max(0, head - 0.38);
        const hx = a.sx + (b.sx - a.sx) * head, hy = a.sy + (b.sy - a.sy) * head;
        const tx = a.sx + (b.sx - a.sx) * tail, ty = a.sy + (b.sy - a.sy) * tail;
        const fade = tt > 0.74 ? 1 - (tt - 0.74) / 0.26 : 1; // the streak dies away once it lands
        glow[shade((0.16 + depth * 0.2) * fade)].push({ x: tx, y: ty }, { x: hx, y: hy });
        trails[shade((0.55 + depth * 0.45) * fade)].push({ x: tx, y: ty }, { x: hx, y: hy });
        if (head < 1) pulses[shade(0.75 + depth * 0.25)].push(hx, hy, (1.6 + depth * 1.4) * (1 + boost * 0.5));
        else flashes[shade(0.6 * fade)].push(b.sx, b.sy, (2.5 + depth * 4) * (1.4 - fade * 0.4));
      }

      // the cloud: faint, small, slowly breathing
      for (const p of cloud) {
        const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca;
        const sc = 1 / (2.6 - z * 0.6);
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.0012 + p.ph);
        dots[shade(0.22 + sc * 0.9 * pulse)].push(W / 2 + x * R * sc * 1.7, H / 2 - p.y * R * sc * 1.9, p.s * sc * 3.2);
      }
      // Nodes themselves, gently pulsing -- the "neurons".
      for (const p of proj) {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.002 + p.ph);
        dots[shade(0.4 + p.d * 1.1 * pulse)].push(p.sx, p.sy, p.s * p.d * 2.4);
      }

      const linePaint = Skia.Paint();
      linePaint.setStyle(1);
      linePaint.setStrokeWidth(0.6);
      lines.forEach((pts, b) => {
        if (!pts.length) return;
        linePaint.setColor(ink(b));
        canvas.drawPoints(PointMode.Lines, pts, linePaint);
      });
      // the firing streaks: a wide faint stroke under a thin bright one reads as a glow
      const trailPaint = Skia.Paint();
      trailPaint.setStyle(1);
      trailPaint.setStrokeCap(1);
      for (const [group, width] of [[glow, 5], [trails, 1.5]] as const) {
        trailPaint.setStrokeWidth(width * (1 + boost * 0.4));
        group.forEach((pts, b) => {
          if (!pts.length) return;
          trailPaint.setColor(signalInk(b));
          canvas.drawPoints(PointMode.Lines, pts, trailPaint);
        });
      }
      const fillPaint = Skia.Paint();
      flashes.forEach((xyr, b) => {
        if (!xyr.length) return;
        fillPaint.setColor(signalInk(Math.max(0, b - 10)));
        fillCircles(canvas, xyr, fillPaint);
      });
      for (const group of [pulses, dots]) {
        group.forEach((xyr, b) => {
          if (!xyr.length) return;
          fillPaint.setColor(group === pulses ? signalInk(b) : ink(b));
          fillCircles(canvas, xyr, fillPaint);
        });
      }

      // Digestion bursts: a real event (ingest/reasoning tick) landed just now — an expanding,
      // fading ring at a random node, visibly distinct from the constant background firing above.
      const burstPaint = Skia.Paint();
      burstPaint.setStyle(1);
      burstsRef.current = burstsRef.current.filter((b) => now - b.start < 900);
      burstsRef.current.forEach((b) => {
        const age = (now - b.start) / 900; // 0..1
        const p = proj[b.nodeIdx];
        if (!p) return;
        burstPaint.setStrokeWidth(1.4 * (1 - age));
        burstPaint.setColor(Skia.Color(`rgba(226,163,43,${(0.85 * (1 - age)).toFixed(3)})`));
        canvas.drawCircle(p.sx, p.sy, 3 + age * 22 * p.d, burstPaint);
      });
    },
    size.width,
    size.height,
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={{ width: '100%', height: '100%' }} onLayout={onLayout}>
      {size.width > 0 && (
        <SkiaLoopView loop={loop} width={size.width} height={size.height} />
      )}
    </View>
  );
}
