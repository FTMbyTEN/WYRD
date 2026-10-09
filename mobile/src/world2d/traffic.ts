/**
 * Traffic lights for NAIJA 2099. Junctions are found in the real map: wherever roads share a point -- a side street ending
 * on a main road, two roads crossing, three or more ends meeting -- and at least one of them is a main road (tertiary or
 * bigger), there are lights. A road running straight through a junction is two approaches, one from each side. The
 * approaches are split in two by the main road's line -- those along it, those across -- and the two take turns: green,
 * amber, then red while the others go (with a moment of all-red between). Each junction runs a little out of step with
 * its neighbours, like real ones.
 *
 * Cars ask [stopFor] how far ahead they must stop (the stop line, a few metres before the junction) when their light
 * isn't green; a car already at the line when it turns amber goes on through.
 */
import { KIND, type Road, type World } from './tiles';

/** one way into a junction: along road [r], [ix, iz] the way in; [fwd]: arriving along the road's own direction */
type Approach = { r: Road; ix: number; iz: number; fwd: boolean; group: 0 | 1 };
export type Junction = { x: number; z: number; approaches: Approach[]; offset: number };
export type Light = 'g' | 'a' | 'r';

const CYCLE = 26; // seconds for both ways to have had their turn
/** the stop line: this far before the junction's middle (m) */
const LINE = 7;

export class Traffic {
  junctions: Junction[] = [];
  /** along each road, its junctions: where (distance from the road's start) and the light group each way */
  private along = new Map<Road, { s: number; j: Junction; fwd: 0 | 1 | -1; back: 0 | 1 | -1 }[]>();
  private built = { x: Infinity, z: 0, version: -1 };

  /** Finds the junctions near (x, z) again when you've moved on, or the map around changed. */
  update(world: World, x: number, z: number) {
    if (Math.hypot(x - this.built.x, z - this.built.z) < 150 && world.version === this.built.version) return;
    this.built = { x, z, version: world.version };
    const roads = world.roadsNear(x, z, 450, KIND.residential).filter((r) => !r.bridge && r.kind !== KIND.link);
    // every road's points in a grid, to find the points roads share
    const CELL = 4, grid = new Map<string, { r: Road; i: number }[]>();
    const cell = (px: number, pz: number) => `${Math.floor(px / CELL)},${Math.floor(pz / CELL)}`;
    for (const r of roads) for (let i = 0; i < r.p.length / 2; i++) {
      const k = cell(r.p[i * 2], r.p[i * 2 + 1]);
      const l = grid.get(k); if (l) l.push({ r, i }); else grid.set(k, [{ r, i }]);
    }
    // meeting points: a road's point with another road's point within 2.5 m, gathered into clusters 6 m across
    const clusters: { x: number; z: number; at: Map<Road, number> }[] = [];
    for (const r of roads) for (let i = 0; i < r.p.length / 2; i++) {
      const px = r.p[i * 2], pz = r.p[i * 2 + 1];
      const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
      let shared = false;
      for (let a = -1; a <= 1 && !shared; a++) for (let b = -1; b <= 1 && !shared; b++) {
        for (const q of grid.get(`${cx + a},${cz + b}`) ?? []) if (q.r !== r && Math.hypot(q.r.p[q.i * 2] - px, q.r.p[q.i * 2 + 1] - pz) < 2.5) { shared = true; break; }
      }
      if (!shared) continue;
      let c = clusters.find((k) => Math.hypot(k.x - px, k.z - pz) < 6);
      if (!c) { c = { x: px, z: pz, at: new Map() }; clusters.push(c); }
      if (!c.at.has(r)) c.at.set(r, i);
    }
    this.junctions = [];
    this.along.clear();
    for (const c of clusters) {
      // the ways in: from each side of every road that passes through, from the one side of a road that ends here
      const approaches: Omit<Approach, 'group'>[] = [];
      for (const [r, i] of c.at) {
        const n = r.p.length / 2, x0 = r.p[i * 2], z0 = r.p[i * 2 + 1];
        const from = (k: number, fwd: boolean) => {
          const dx = x0 - r.p[k * 2], dz = z0 - r.p[k * 2 + 1], L = Math.hypot(dx, dz) || 1;
          approaches.push({ r, ix: dx / L, iz: dz / L, fwd });
        };
        if (i > 0) from(i - 1, true); // arriving along the road's direction
        if (i < n - 1 && !r.oneway) from(i + 1, false); // arriving against it (not on a one-way)
      }
      if (approaches.length < 3 || ![...c.at.keys()].some((r) => r.kind <= KIND.tertiary)) continue;
      // the main road's line splits the approaches into two groups
      const main = approaches.reduce((a, b) => (b.r.kind < a.r.kind || (b.r.kind === a.r.kind && b.r.w > a.r.w) ? b : a));
      const j: Junction = { x: c.x, z: c.z, approaches: [], offset: ((Math.abs(Math.round(c.x * 7 + c.z * 13)) % 1000) / 1000) * CYCLE };
      for (const a of approaches) j.approaches.push({ ...a, group: Math.abs(a.ix * main.ix + a.iz * main.iz) > 0.7 ? 0 : 1 });
      this.junctions.push(j);
      for (const [r, i] of c.at) {
        const fwd = j.approaches.find((a) => a.r === r && a.fwd), back = j.approaches.find((a) => a.r === r && !a.fwd);
        const list = this.along.get(r) ?? [];
        list.push({ s: r.cum[i], j, fwd: fwd ? fwd.group : -1, back: back ? back.group : -1 });
        this.along.set(r, list);
      }
    }
    for (const l of this.along.values()) l.sort((a, b) => a.s - b.s);
  }

  /** the light for approach [group] of junction [j] at time [now] (ms) */
  light(j: Junction, group: 0 | 1, now: number): Light {
    const t = (now / 1000 + j.offset) % CYCLE;
    const g0 = t < 10 ? 'g' : t < 12.5 ? 'a' : 'r';
    const g1 = t >= 13 && t < 23 ? 'g' : t >= 23 && t < 25.5 ? 'a' : 'r';
    return group === 0 ? g0 : g1;
  }

  /**
   * How far a car on [r] has to its stop line if the light at the next junction ahead isn't green (Infinity: carry on).
   * [dir]: which way it drives along the road (1: from its start); [driven]: how far it is along, in that direction.
   */
  stopFor(r: Road, dir: 1 | -1, driven: number, now: number): number {
    const list = this.along.get(r);
    if (!list) return Infinity;
    const pos = dir === 1 ? driven : r.len - driven;
    // the next junction ahead (within 60 m), allowing for a car just over its stop line
    let hit: (typeof list)[number] | null = null, dist = Infinity;
    for (const e of list) {
      const d = dir === 1 ? e.s - pos : pos - e.s;
      if (d > LINE - 1 && d < 60 && d < dist) { dist = d; hit = e; }
    }
    if (!hit) return Infinity;
    const group = dir === 1 ? hit.fwd : hit.back;
    if (group === -1) return Infinity;
    const l = this.light(hit.j, group, now), toLine = dist - LINE;
    if (l === 'g') return Infinity;
    if (l === 'a' && toLine < 4) return Infinity; // too close to stop for an amber: go on
    return Math.max(0, toLine);
  }

  /**
   * Draws the lights of the junctions on screen: a pole at each approach, beside the stop line on the right, with its
   * light lit. [at]: the renderer's world-to-screen; [k]: px per metre.
   */
  draw(ctx: CanvasRenderingContext2D, at: (x: number, z: number, y: number) => { sx: number; sy: number }, k: number, w: number, h: number, now: number, night: boolean) {
    if (k < 4) return; // (zoomed right out: too small to see)
    for (const j of this.junctions) {
      const c = at(j.x, j.z, 0);
      if (c.sx < -60 || c.sx > w + 60 || c.sy < -80 || c.sy > h + 60) continue;
      for (const e of j.approaches) {
        // beside the stop line, on the right of the approach (traffic keeps right in Nigeria)
        const back = LINE + 1, side = e.r.w / 2 + 1.2;
        const x = j.x - e.ix * back - e.iz * side, z = j.z - e.iz * back + e.ix * side;
        const base = at(x, z, 0), top = at(x, z, 4.6);
        ctx.strokeStyle = '#2A3140'; ctx.lineWidth = Math.max(1.2, 0.18 * k);
        ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();
        const bw = Math.max(3, 0.5 * k), bh = Math.max(7, 1.3 * k);
        ctx.fillStyle = '#1B2029'; ctx.fillRect(top.sx - bw / 2, top.sy - bh, bw, bh);
        const l = this.light(j, e.group, now);
        const col = l === 'g' ? '#3DFF9A' : l === 'a' ? '#FFC93D' : '#FF3B3B';
        const cy = top.sy - bh + (l === 'r' ? bh * 0.2 : l === 'a' ? bh * 0.5 : bh * 0.8);
        if (night || k > 9) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = night ? 0.8 : 0.35;
          const g = ctx.createRadialGradient(top.sx, cy, 0, top.sx, cy, bw * 2.4); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(top.sx - bw * 2.4, cy - bw * 2.4, bw * 4.8, bw * 4.8); ctx.restore();
        }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(top.sx, cy, Math.max(1.3, bw * 0.32), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}
