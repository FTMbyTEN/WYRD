// Fruchterman-Reingold layout for small idea networks (the concept map and the neural tissue).

export type LaidOut = { id: string; count: number; x: number; y: number };

export function forceLayout(graph: { nodes: { id: string; count: number }[]; edges: { a: string; b: string; weight: number }[] }): LaidOut[] {
  // Fruchterman-Reingold in the unit square, with a pull toward the centre so unlinked ideas
  // and separate clusters sit around the middle instead of being flung into the corners.
  const N = graph.nodes.length;
  const idx = new Map(graph.nodes.map((x, i) => [x.id, i]));
  const pts: LaidOut[] = graph.nodes.map((x, i) => {
    const a = i * 2.39996; // golden angle: spread-out, deterministic start
    const r = 0.05 + 0.3 * Math.sqrt(i / Math.max(1, N));
    return { ...x, x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) };
  });
  const k = 0.9 * Math.sqrt(1 / Math.max(1, N));
  const maxW = Math.max(1, ...graph.edges.map((e) => e.weight));
  const ITER = 320;
  for (let it = 0; it < ITER; it++) {
    const temp = 0.08 * (1 - it / ITER) + 0.002;
    const dx = new Array(N).fill(0), dy = new Array(N).fill(0);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const vx = pts[i].x - pts[j].x, vy = pts[i].y - pts[j].y;
      const d = Math.max(Math.hypot(vx, vy), 0.01);
      const f = (k * k) / d;
      dx[i] += (vx / d) * f; dy[i] += (vy / d) * f; dx[j] -= (vx / d) * f; dy[j] -= (vy / d) * f;
    }
    for (const e of graph.edges) {
      const i = idx.get(e.a), j = idx.get(e.b);
      if (i == null || j == null) continue;
      const vx = pts[i].x - pts[j].x, vy = pts[i].y - pts[j].y;
      const d = Math.max(Math.hypot(vx, vy), 0.01);
      const f = ((d * d) / k) * (0.4 + 0.6 * (e.weight / maxW));
      dx[i] -= (vx / d) * f; dy[i] -= (vy / d) * f; dx[j] += (vx / d) * f; dy[j] += (vy / d) * f;
    }
    for (let i = 0; i < N; i++) {
      dx[i] += (0.5 - pts[i].x) * 4; dy[i] += (0.5 - pts[i].y) * 4; // gravity
      const m = Math.hypot(dx[i], dy[i]) || 1;
      const step = Math.min(m, temp);
      pts[i].x = Math.min(0.93, Math.max(0.07, pts[i].x + (dx[i] / m) * step));
      pts[i].y = Math.min(0.93, Math.max(0.07, pts[i].y + (dy[i] / m) * step));
    }
  }
  // centre the result and scale it to fill the canvas evenly (same factor both ways, so
  // clusters keep their shape and their distance from each other)
  const cx = pts.reduce((t, p) => t + p.x, 0) / N, cy = pts.reduce((t, p) => t + p.y, 0) / N;
  const reach = Math.max(1e-6, ...pts.map((p) => Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy))));
  for (const p of pts) { p.x = 0.5 + ((p.x - cx) / reach) * 0.42; p.y = 0.5 + ((p.y - cy) / reach) * 0.42; }
  return pts;
}
