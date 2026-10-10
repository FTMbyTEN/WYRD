/**
 * Routes for WYRD's rides: the shortest way by road between two points of Lagos, over the main roads (motorway to
 * tertiary and their links) at full detail -- public/world2d/roadgraph.json, built by scripts/build-road-graph.mts.
 * One-way roads are driven one way; the route keeps to the right-hand lane. Pickups and drop-offs are on the main road
 * nearest the spot asked for, as with any ride-hailing car.
 */
import { asset } from './asset';

type Edge = { a: number; b: number; oneway: boolean; w: number; pts: Float64Array; cum: Float64Array; len: number };
export type RoadPoint = { edge: Edge; s: number; x: number; z: number };
export type Route = { pts: Float64Array; cum: Float64Array; len: number };

export class Router {
  private nodes!: Float64Array;
  private edges: Edge[] = [];
  private out: { e: Edge; fwd: boolean }[][] = [];
  private any: { e: Edge; fwd: boolean }[][] = []; // (every way, one-way or not: for the police, sirens on)
  private grid = new Map<string, Edge[]>();
  private main!: Uint8Array; // nodes in the city's one big connected network
  private static ready: Promise<Router> | null = null;
  static load(): Promise<Router> {
    Router.ready ??= fetch(asset('world2d/roadgraph.json')).then((r) => r.json()).then((g: { nodes: number[]; edges: number[][] }) => new Router(g));
    return Router.ready;
  }

  private constructor(g: { nodes: number[]; edges: number[][] }) {
    this.nodes = Float64Array.from(g.nodes, (v) => v / 10);
    const N = this.nodes.length / 2;
    this.out = Array.from({ length: N }, () => []);
    this.any = Array.from({ length: N }, () => []);
    for (const e of g.edges) {
      const [a, b, oneway, w10] = e;
      const ax = this.nodes[a * 2], az = this.nodes[a * 2 + 1];
      const pts = [ax, az];
      for (let i = 4; i < e.length; i += 2) pts.push(ax + e[i] / 10, az + e[i + 1] / 10);
      pts.push(this.nodes[b * 2], this.nodes[b * 2 + 1]);
      const p = Float64Array.from(pts), cum = new Float64Array(p.length / 2);
      for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      const edge: Edge = { a, b, oneway: !!oneway, w: w10 / 10, pts: p, cum, len: cum[cum.length - 1] };
      this.edges.push(edge);
      this.out[a].push({ e: edge, fwd: true });
      if (!edge.oneway) this.out[b].push({ e: edge, fwd: false });
      this.any[a].push({ e: edge, fwd: true }); this.any[b].push({ e: edge, fwd: false });
      // each stretch in the grid cells it passes through (100 m), for finding the road nearest a point
      for (let i = 0; i < p.length; i += 2) {
        const k = `${Math.floor(p[i] / 100)},${Math.floor(p[i + 1] / 100)}`;
        const l = this.grid.get(k);
        if (!l) this.grid.set(k, [edge]); else if (l[l.length - 1] !== edge) l.push(edge);
      }
    }
    // the big connected network (ignoring direction): the few stray bits are never used for pickups
    const near: number[][] = Array.from({ length: N }, () => []);
    for (const e of this.edges) { near[e.a].push(e.b); near[e.b].push(e.a); }
    const comp = new Int32Array(N).fill(-1);
    let best = 0, bestSize = 0, c = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s] >= 0) continue;
      const q = [s]; comp[s] = c; let size = 0;
      while (q.length) { const v = q.pop()!; size++; for (const u of near[v]) if (comp[u] < 0) { comp[u] = c; q.push(u); } }
      if (size > bestSize) { bestSize = size; best = c; }
      c++;
    }
    this.main = Uint8Array.from(comp, (k) => (k === best ? 1 : 0));
  }

  /** the point on a main road nearest (x, z), within [max] m */
  nearest(x: number, z: number, max = 600): RoadPoint | null {
    let best: RoadPoint | null = null, bd = max;
    const R = Math.ceil(max / 100), cx = Math.floor(x / 100), cz = Math.floor(z / 100);
    const done = new Set<Edge>();
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (const e of this.grid.get(`${cx + a},${cz + b}`) ?? []) {
      if (done.has(e) || !this.main[e.a]) continue;
      done.add(e);
      for (let i = 1; i < e.cum.length; i++) {
        const x0 = e.pts[i * 2 - 2], z0 = e.pts[i * 2 - 1], dx = e.pts[i * 2] - x0, dz = e.pts[i * 2 + 1] - z0, L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)), px = x0 + dx * u, pz = z0 + dz * u, d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { edge: e, s: e.cum[i - 1] + Math.sqrt(L2) * u, x: px, z: pz }; }
      }
    }
    return best;
  }

  /** the shortest drive from [from] to [to] by road (A*), as a line to follow in the right-hand lane; null if none.
   *  [anyWay]: one-way streets either way (a police car with its siren on) */
  route(from: RoadPoint, to: RoadPoint, anyWay = false): Route | null {
    const out = anyWay ? this.any : this.out;
    const N = this.nodes.length / 2;
    // the same stretch, ahead: straight there
    if (from.edge === to.edge && (to.s >= from.s || !from.edge.oneway || anyWay)) return this.line([[from.edge, from.s, to.s]]);
    const g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via: ({ e: Edge; fwd: boolean } | null)[] = new Array(N).fill(null);
    const h = (n: number) => Math.hypot(this.nodes[n * 2] - to.x, this.nodes[n * 2 + 1] - to.z);
    const open: [number, number][] = []; // [f, node], kept as a binary heap
    const push = (f: number, n: number) => { open.push([f, n]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop()!; if (open.length) { open[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    // from the start point: along its stretch to either end (only forwards on a one-way)
    const e0 = from.edge;
    g[e0.b] = e0.len - from.s; push(g[e0.b] + h(e0.b), e0.b);
    if (!e0.oneway || anyWay) { g[e0.a] = Math.min(g[e0.a], from.s); push(g[e0.a] + h(e0.a), e0.a); }
    // the goal: reaching the end stretch's start (then forwards), or its end (then back, two-way only)
    const goalA = to.edge.a, goalB = to.edge.oneway && !anyWay ? -1 : to.edge.b;
    let bestEnd: { node: number; cost: number } | null = null;
    while (open.length) {
      const [f, n] = pop();
      if (bestEnd && f >= bestEnd.cost) break;
      if (n === goalA) { const c = g[n] + to.s; if (!bestEnd || c < bestEnd.cost) bestEnd = { node: n, cost: c }; }
      if (n === goalB) { const c = g[n] + (to.edge.len - to.s); if (!bestEnd || c < bestEnd.cost) bestEnd = { node: n, cost: c }; }
      for (const o of out[n]) {
        const m = o.fwd ? o.e.b : o.e.a, c = g[n] + o.e.len;
        if (c < g[m]) { g[m] = c; prev[m] = n; via[m] = o; push(c + h(m), m); }
      }
    }
    if (!bestEnd) return null;
    // back from the goal to the start, as stretches with their from/to distances
    const legs: [Edge, number, number][] = [];
    legs.push(bestEnd.node === goalA ? [to.edge, 0, to.s] : [to.edge, to.edge.len, to.s]);
    let n = bestEnd.node;
    while (prev[n] >= 0) { const o = via[n]!; legs.push(o.fwd ? [o.e, 0, o.e.len] : [o.e, o.e.len, 0]); n = prev[n]; }
    legs.push(n === e0.b ? [e0, from.s, e0.len] : [e0, from.s, 0]);
    legs.reverse();
    return this.line(legs);
  }

  /** stretches walked from s0 to s1 (either way) joined into one line, moved into the right-hand lane */
  private line(legs: [Edge, number, number][]): Route {
    const out: number[] = [];
    const add = (x: number, z: number) => { const n = out.length; if (n && Math.hypot(out[n - 2] - x, out[n - 1] - z) < 0.3) return; out.push(x, z); };
    for (const [e, s0, s1] of legs) {
      const fwd = s1 >= s0, at = (s: number) => { let i = 1; while (i < e.cum.length - 1 && e.cum[i] < s) i++; const t = (s - e.cum[i - 1]) / ((e.cum[i] - e.cum[i - 1]) || 1); return [e.pts[i * 2 - 2] + (e.pts[i * 2] - e.pts[i * 2 - 2]) * t, e.pts[i * 2 - 1] + (e.pts[i * 2 + 1] - e.pts[i * 2 - 1]) * t]; };
      const lane = e.oneway ? 0 : Math.min(2.2, e.w / 4); // (keep right on a two-way road)
      const pts: number[][] = [at(s0)];
      if (fwd) { for (let i = 0; i < e.cum.length; i++) if (e.cum[i] > s0 && e.cum[i] < s1) pts.push([e.pts[i * 2], e.pts[i * 2 + 1]]); }
      else { for (let i = e.cum.length - 1; i >= 0; i--) if (e.cum[i] < s0 && e.cum[i] > s1) pts.push([e.pts[i * 2], e.pts[i * 2 + 1]]); }
      pts.push(at(s1));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        add(pts[i][0] - (dz / L) * lane, pts[i][1] + (dx / L) * lane); // (right of the way it's driven: (-dz, dx))
      }
    }
    const p = Float64Array.from(out), cum = new Float64Array(p.length / 2);
    for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    return { pts: p, cum, len: cum[cum.length - 1] };
  }
}

/** where along [r] at distance [s]: the point and the way it's heading (atan2 dx, dz) */
export function onRoute(r: Route, s: number) {
  const d = Math.max(0, Math.min(r.len, s));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < d) i++;
  const t = (d - r.cum[i - 1]) / ((r.cum[i] - r.cum[i - 1]) || 1);
  const x0 = r.pts[i * 2 - 2], z0 = r.pts[i * 2 - 1], x1 = r.pts[i * 2], z1 = r.pts[i * 2 + 1];
  return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, heading: Math.atan2(x1 - x0, z1 - z0) };
}
