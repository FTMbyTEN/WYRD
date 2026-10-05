import * as THREE from 'three';
import { KIND, roadY, type Road } from './osmCity';

/**
 * Getting around on the real streets: a pathfinder over the joined-up road network (every road's
 * points are nodes; consecutive points are edges; roads that share a point join there), used for
 * the danfos' routes from bus stop to bus stop and for the mission GPS.
 *
 * Bus stops are the real ones from OpenStreetMap (stops.json) plus stops at the major junctions,
 * named after their street -- danfos in Lagos stop at every junction anyway.
 */
export type Stop = { x: number; z: number; name: string };
export type Path = { pts: THREE.Vector2[]; ys: number[]; cum: number[]; len: number };

const key = (x: number, z: number) => `${Math.round(x)}_${Math.round(z)}`;

export class Router {
  private graph = new Map<string, { p: THREE.Vector2; y: number; links: { to: string; cost: number }[] }>();
  private builtFrom = 0;
  private cells = new Map<string, string[]>(); // a 50 m grid of nodes, for finding the nearest fast
  stops: Stop[] = [];

  /** Rebuild the graph when the loaded roads change. [drivable]: only roads vehicles use. */
  update(roads: Road[], drivable = true) {
    if (roads.length === this.builtFrom) return;
    this.builtFrom = roads.length;
    this.graph.clear();
    this.cells.clear();
    for (const r of roads) {
      if (drivable && r.kind > KIND.service) continue;
      for (let i = 0; i < r.pts.length; i++) {
        const k = key(r.pts[i].x, r.pts[i].y);
        const here = roadY(r, r.cum[i]);
        const node = this.graph.get(k);
        if (node) node.y = Math.max(node.y, here); // where a bridge meets a street, its deck wins
        if (!node) {
          this.graph.set(k, { p: r.pts[i], y: here, links: [] });
          const ck = `${Math.floor(r.pts[i].x / 50)}_${Math.floor(r.pts[i].y / 50)}`;
          (this.cells.get(ck) ?? this.cells.set(ck, []).get(ck)!).push(k);
        }
        if (i > 0) {
          const kp = key(r.pts[i - 1].x, r.pts[i - 1].y), d = r.pts[i].distanceTo(r.pts[i - 1]);
          const slow = r.kind >= KIND.residential ? 1.3 : r.kind <= KIND.primary ? 0.85 : 1; // main roads are quicker
          this.graph.get(kp)!.links.push({ to: k, cost: d * slow }); // along the road's direction
          if (!r.oneway || !drivable) this.graph.get(k)!.links.push({ to: kp, cost: d * slow }); // and back, unless it's one-way
        }
      }
    }
  }

  /** The nearest node to a point. */
  private nearest(x: number, z: number) {
    let best: string | null = null, bd = Infinity;
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
    for (let r = 0; r <= 6 && !best; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      for (const k of this.cells.get(`${cx + i}_${cz + j}`) ?? []) { const n = this.graph.get(k)!; const d = (n.p.x - x) ** 2 + (n.p.y - z) ** 2; if (d < bd) { bd = d; best = k; } }
    }
    return best;
  }

  /** The shortest way along the streets from a to b (A*), or null if they don't connect. */
  route(ax: number, az: number, bx: number, bz: number, maxNodes = 40000): Path | null {
    const s = this.nearest(ax, az), t = this.nearest(bx, bz);
    if (!s || !t) return null;
    const tp = this.graph.get(t)!.p;
    const g = new Map<string, number>([[s, 0]]), came = new Map<string, string>();
    const open = new Heap();
    open.push(0, s);
    const done = new Set<string>();
    let n = 0;
    while (open.size && n++ < maxNodes) {
      const cur = open.pop()!;
      if (cur === t) break;
      if (done.has(cur)) continue;
      done.add(cur);
      for (const l of this.graph.get(cur)!.links) {
        const ng = g.get(cur)! + l.cost;
        if (ng < (g.get(l.to) ?? Infinity)) {
          g.set(l.to, ng);
          came.set(l.to, cur);
          const p = this.graph.get(l.to)!.p;
          open.push(ng + Math.hypot(p.x - tp.x, p.y - tp.y), l.to);
        }
      }
    }
    if (!came.has(t) && s !== t) return null;
    const pts: THREE.Vector2[] = [], ys: number[] = [];
    for (let c: string | undefined = t; c; c = came.get(c)) { const nd = this.graph.get(c)!; pts.push(nd.p); ys.push(nd.y); if (c === s) break; }
    pts.reverse(); ys.reverse();
    if (pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, ys, cum, len: cum[cum.length - 1] };
  }

  /** Stops: the real ones, plus one at each junction of main roads, named after the street. */
  makeStops(real: Stop[], roads: Road[]) {
    const out: Stop[] = [...real];
    const ends = new Map<string, { p: THREE.Vector2; names: Set<string>; n: number }>();
    for (const r of roads) {
      if (r.kind > KIND.tertiary || r.bridge) continue;
      for (const p of r.pts) {
        const k = key(p.x, p.y);
        const e = ends.get(k) ?? ends.set(k, { p, names: new Set(), n: 0 }).get(k)!;
        e.n++;
        if (r.name) e.names.add(r.name);
      }
    }
    for (const e of ends.values()) {
      if (e.n < 3) continue; // a junction: three or more road ends meet
      if (out.some((s) => Math.hypot(s.x - e.p.x, s.z - e.p.y) < 220)) continue; // stops ~220 m apart at least
      const name = [...e.names][0];
      out.push({ x: e.p.x, z: e.p.y, name: name ? name.replace(/ (Road|Street|Avenue|Way|Close|Crescent)$/i, '') : 'Junction' });
    }
    this.stops = out;
    return out;
  }
}

/** A point and direction [s] metres along a path. */
export function along(p: Path, s: number) {
  const t = Math.max(0, Math.min(p.len, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < t) i++;
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const a = p.pts[i - 1], b = p.pts[i];
  const u = (t - p.cum[i - 1]) / seg;
  return { p: a.clone().lerp(b, u), d: b.clone().sub(a).normalize(), y: p.ys[i - 1] + (p.ys[i] - p.ys[i - 1]) * u };
}

/** A binary min-heap of (priority, key). */
class Heap {
  private a: [number, string][] = [];
  get size() { return this.a.length; }
  push(p: number, k: string) {
    const a = this.a; a.push([p, k]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a; if (!a.length) return undefined;
    const top = a[0][1], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; }
    }
    return top;
  }
}
