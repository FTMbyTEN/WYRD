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
  /** under a landmark's picture: not drawn (still solid) */ hide?: boolean };
export type Water = { p: Float32Array; ribbon: number }; // ribbon > 0: a river of that width (m); 0: an area
export type Prop = { s: string; x: number; z: number };
export type Tile = { key: string; tx: number; tz: number; roads: Road[]; blds: Bld[]; water: Water[]; rail: Float32Array[]; props: Prop[]; grid: Map<number, Bld[]>; used: number };

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
    }
  }

  private async load(key: string) {
    try {
      const raw = (await fetch(`${BASE}/${key}.json`).then((r) => r.json())) as Raw;
      this.tiles.set(key, this.parse(key, raw));
    } catch { this.loading.delete(key); }
  }

  private parse(key: string, d: Raw): Tile {
    const ox = d.x * TILE, oz = d.z * TILE;
    const roads: Road[] = [];
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
      const owner = this.owners.get(sig);
      if (owner && owner !== key) continue;
      this.owners.set(sig, key);
      const cum = lengths(p);
      roads.push({ kind, w: w10 / 10, bridge: !!bridge, name: nameI >= 0 ? d.names[nameI] : null, oneway: !!oneway, p, cum, len: cum[cum.length - 1], minX, maxX, minZ, maxZ });
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

    const tile: Tile = { key, tx: d.x, tz: d.z, roads, blds, water, rail, props: [], grid, used: performance.now() };
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

  private blockedIn(t: Tile, x: number, z: number, pad: number) {
    for (const g of [gkey(Math.floor((x - pad) / GRID), Math.floor((z - pad) / GRID)), gkey(Math.floor((x + pad) / GRID), Math.floor((z + pad) / GRID))]) {
      for (const b of t.grid.get(g) ?? []) {
        if (x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) continue;
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
