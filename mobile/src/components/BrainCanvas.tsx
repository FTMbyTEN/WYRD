import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { useSkiaLoop } from '../vortex/skiaLoop';

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

/**
 * The node-brain visualization behind the WYRD home tab and the BRAIN_3D overlay. Shaped like an
 * actual (stylized) brain — two hemispheres split by a fissure, a cerebellum lobe, a wrinkled
 * surface — with signal packets ("electrons") travelling the connections continuously, and real
 * ingestion/reasoning events (`activitySignal`, bump it on each one) triggering a bright expanding
 * pulse at a random node so "WYRD digesting something" is an actual visible event, not a metaphor.
 */
export function BrainCanvas({ nodeCount = 150, activitySignal }: { nodeCount?: number; activitySignal?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const burstsRef = useRef<Burst[]>([]);

  const points = useMemo(() => buildBrain(nodeCount), [nodeCount]);
  const edges = useMemo(() => buildEdges(points), [points]);

  useEffect(() => {
    if (activitySignal === undefined) return;
    burstsRef.current.push({ start: performance.now(), nodeIdx: Math.floor(Math.random() * points.length) });
    if (burstsRef.current.length > 12) burstsRef.current.shift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitySignal]);

  const picture = useSkiaLoop(
    (canvas, W, H, now) => {
      const t = now * 0.00022;
      const R = Math.min(W, H) * 0.42;
      canvas.clear(Skia.Color('rgba(0,0,0,0)'));

      const ca = Math.cos(t), sa = Math.sin(t);
      const proj = points.map((p) => {
        const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca;
        const sc = 1 / (2.6 - z * 0.6);
        return { sx: W / 2 + x * R * sc * 1.7, sy: H / 2 - p.y * R * sc * 1.9, d: sc, ph: p.ph, s: p.s };
      });

      // Base mesh: dim connective tissue between neighbouring nodes.
      const linePaint = Skia.Paint();
      linePaint.setStyle(1);
      linePaint.setStrokeWidth(0.8);
      edges.forEach((e) => {
        const a = proj[e.a], b = proj[e.b];
        const depth = (a.d + b.d) / 2;
        linePaint.setColor(Skia.Color(`rgba(10,156,47,${(0.22 + depth * 0.4).toFixed(3)})`));
        canvas.drawLine(a.sx, a.sy, b.sx, b.sy, linePaint);
      });

      // Firing signal: a bright packet travelling each edge on a continuous loop — this is the
      // "electrons keep firing" part, always running, not just on activity.
      const pulsePaint = Skia.Paint();
      edges.forEach((e) => {
        const a = proj[e.a], b = proj[e.b];
        const tt = (now * 0.00035 * e.speed + e.phase) % 1;
        const px = a.sx + (b.sx - a.sx) * tt, py = a.sy + (b.sy - a.sy) * tt;
        const depth = (a.d + b.d) / 2;
        pulsePaint.setColor(Skia.Color(`rgba(186,255,201,${(0.55 + depth * 0.45).toFixed(3)})`));
        canvas.drawCircle(px, py, 1.3 + depth * 1.1, pulsePaint);
      });

      // Nodes themselves, gently pulsing — the "neurons".
      const dotPaint = Skia.Paint();
      proj.forEach((p) => {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.002 + p.ph);
        dotPaint.setColor(Skia.Color(`rgba(0,255,65,${(0.25 + p.d * 0.9 * pulse).toFixed(3)})`));
        canvas.drawCircle(p.sx, p.sy, p.s * p.d * 1.5, dotPaint);
      });

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
        burstPaint.setColor(Skia.Color(`rgba(186,255,201,${(0.8 * (1 - age)).toFixed(3)})`));
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
        <Canvas style={{ width: size.width, height: size.height }}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      )}
    </View>
  );
}
