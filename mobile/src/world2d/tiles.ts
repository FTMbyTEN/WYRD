/**
 * The real Lagos for the 2D game: the OpenStreetMap tiles (public/world/v1, 500 m each), read into
 * flat arrays the renderer can draw straight from, with each tile's street furniture placed once
 * (deterministically, so a lamp is always in the same spot) and a grid for bumping into buildings.
 * Only tiles near the player stay in memory.
 *
 * Map data © OpenStreetMap contributors (ODbL).
 */
export const BASE = 'world/v1';
export const TILE = 500;
export const KIND = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, link: 5, residential: 6, service: 7, foot: 8 };

export type Road = { kind: number; w: number; bridge: boolean; name: string | null; oneway: boolean; p: Float32Array; len: number; cum: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number };
/** what a building looks like: a Lagos house, a walk-up block, a block with shops below, or a glass tower */
export type BldStyle = 'house' | 'block' | 'shops' | 'tower';
export type Bld = { p: Float32Array; h: number; minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number; tone: number; glass: boolean; ccw: boolean;
  style: BldStyle; area: number; tanks: number;
  /** under a landmark's picture: not drawn (still solid) */ hide?: boolean;
  /** a road runs through it on the map: dropped, not drawn and not solid */ gone?: boolean };
export type Water = { p: Float32Array; ribbon: number }; // ribbon > 0: a river of that width (m); 0: an area
export type Prop = { s: string; x: number; z: number };
export type Tile = { key: string; tx: number; tz: number; roads: Road[]; blds: Bld[]; water: Water[]; rail: Float32Array[]; props: Prop[]; grid: Map<number, Bld[]>; used: number;
  /** every street in the tile, kept or not, with its signature: so it can take over one whose keeper is unloaded */ all: { sig: string; r: Road }[] };

type Raw = { x: number; z: number; names: string[]; roads: number[][]; buildings: number[][]; water: number[][]; rail: number[][] };

const GRID = 25; // metres, for collisions
const gkey = (gx: number, gz: number) => gx * 100003 + gz;

function lengths(p: Float32Array) {
  const n = p.length / 2, cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
  return cum;
}

/** A point (and direction) [s] metres along a polyline. */
export function along(p: Float32Array, cum: Float32Array, s: number): { x: number; z: number; dx: number; dz: number } {
  const n = cum.length;
  if (s <= 0) s = 0;
  let i = 1;
  while (i < n - 1 && cum[i] < s) i++;
  const a = cum[i - 1], b = cum[i], t = b > a ? Math.min(1, (s - a) / (b - a)) : 0;
  const x0 = p[i * 2 - 2], z0 = p[i * 2 - 1], x1 = p[i * 2], z1 = p[i * 2 + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1;
  return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, dx: (x1 - x0) / L, dz: (z1 - z0) / L };
}

export function inPoly(p: Float32Array, x: number, z: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether a polyline [l] crosses, touches or lies inside the closed outline [poly]. */
export function crosses(poly: Float32Array, l: Float32Array) {
  const n = poly.length;
  const hit = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) => {
    const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    return ((d1 > 0) !== (d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0) !== (d4 > 0) || d3 === 0 || d4 === 0);
  };
  for (let i = 2; i < l.length; i += 2) {
    const ax = l[i - 2], az = l[i - 1], bx = l[i], bz = l[i + 1];
    if (inPoly(poly, ax, az)) return true;
    for (let j = 0, k = n - 2; j < n; k = j, j += 2) if (hit(ax, az, bx, bz, poly[k], poly[k + 1], poly[j], poly[j + 1])) return true;
  }
  return inPoly(poly, l[l.length - 2], l[l.length - 1]);
}

export class World {
  index: { tiles: string[] } | null = null;
  have = new Set<string>();
  tiles = new Map<string, Tile>();
  private loading = new Map<string, Promise<void>>();
  /** a street crossing tile edges is in every tile it touches: only the first tile loaded keeps it */
  private owners = new Map<string, string>();
  ready: Promise<void>;
  /** keeps the famous buildings' plots clear of the map's own footprints */
  clearings: { x: number; z: number; r: number }[] = [];
  markets: { x: number; z: number }[] = [];
  /** bumped whenever what is loaded changes, so cached drawings know to redraw */
  version = 0;

  constructor() {
    this.ready = fetch(`${BASE}/index.json`).then((r) => r.json()).then((j) => { this.index = j; this.have = new Set(j.tiles); });
  }

  /** Loads the tiles around (x, z) and forgets far ones. */
  around(x: number, z: number, radius: number) {
    const now = performance.now();
    const t0x = Math.floor((x - radius) / TILE), t1x = Math.floor((x + radius) / TILE);
    const t0z = Math.floor((z - radius) / TILE), t1z = Math.floor((z + radius) / TILE);
    for (let tx = t0x; tx <= t1x; tx++) for (let tz = t0z; tz <= t1z; tz++) {
      const key = `${tx}_${tz}`;
      const t = this.tiles.get(key);
      if (t) { t.used = now; continue; }
      if (this.have.has(key) && !this.loading.has(key)) this.loading.set(key, this.load(key));
    }
    if (this.tiles.size > 48) {
      const old = [...this.tiles.values()].sort((a, b) => a.used - b.used).slice(0, this.tiles.size - 40);
      for (const t of old) {
        this.tiles.delete(t.key); this.loading.delete(t.key);
        for (const [sig, k] of this.owners) if (k === t.key) this.owners.delete(sig);
      }
      // streets the forgotten tiles kept are taken over by a loaded tile that has them too, so no road breaks off
      for (const t of this.tiles.values()) {
        let got = false;
        for (const { sig, r } of t.all) if (!this.owners.has(sig)) { this.owners.set(sig, t.key); t.roads.push(r); got = true; }
        if (got) this.clearRoads(t);
        if (got) t.roads.sort((a, b) => b.kind - a.kind);
        this.version++;
      }
    }
  }

  private async load(key: string) {
    try {
      const raw = (await fetch(`${BASE}/${key}.json`).then((r) => r.json())) as Raw;
      const tile = this.parse(key, raw);
      this.tiles.set(key, tile);
      this.clearRoads(tile);
      this.version++;
    } catch { this.loading.delete(key); }
  }

  private parse(key: string, d: Raw): Tile {
    const ox = d.x * TILE, oz = d.z * TILE;
    const roads: Road[] = [], all: { sig: string; r: Road }[] = [];
    for (const r of d.roads) {
      const [kind, w10, bridge, nameI, oneway] = r;
      const n = (r.length - 5) >> 1;
      if (n < 2) continue;
      const p = new Float32Array(n * 2);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = r[5 + i * 2] / 10 + ox, z = r[6 + i * 2] / 10 + oz;
        p[i * 2] = x; p[i * 2 + 1] = z;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const sig = `${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[p.length - 2])},${Math.round(p[p.length - 1])},${n}`;
      const cum = lengths(p);
      const road: Road = { kind, w: w10 / 10, bridge: !!bridge, name: nameI >= 0 ? d.names[nameI] : null, oneway: !!oneway, p, cum, len: cum[cum.length - 1], minX, maxX, minZ, maxZ };
      all.push({ sig, r: road });
      const owner = this.owners.get(sig);
      if (owner && owner !== key) continue;
      this.owners.set(sig, key);
      roads.push(road);
    }
    // roads drawn widest-kind last, so main roads sit over side streets
    roads.sort((a, b) => b.kind - a.kind);

    let seed = (d.x * 7919 + d.z * 104729) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    const blds: Bld[] = [];
    const grid = new Map<number, Bld[]>();
    for (const b of d.buildings) {
      const n = (b.length - 1) >> 1;
      if (n < 3) continue;
      const p = new Float32Array(n * 2);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, cx = 0, cz = 0, area = 0;
      for (let i = 0; i < n; i++) {
        const x = b[1 + i * 2] / 10 + ox, z = b[2 + i * 2] / 10 + oz;
        p[i * 2] = x; p[i * 2 + 1] = z; cx += x; cz += z;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      for (let i = 0, j = n - 1; i < n; j = i++) area += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
      cx /= n; cz /= n;
      const lv = b[0];
      const h = Math.min(90, lv * 3.2 + (lv > 4 ? 6 : 0));
      const a2 = Math.abs(area) / 2;
      const style: BldStyle = h > 24 ? 'tower' : a2 < 260 && lv <= 2 ? 'house' : lv >= 2 && rnd() < 0.45 ? 'shops' : 'block';
      const hh = style === 'house' ? Math.max(h, 3.4) : style === 'shops' ? Math.max(h, 9.6) : style === 'block' ? Math.max(h, a2 > 400 ? 9.6 : 6.4) : h;
      const bld: Bld = { p, h: hh, minX, maxX, minZ, maxZ, cx, cz, tone: rnd(), glass: style === 'tower', ccw: area < 0, style, area: a2,
        tanks: style === 'house' ? 0 : style === 'tower' ? (rnd() < 0.3 ? 1 : 0) : 1 + Math.floor(rnd() * 3),
        hide: this.clearings.some((c) => Math.hypot(c.x - cx, c.z - cz) < c.r) };
      blds.push(bld);
      for (let gx = Math.floor(minX / GRID); gx <= Math.floor(maxX / GRID); gx++)
        for (let gz = Math.floor(minZ / GRID); gz <= Math.floor(maxZ / GRID); gz++) {
          const k = gkey(gx, gz);
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(bld);
        }
    }

    const water: Water[] = [];
    for (const w of d.water) {
      if (w.length % 2 === 1) {
        const p = new Float32Array(w.length - 1);
        for (let i = 1; i < w.length; i += 2) { p[i - 1] = w[i] / 10 + ox; p[i] = w[i + 1] / 10 + oz; }
        water.push({ p, ribbon: w[0] / 10 });
      } else {
        const p = new Float32Array(w.length);
        for (let i = 0; i < w.length; i += 2) { p[i] = w[i] / 10 + ox; p[i + 1] = w[i + 1] / 10 + oz; }
        water.push({ p, ribbon: 0 });
      }
    }
    const rail = d.rail.map((r) => { const p = new Float32Array(r.length); for (let i = 0; i < r.length; i += 2) { p[i] = r[i] / 10 + ox; p[i + 1] = r[i + 1] / 10 + oz; } return p; });

    const tile: Tile = { key, tx: d.x, tz: d.z, roads, blds, water, rail, props: [], grid, used: performance.now(), all };
    tile.props = this.furnish(tile, rnd);
    return tile;
  }

  /** Street furniture along the real roads: lamps, palms and trees, bus stops, stalls. */
  private furnish(t: Tile, rnd: () => number): Prop[] {
    const out: Prop[] = [];
    const free = (x: number, z: number) => !this.blockedIn(t, x, z, 1.5);
    const put = (s: string, x: number, z: number) => { if (free(x, z)) out.push({ s, x, z }); };
    for (const r of t.roads) {
      if (r.bridge || r.kind > KIND.residential || r.kind === KIND.link) continue;
      const big = r.kind <= KIND.secondary, mid = r.kind <= KIND.tertiary;
      const edge = r.w / 2 + (big ? 2.2 : 1.4);
      if (mid) for (let s = 10; s < r.len - 5; s += big ? 32 : 40) {
        const a = along(r.p, r.cum, s);
        for (const side of [-1, 1]) put('lamp', a.x - a.dz * edge * side, a.z + a.dx * edge * side);
      }
      if (big) for (let s = 20; s < r.len - 10; s += 26) {
        if (rnd() < 0.35) continue;
        const a = along(r.p, r.cum, s), side = rnd() < 0.5 ? -1 : 1, off = r.w / 2 + 6 + rnd() * 3;
        put(rnd() < 0.6 ? 'palm' : 'tree', a.x - a.dz * off * side, a.z + a.dx * off * side);
      }
      if (big && r.len > 180) {
        const a = along(r.p, r.cum, r.len * (0.3 + rnd() * 0.4)), off = r.w / 2 + 4;
        put('busstop', a.x - a.dz * off, a.z + a.dx * off);
        for (let k = 0; k < 3; k++) {
          const b = along(r.p, r.cum, Math.min(r.len, r.len * 0.5 + (k - 1) * 14 + rnd() * 6)), o2 = r.w / 2 + 5 + rnd() * 2;
          if (rnd() < 0.7) put(['stall-yellow', 'stall-blue', 'stall-orange', 'kiosk'][Math.floor(rnd() * 4)], b.x + b.dz * o2, b.z - b.dx * o2);
        }
      } else if (r.kind === KIND.residential && r.len > 60 && rnd() < 0.25) {
        const a = along(r.p, r.cum, r.len * rnd()), off = r.w / 2 + 2;
        put(rnd() < 0.5 ? 'tree' : 'bush', a.x - a.dz * off, a.z + a.dx * off);
      }
    }
    // the markets of the real map get their crowd of stalls
    for (const m of this.markets) {
      if (Math.floor(m.x / TILE) !== t.tx || Math.floor(m.z / TILE) !== t.tz) continue;
      for (let k = 0; k < 14; k++) {
        const a = rnd() * Math.PI * 2, d = 6 + rnd() * 26;
        put(['stall-yellow', 'stall-blue', 'stall-orange'][k % 3], m.x + Math.cos(a) * d, m.z + Math.sin(a) * d);
      }
    }
    return out;
  }

  /**
   * The map's buildings and roads come from different surveys and don't always agree. A building a road
   * runs through is dropped (the road wins); one that only cuts into the pavement has those corners pulled
   * back to the pavement's edge. Checked both ways as each tile arrives, so roads from a neighbouring tile count.
   */
  /**
   * Some streets on the map stop a few metres short of the road they meet. An end that touches nothing,
   * with another road within 12 m, is carried on to meet it, so the street joins up as it does in Lagos.
   */
  private joinRoads(roads: Road[], all: Tile[], near: (x: number, z: number) => boolean = () => true) {
    const nearest = (x: number, z: number, self: Road) => {
      let best: { x: number; z: number; d: number } | null = null;
      for (const t of all) for (const r of t.roads) {
        if (r === self || r.bridge || r.maxX < x - 12 || r.minX > x + 12 || r.maxZ < z - 12 || r.minZ > z + 12) continue;
        for (let i = 2; i < r.p.length; i += 2) {
          const x0 = r.p[i - 2], z0 = r.p[i - 1], dx = r.p[i] - x0, dz = r.p[i + 1] - z0, L2 = dx * dx + dz * dz || 1;
          const u = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
          const px = x0 + dx * u, pz = z0 + dz * u, d = Math.hypot(px - x, pz - z);
          if (!best || d < best.d) best = { x: px, z: pz, d };
        }
      }
      return best;
    };
    for (const r of roads) {
      if (r.bridge || r.kind > KIND.residential || r.p.length < 4) continue;
      for (const head of [true, false]) {
        const e = head ? 0 : r.p.length - 2, x = r.p[e], z = r.p[e + 1];
        if (!near(x, z)) continue;
        const n = nearest(x, z, r);
        if (!n || n.d < 1.5 || n.d > 12) continue;
        // carry on only roughly the way the street was already going (not doubling back)
        const ix = head ? r.p[2] : r.p[r.p.length - 4], iz = head ? r.p[3] : r.p[r.p.length - 3];
        const ox = x - ix, oz = z - iz, gx = n.x - x, gz = n.z - z;
        if ((ox * gx + oz * gz) / ((Math.hypot(ox, oz) || 1) * n.d) < 0) continue;
        const p = new Float32Array(r.p.length + 2);
        if (head) { p[0] = n.x; p[1] = n.z; p.set(r.p, 2); } else { p.set(r.p, 0); p[r.p.length] = n.x; p[r.p.length + 1] = n.z; }
        r.p = p; r.cum = lengths(p); r.len = r.cum[r.cum.length - 1];
        r.minX = Math.min(r.minX, n.x); r.maxX = Math.max(r.maxX, n.x); r.minZ = Math.min(r.minZ, n.z); r.maxZ = Math.max(r.maxZ, n.z);
      }
    }
  }

  private clearRoads(tile: Tile) {
    const all = [...this.tiles.values()];
    this.joinRoads(tile.roads, all);
    // and the loose ends of streets already loaded that the new tile's roads may now meet
    const [a0, a1, b0, b1] = [tile.tx * TILE - 15, (tile.tx + 1) * TILE + 15, tile.tz * TILE - 15, (tile.tz + 1) * TILE + 15];
    for (const t of all) if (t !== tile) this.joinRoads(t.roads, all, (x, z) => x > a0 && x < a1 && z > b0 && z < b1);
    // returns whether it moved a corner; a corner pulled off one road may land on another, so it is run again
    const pass = (b: Bld, roads: Road[], trim = true) => {
      let any = false;
      for (const r of roads) {
        if (r.bridge || r.kind > KIND.residential) continue;
        const band = r.w / 2 + (r.kind <= KIND.tertiary ? 3.5 : 1.75); // the road and its pavement, as drawn
        if (r.maxX + band < b.minX || r.minX - band > b.maxX || r.maxZ + band < b.minZ || r.minZ - band > b.maxZ) continue;
        // through it: the road's middle line crosses the footprint's outline, or lies inside it
        if (crosses(b.p, r.p)) { b.gone = true; b.hide = true; return false; }
        // into the pavement: pull those corners out to its edge
        if (!trim) continue;
        let moved = false;
        for (let v = 0; v < b.p.length; v += 2) {
          for (let i = 2; i < r.p.length; i += 2) {
            const x0 = r.p[i - 2], z0 = r.p[i - 1], dx = r.p[i] - x0, dz = r.p[i + 1] - z0, L2 = dx * dx + dz * dz || 1;
            const u = Math.max(0, Math.min(1, ((b.p[v] - x0) * dx + (b.p[v + 1] - z0) * dz) / L2));
            const px = x0 + dx * u, pz = z0 + dz * u, ox = b.p[v] - px, oz = b.p[v + 1] - pz, d = Math.hypot(ox, oz);
            if (d < band && d > 0.01) { b.p[v] = px + (ox / d) * band; b.p[v + 1] = pz + (oz / d) * band; moved = true; }
          }
        }
        if (moved) {
          b.minX = Infinity; b.maxX = -Infinity; b.minZ = Infinity; b.maxZ = -Infinity;
          for (let v = 0; v < b.p.length; v += 2) { b.minX = Math.min(b.minX, b.p[v]); b.maxX = Math.max(b.maxX, b.p[v]); b.minZ = Math.min(b.minZ, b.p[v + 1]); b.maxZ = Math.max(b.maxZ, b.p[v + 1]); }
          if (b.maxX - b.minX < 3 || b.maxZ - b.minZ < 3) { b.gone = true; b.hide = true; return false; } // squeezed to nothing
          any = true;
        }
      }
      return any;
    };
    const check = (b: Bld, roads: Road[]) => {
      let settled = false;
      for (let i = 0; i < 4 && !b.gone; i++) if (!pass(b, i ? roadsNear(b) : roads)) { settled = true; break; }
      if (!settled && !b.gone) pass(b, roadsNear(b), false); // caught between two roads' pavements: it stays, unless a road now runs through it
    };
    // the later passes look at every loaded road near the building, not just the ones being added
    // roads by 100 m cell, built once per call, so a building finds its neighbours without scanning them all
    const cells = new Map<number, Road[]>(), C = 100;
    for (const t of all) for (const r of t.roads) {
      if (r.bridge || r.kind > KIND.residential) continue;
      for (let gx = Math.floor((r.minX - 20) / C); gx <= Math.floor((r.maxX + 20) / C); gx++)
        for (let gz = Math.floor((r.minZ - 20) / C); gz <= Math.floor((r.maxZ + 20) / C); gz++) {
          const k = gkey(gx, gz); (cells.get(k) ?? cells.set(k, []).get(k)!).push(r);
        }
    }
    const roadsNear = (b: Bld) => {
      const out = new Set<Road>();
      for (let gx = Math.floor(b.minX / C); gx <= Math.floor(b.maxX / C); gx++)
        for (let gz = Math.floor(b.minZ / C); gz <= Math.floor(b.maxZ / C); gz++) for (const r of cells.get(gkey(gx, gz)) ?? []) out.add(r);
      return [...out];
    };
    // (a long street is kept by whichever tile loaded first, which may be far off: so every loaded tile is checked)
    // (a building can reach well past its own tile, so each tile's reach is taken from its buildings)
    const reach = (t: Tile) => { let a = t.tx * TILE, b = (t.tx + 1) * TILE, c = t.tz * TILE, d = (t.tz + 1) * TILE; for (const q of t.blds) { a = Math.min(a, q.minX); b = Math.max(b, q.maxX); c = Math.min(c, q.minZ); d = Math.max(d, q.maxZ); } return [a - 12, b + 12, c - 12, d + 12]; };
    const over = (t: Tile) => { const [a, b, c, d] = reach(t); return (r: Road) => r.maxX > a && r.minX < b && r.maxZ > c && r.minZ < d; };
    const mine = over(tile), here: Road[] = [];
    for (const t of all) for (const r of t.roads) if (mine(r)) here.push(r);
    for (const b of tile.blds) check(b, here);
    for (const t of all) {
      if (t === tile) continue;
      const theirs = tile.roads.filter(over(t));
      if (theirs.length) for (const b of t.blds) check(b, theirs);
    }
  }

  private blockedIn(t: Tile, x: number, z: number, pad: number) {
    for (const g of [gkey(Math.floor((x - pad) / GRID), Math.floor((z - pad) / GRID)), gkey(Math.floor((x + pad) / GRID), Math.floor((z + pad) / GRID))]) {
      for (const b of t.grid.get(g) ?? []) {
        if (b.gone || x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) continue;
        if (inPoly(b.p, x, z) || inPoly(b.p, x + pad, z) || inPoly(b.p, x - pad, z) || inPoly(b.p, x, z + pad) || inPoly(b.p, x, z - pad)) return true;
      }
    }
    return false;
  }

  /** Is (x, z) inside a building (with [pad] metres to spare)? */
  blocked(x: number, z: number, pad = 0.4) {
    const t = this.tiles.get(`${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`);
    return t ? this.blockedIn(t, x, z, pad) : false;
  }

  /** The nearest road point to (x, z) among loaded tiles, up to [max] metres away. */
  nearestRoad(x: number, z: number, max = 120, maxKind = KIND.residential) {
    let best: { r: Road; s: number; d: number; x: number; z: number } | null = null;
    for (const t of this.tiles.values()) for (const r of t.roads) {
      if (r.kind > maxKind || r.bridge) continue;
      if (x < r.minX - max || x > r.maxX + max || z < r.minZ - max || z > r.maxZ + max) continue;
      for (let i = 1; i < r.cum.length; i++) {
        const x0 = r.p[i * 2 - 2], z0 = r.p[i * 2 - 1], x1 = r.p[i * 2], z1 = r.p[i * 2 + 1];
        const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
        const px = x0 + dx * u, pz = z0 + dz * u, d = Math.hypot(px - x, pz - z);
        if (d < max && (!best || d < best.d)) best = { r, s: r.cum[i - 1] + Math.sqrt(L2) * u, d, x: px, z: pz };
      }
    }
    return best;
  }

  roadsNear(x: number, z: number, radius: number, maxKind: number) {
    const out: Road[] = [];
    for (const t of this.tiles.values()) for (const r of t.roads) {
      if (r.kind <= maxKind && !r.bridge && r.len > 40 && r.maxX > x - radius && r.minX < x + radius && r.maxZ > z - radius && r.minZ < z + radius) out.push(r);
    }
    return out;
  }
}
