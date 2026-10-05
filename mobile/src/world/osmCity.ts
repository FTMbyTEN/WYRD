import * as THREE from 'three';
import { facadeMaterial } from './facade';
import { wornAsphalt } from './ojuelegba';
import { holoBoards, holoMaterial } from './neon';
import { buildTower, formFor } from './towers';
import { AWNING_COLORS, CAR_COLORS, GOODS_COLORS, KIOSK_COLORS, LEAF_COLORS, PREFABS, UMBRELLA_COLORS, place } from './props';

/**
 * The real Lagos, from OpenStreetMap tiles (scripts/osm-world.mjs): every street at its real width,
 * bridges raised on columns, every building footprint extruded to its height and dressed by the
 * facade shader, water and rail.
 *
 * Lightweight by design:
 *  - The download is the compact map (~18 KB a tile gzipped); geometry is built here, a few
 *    milliseconds per frame (pump), so streaming never stutters.
 *  - Light is baked into vertex colours as tiles are built: walls darken towards the street (sky
 *    occlusion), crowded buildings are darker, roads darken at their kerbs, and every building
 *    sits in a soft contact shadow. The city looks shaded with real shadows switched off.
 *  - Two levels of detail: near tiles in full; far tiles only simplified buildings and main roads.
 *    Each tile is a handful of draw calls (all its buildings are one mesh).
 *
 * Also the city's physics and paths: collisions against real footprints, a camera test, and the
 * road network (with heights over bridges) for traffic and walkers.
 *
 * NAIJA 2099: the real footprints, raised into a neon Lagos -- the larger plots become megatowers
 * with stepped crowns, antennae and beacons; rooftops carry holographic billboards; roads get
 * neon lane lines and kerb strips (all unlit and instanced, so they glow without extra lights).
 *
 * Map data © OpenStreetMap contributors (ODbL).
 */
export type Road = {
  kind: number; width: number; bridge: number; name: string | null; oneway: boolean;
  pts: THREE.Vector2[]; len: number; cum: number[]; sig: string;
};
/** A street passing through a junction node: [s] metres along it; whether the node is its start or end. */
export type Junction = { road: Road; s: number; atStart: boolean; atEnd: boolean };
type Poly = { pts: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number; h: number; y0?: number };
type TileData = { x: number; z: number; names: string[]; roads: number[][]; buildings: number[][]; water: number[][]; rail: number[][] };
type Level = 'near' | 'far';
type Tile = { key: string; level: Level; group: THREE.Group; roads: Road[]; polys: Poly[] };

export const KIND = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, link: 5, residential: 6, service: 7, foot: 8 };
// the paint of Lagos houses: cream, peach, sky blue, mint, pink, yellow, lilac, terracotta, faded white, green
const PAINT = [0xe9dcc0, 0xe8b796, 0x9cc3d9, 0xa9cfb4, 0xe2a8a8, 0xe9cf73, 0xbcaed0, 0xc98a64, 0xdcd6cc, 0x7fae8a, 0xf0e6d2, 0xd7c08f];
const RAW = [0x8d8a83, 0x9a958c, 0x85827b];
const OFFICE = [0xc8ccd0, 0xd9d6cf, 0xb9bec4];
const TILED = [0xe8e4dc, 0x9a6a52, 0xd8d0c4];
/** A building's type, from its size and a seed: 0 shop-house, 1 bungalow, 2 unfinished block, 3 office, 4 tiled front. */
function styleOf(lv: number, area: number, seed: number) {
  if (lv >= 4 || area > 900) return seed < 0.6 ? 3 : 4;
  if (lv <= 1 && area < 260) return seed < 0.15 ? 2 : 1;
  if (seed < 0.12) return 2;
  if (seed < 0.2) return 4;
  return 0;
}
// road tone by kind: expressways dark and fresh, side streets dusty and pale
const ROAD_TONE = [0.78, 0.8, 0.86, 0.9, 0.94, 0.86, 1.0, 1.04, 1.1];
export const GROUND_HEX = 0x5e4434; // Lagos laterite: red-brown earth
const BASE = 'world/v1';
const CELL = 20;

export class OsmCity {
  index: { origin: { lat: number; lon: number }; tile: number; attribution: string; tiles: string[] } | null = null;
  tiles = new Map<string, Tile>();
  near = 1;
  far = 2;
  private data = new Map<string, TileData>();
  private fetching = new Set<string>();
  private building = new Set<string>(); // "key:level" being built
  private jobs: Generator<void, void, void>[] = [];
  private cells = new Map<string, Poly[]>();
  private sigs = new Map<string, string>(); // road signature -> owning tile (a way crossing tiles comes in each)
  // every vertex of every street: OSM streets meet at shared nodes, usually partway along one of them
  private nodes = new Map<string, Junction[]>();
  private wallMat = facadeMaterial({ tint: 0x33404c });
  private asphalt: THREE.MeshStandardMaterial;
  private lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  private beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false });
  private antennaMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.8, roughness: 0.4 });
  private beaconGeo = new THREE.SphereGeometry(0.45, 5, 3);
  private antennaGeo = new THREE.CylinderGeometry(0.08, 0.25, 1, 6).translate(0, 0.5, 0);
  /** beacons blink: the app calls this each frame */
  blink(now: number) { this.beaconMat.color.setHex(Math.sin(now / 420) > 0 ? 0xff2a3a : 0x3a0608); holoMaterial().uniforms.uTime.value = now / 1000; }
  private bridgeMat = new THREE.MeshStandardMaterial({ color: 0xc4beb2, roughness: 0.95, vertexColors: true });
  // street life: awnings, balconies, tanks, trees, stalls, parked vehicles (one merged mesh per tile)
  private propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  /** how much street life to place: 1 = full, 0.5 on low-end devices */
  propDensity = 1;
  private aoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  private waterMat = new THREE.MeshStandardMaterial({ color: 0x3d6b6a, roughness: 0.15, metalness: 0.3 });
  private railMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.9, vertexColors: true });
  private poleMat = new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.5, roughness: 0.5 });
  readonly bulbMat = new THREE.MeshStandardMaterial({ color: 0xffeac0, emissive: 0xffd28a, emissiveIntensity: 0 });
  private poleGeo = new THREE.CylinderGeometry(0.08, 0.11, 6, 4, 1, true).translate(0, 3, 0);
  /** the pool of light under each street lamp: additive, black at the rim, faded in by night */
  readonly poolMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private poolGeo = (() => {
    const g = new THREE.CircleGeometry(9, 12).rotateX(-Math.PI / 2).translate(0, 0.08, 0);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = Math.hypot(g.attributes.position.getX(i), g.attributes.position.getZ(i)) / 9, k = r < 0.01 ? 1 : 0; col.set([1 * k, 0.72 * k, 0.4 * k], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  })();
  private bulbGeo = new THREE.OctahedronGeometry(0.32, 0).translate(0, 6.1, 0); // a glowing dot: 8 triangles
  readonly ready: Promise<void>;

  constructor(private scene: THREE.Scene, private shadows: boolean) {
    this.asphalt = new THREE.MeshStandardMaterial({ map: wornAsphalt(), roughness: 0.5, metalness: 0.25, vertexColors: true });
    this.wallMat.vertexColors = true;
    this.ready = fetch(`${BASE}/index.json`).then((r) => r.json()).then((j) => { this.index = j; });
  }

  setShadows(on: boolean) {
    this.shadows = on;
    for (const t of this.tiles.values()) t.group.traverse((o) => { if ((o as THREE.Mesh).userData.caster) o.castShadow = on; });
  }

  /** Decide which tiles should be near, far or gone around [x, z]. Cheap: call twice a second. */
  update(x: number, z: number) {
    if (!this.index) return;
    const T = this.index.tile, tx = Math.floor(x / T), tz = Math.floor(z / T);
    const want: [string, Level, number][] = [];
    for (let i = -this.far; i <= this.far; i++) for (let j = -this.far; j <= this.far; j++) {
      const key = `${tx + i}_${tz + j}`;
      if (!this.index.tiles.includes(key)) continue;
      want.push([key, Math.max(Math.abs(i), Math.abs(j)) <= this.near ? 'near' : 'far', i * i + j * j]);
    }
    want.sort((a, b) => a[2] - b[2]); // nearest first
    for (const [key, level] of want) {
      const have = this.tiles.get(key);
      if (have?.level === level || this.building.has(`${key}:${level}`)) continue;
      const d = this.data.get(key);
      if (!d) { void this.fetchTile(key); continue; }
      this.building.add(`${key}:${level}`);
      this.jobs.push(this.build(key, d, level));
    }
    for (const [key, t] of this.tiles) {
      const [kx, kz] = key.split('_').map(Number);
      if (Math.max(Math.abs(kx - tx), Math.abs(kz - tz)) > this.far + 1) { this.unload(t); this.data.delete(key); }
    }
  }

  /** Builds geometry for up to [ms] milliseconds. Call every frame. */
  pump(ms: number) {
    const end = performance.now() + ms;
    while (this.jobs.length && performance.now() < end) {
      if (this.jobs[0].next().done) this.jobs.shift();
    }
  }

  get busy() { return this.jobs.length > 0 || this.fetching.size > 0; }

  /** Every road currently loaded (each real street once). */
  roads(): Road[] { const out: Road[] = []; for (const t of this.tiles.values()) out.push(...t.roads); return out; }

  /** The other streets meeting the end of [road] (its start when atStart), with where along them. */
  linksAt(road: Road, atStart: boolean) {
    const p = atStart ? road.pts[0] : road.pts[road.pts.length - 1];
    return (this.nodes.get(endKey(p)) ?? []).filter((l) => l.road !== road);
  }

  /** Pushes a circle (radius r, at p) out of any building it overlaps. */
  collide(p: THREE.Vector3, r: number) {
    for (const poly of this.cells.get(cellKey(p.x, p.z)) ?? []) {
      if (p.x < poly.minX - r || p.x > poly.maxX + r || p.z < poly.minZ - r || p.z > poly.maxZ + r || p.y > poly.h || p.y + 1.8 < (poly.y0 ?? 0)) continue;
      const pts = poly.pts, n = pts.length / 2;
      let inside = false, best = Infinity, bx = 0, bz = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[i * 2], zi = pts[i * 2 + 1], xj = pts[j * 2], zj = pts[j * 2 + 1];
        if ((zi > p.z) !== (zj > p.z) && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
        const ex = xj - xi, ez = zj - zi, l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((p.x - xi) * ex + (p.z - zi) * ez) / l2));
        const cx = xi + ex * t, cz = zi + ez * t, d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
        if (d < best) { best = d; bx = cx; bz = cz; }
      }
      const dist = Math.sqrt(best);
      if (!inside && dist >= r) continue;
      let nx = p.x - bx, nz = p.z - bz;
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      if (inside) { nx = -nx; nz = -nz; }
      const push = inside ? dist + r : r - dist;
      p.x += nx * push; p.z += nz * push;
    }
    return p;
  }

  /** The highest roof (or skybridge deck) under a point that's no higher than [maxY]: 0 for the street. */
  floorAt(x: number, z: number, maxY = Infinity) {
    let best = 0;
    for (const poly of this.cells.get(cellKey(x, z)) ?? []) {
      if (poly.h > maxY || poly.h <= best || x < poly.minX || x > poly.maxX || z < poly.minZ || z > poly.maxZ) continue;
      if (insidePoly(poly.pts, x, z)) best = poly.h;
    }
    return best;
  }

  /** Is there a building at this point? (keeps the camera out of walls) */
  solidAt(x: number, y: number, z: number) {
    for (const poly of this.cells.get(cellKey(x, z)) ?? []) {
      if (y > poly.h || y < (poly.y0 ?? 0) || x < poly.minX || x > poly.maxX || z < poly.minZ || z > poly.maxZ) continue;
      if (insidePoly(poly.pts, x, z)) return true;
    }
    return false;
  }

  /** The nearest loaded road to a point, how far along it, and the distance. */
  nearestRoad(x: number, z: number, filter?: (r: Road) => boolean) {
    let best: { road: Road; s: number; d: number } | null = null;
    const p = new THREE.Vector2(x, z);
    for (const r of this.roads()) {
      if (filter && !filter(r)) continue;
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i], e = b.clone().sub(a), l2 = e.lengthSq() || 1;
        const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(e) / l2));
        const d = a.clone().addScaledVector(e, t).distanceTo(p);
        if (!best || d < best.d) best = { road: r, s: r.cum[i - 1] + t * Math.sqrt(l2), d };
      }
    }
    return best;
  }

  private async fetchTile(key: string) {
    if (this.fetching.has(key)) return;
    this.fetching.add(key);
    try {
      this.data.set(key, await fetch(`${BASE}/${key}.json`).then((r) => r.json()));
    } catch (e) {
      console.warn('[city] tile failed', key, e);
    } finally {
      this.fetching.delete(key);
    }
  }

  private unload(t: Tile) {
    this.scene.remove(t.group);
    t.group.traverse((o) => { if (!(o instanceof THREE.InstancedMesh)) (o as THREE.Mesh).geometry?.dispose(); });
    for (const poly of t.polys) eachCell(poly, (k) => { const list = this.cells.get(k); if (list) { const i = list.indexOf(poly); if (i >= 0) list.splice(i, 1); } });
    for (const r of t.roads) {
      this.sigs.delete(r.sig);
      for (const pt of r.pts) {
        const k = endKey(pt), list = this.nodes.get(k);
        if (list) { const rest = list.filter((l) => l.road !== r); if (rest.length) this.nodes.set(k, rest); else this.nodes.delete(k); }
      }
    }
    if (this.tiles.get(t.key) === t) this.tiles.delete(t.key);
  }

  private *build(key: string, d: TileData, level: Level): Generator<void, void, void> {
    const T = this.index!.tile, ox = d.x * T, oz = d.z * T;
    const full = level === 'near';
    const group = new THREE.Group();
    const roads: Road[] = [], polys: Poly[] = [];
    // each material's geometry is written straight into one growing buffer: nothing to merge at the end
    const roadB = new Batch(), lineB = new Batch(), bridgeB = new Batch(), aoB = new Batch();
    const lamps: THREE.Matrix4[] = [];
    const poolB = new Batch();

    // ---- roads ----
    let nr = 0;
    for (const r of d.roads) {
      if (++nr % 20 === 0) yield;
      const [kind, w10, bridge, nameI, oneway] = r;
      if (!full && kind > KIND.tertiary) continue;
      const pts: THREE.Vector2[] = [];
      for (let i = 5; i + 1 < r.length; i += 2) pts.push(new THREE.Vector2(r[i] / 10 + ox, r[i + 1] / 10 + oz));
      if (pts.length < 2) continue;
      const cum = lengths(pts), len = cum[cum.length - 1], width = w10 / 10;
      const sig = `${Math.round(pts[0].x)},${Math.round(pts[0].y)},${Math.round(pts[pts.length - 1].x)},${Math.round(pts[pts.length - 1].y)},${pts.length}`;
      const owner = this.sigs.get(sig);
      if (owner && owner !== key) continue; // the neighbouring tile already has this street
      const road: Road = { kind, width, bridge, name: nameI >= 0 ? d.names[nameI] : null, oneway: !!oneway, pts, len, cum, sig };
      if (full) roads.push(road);
      if (kind === KIND.foot && !bridge) continue; // footpaths: walked, not drawn
      const y = (s: number) => roadY(road, s);
      roadB.add(ribbon(pts, cum, width, y, ROAD_TONE[kind], full ? 0.7 : 0.8));
      // the dusty shoulder either side: red earth, scuffed paler where people walk
      if (full && !bridge && kind <= KIND.service) aoB.add(shoulder(pts, cum, width + (kind <= KIND.tertiary ? 5 : 3)));
      if (!full) continue;
      if (kind <= KIND.tertiary && width >= 8) dashes(lineB, pts, cum, y);
      if (kind <= KIND.secondary) for (const side of [-1, 1]) {
        const off = offset(pts, side * (width / 2 - 0.25));
        const strip = thinRibbon(off, (s) => y(s) + 0.015, 0.14);
        const sc = strip.attributes.color as THREE.BufferAttribute;
        for (let i = 0; i < sc.count; i++) sc.setXYZ(i, 1.0, 0.12, 0.75);
        lineB.add(strip);
      }
      if (kind <= KIND.tertiary && !bridge) for (let s = 12; s < len - 6; s += 36) {
        const p = pointAt(road, s), dir = dirAt(road, s);
        lamps.push(new THREE.Matrix4().makeTranslation(p.x - dir.y * (width / 2 + 0.6), 0, p.y + dir.x * (width / 2 + 0.6)));
      }
      if (bridge) {
        bridgeB.add(ribbon(pts, cum, width + 0.6, (s) => y(s) - 0.6, 0.82, 0.6));
        for (let s = 30; s < len - 30; s += 18) {
          const p = pointAt(road, s), dir = dirAt(road, s), h = y(s) - 0.6;
          const g = tone(new THREE.BoxGeometry(1.2, h, Math.min(width * 0.8, 10)).translate(0, h / 2, 0), 0.75);
          g.rotateY(Math.atan2(dir.x, dir.y) + Math.PI / 2).translate(p.x, 0, p.y);
          bridgeB.add(g);
        }
        for (const side of [-1, 1]) {
          const off = offset(pts, side * (width / 2 + 0.15));
          bridgeB.add(ribbon(off, lengths(off), 0.3, (s) => y(s) + 0.5, 0.9, 1));
        }
      }
    }
    yield;

    // ---- buildings, with how crowded each is (neighbours within 14 m) ----
    const blds = d.buildings.map((b) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 1; i + 1 < b.length; i += 2) pts.push(new THREE.Vector2(b[i] / 10 + ox, b[i + 1] / 10 + oz));
      const c = pts.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(pts.length);
      return { lv: b[0], pts, c, area: Math.abs(signedArea(pts)) };
    });
    const near = new Map<string, typeof blds>();
    for (const b of blds) { const k = `${Math.floor(b.c.x / 14)}_${Math.floor(b.c.y / 14)}`; (near.get(k) ?? near.set(k, []).get(k)!).push(b); }
    const propB = new Batch();
    const dens = this.propDensity;
    let rs = (d.x * 7919 + d.z * 104729) >>> 0;
    const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
    const street = new Map<string, { x: number; z: number; hw: number }[]>();
    if (full) for (const r of roads) {
      if (r.kind > KIND.service || r.bridge) continue;
      for (let s = 0; s <= r.len; s += 3) {
        const p = pointAt(r, s), k = `${Math.floor(p.x / 6)}_${Math.floor(p.y / 6)}`;
        (street.get(k) ?? street.set(k, []).get(k)!).push({ x: p.x, z: p.y, hw: r.width / 2 });
      }
    }
    /** how far a point is from the nearest street's kerb (negative: on the road) */
    const kerbDist = (x: number, z: number) => {
      let best = 99;
      const gx = Math.floor(x / 6), gz = Math.floor(z / 6);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of street.get(`${gx + i}_${gz + j}`) ?? []) best = Math.min(best, Math.hypot(s.x - x, s.z - z) - s.hw);
      return best;
    };
    const bldB = new Batch();
    const tops: { x: number; y: number; z: number; h: number }[] = [];
    const towerList: { c: THREE.Vector2; top: number; body: number; r: number; style: number; seed: number; wall: number }[] = [];
    const boards: { x: number; y: number; z: number; angle: number; w: number }[] = [];
    let n = 0;
    for (let bi = 0; bi < blds.length; bi++) {
      const b = blds[bi];
      const seed = fract(Math.sin(b.c.x * 12.9898 + b.c.y * 78.233) * 43758.5453);
      // NAIJA 2099 is a city of towers: small plots mostly cleared (sheds gone, half the houses gone),
      // and any decent plot may carry a tower -- the larger, the likelier and the taller
      if (b.area < 60) continue;
      const tower = (b.area > 260 && seed > 0.22) || (b.area > 160 && seed > 0.62);
      if (!tower && b.area < 320 && fract(seed * 3.3) < 0.5) continue;
      if (!full && !tower && b.area < 200) continue;
      let crowd = 0;
      const gx = Math.floor(b.c.x / 14), gz = Math.floor(b.c.y / 14);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of near.get(`${gx + i}_${gz + j}`) ?? []) if (o !== b && o.c.distanceTo(b.c) < 14) crowd++;
      let style = styleOf(b.lv, b.area, seed);
      const lv = tower ? b.lv + Math.round(8 + Math.min(40, b.area / 45) * fract(seed * 5.1)) : style === 1 ? 1 : b.lv;
      const h = lv * (2.9 + 0.55 * seed) + 0.4;
      if (tower) style = seed > 0.95 ? 4 : 3; // Adire panels: a rare accent now
      const palette = style === 2 ? RAW : style === 3 ? OFFICE : style === 4 ? TILED : PAINT;
      const wall = palette[Math.floor(fract(seed * 13.1) * palette.length)];
      const tiers: { pts: THREE.Vector2[]; y0: number; h: number }[] = [];
      try {
        const pts = full ? b.pts : simplify(b.pts, 1.5);
        let topY = h, bodyH = h;
        if (tower) {
          // a tower in a real Lagos form (cylinder, tapering glass, curved glass with fins, white
          // residential, twins), fitted inside its plot
          const T = buildTower(formFor(seed, b.area), b.c, Math.sqrt(b.area) * 0.5 * 0.92, h * 1.1, seed);
          for (const g of T.pieces) bldB.add(g);
          tiers.push({ pts: T.ring, y0: 0, h: T.top });
          topY = T.top; bodyH = T.top * 0.8;
          if (full) towerList.push({ c: b.c.clone(), top: topY, body: bodyH, r: Math.sqrt(b.area) * 0.45, style, seed, wall });
        } else {
          bldB.add(building(pts, h, wall, Math.min(1, crowd / 8), style, seed));
          tiers.push({ pts: b.pts, y0: 0, h });
        }
        if (full && topY > 16) {
          tops.push({ x: b.c.x, y: topY, z: b.c.y, h: 4 + 10 * fract(seed * 2.3) });
          if (fract(seed * 6.7) > 0.45) boards.push({ x: b.c.x, y: topY + 4.5, z: b.c.y, angle: Math.floor(fract(seed * 8.9) * 4) * (Math.PI / 2), w: Math.min(26, 10 + Math.sqrt(b.area) * 0.4) });
        } else if (full && topY > 9 && fract(seed * 6.7) > 0.8) {
          boards.push({ x: b.c.x, y: topY + 3, z: b.c.y, angle: Math.floor(fract(seed * 8.9) * 4) * (Math.PI / 2), w: 9 });
        }
        // bungalows and some small houses wear a hipped zinc roof
        const hipped = full && !tower && (style === 1 || (style === 0 && lv <= 2 && b.area < 140 && seed > 0.55)) && pts.length <= 8;
        if (hipped) bldB.add(hipRoof(pts, h, b.c, style, seed));
        // ---- street life round this building ----
        if (full && dens > 0) {
          const balconies = !tower && lv >= 2 && lv <= 6 && fract(seed * 9.1) > 0.45;
          for (let i = 0; i < b.pts.length; i++) {
            const a = b.pts[i], bb = b.pts[(i + 1) % b.pts.length];
            const len = a.distanceTo(bb);
            if (len < 3) continue;
            const mid = a.clone().add(bb).multiplyScalar(0.5);
            const t = bb.clone().sub(a).normalize();
            let n = new THREE.Vector2(-t.y, t.x);
            if (n.dot(mid.clone().sub(b.c)) < 0) n = n.negate(); // outward
            const kd = kerbDist(mid.x + n.x * 2, mid.y + n.y * 2);
            if (kd > 3.5) continue; // not a street front
            const yaw = Math.atan2(n.x, n.y), w = Math.min(len * 0.85, 9);
            if (!tower && lv <= 4 && rnd() < 0.85 * dens) {
              const ac = AWNING_COLORS[Math.floor(rnd() * AWNING_COLORS.length)];
              for (const g of place(PREFABS.awning, mid.x, 2.75, mid.y, yaw, [w, 1, 1], ac, ac, 0.28)) propB.add(g);
            }
            if (balconies && len > 4) for (let f = 1; f < lv; f++) {
              if (rnd() > 0.75 * dens) continue;
              for (const g of place(PREFABS.balcony, mid.x, f * (2.9 + 0.55 * seed) + 0.05, mid.y, yaw, [Math.min(len * 0.7, 6), 1, 1])) propB.add(g);
            }
            // on the pavement in front: a stall, or a container kiosk
            if (!tower && kd > 0.5 && kd < 3.2 && rnd() < 0.3 * dens) {
              const sx = mid.x + n.x * Math.min(2.4, kd + 0.6), sz = mid.y + n.y * Math.min(2.4, kd + 0.6);
              if (rnd() < 0.8) for (const g of place(PREFABS.stall, sx, 0.05, sz, yaw, [1, 1, 1], UMBRELLA_COLORS[Math.floor(rnd() * UMBRELLA_COLORS.length)], GOODS_COLORS[Math.floor(rnd() * GOODS_COLORS.length)])) propB.add(g);
              else for (const g of place(PREFABS.kiosk, sx, 0.05, sz, yaw + Math.PI, [1, 1, 1], KIOSK_COLORS[Math.floor(rnd() * KIOSK_COLORS.length)], 0xf2eee2)) propB.add(g);
            }
          }
          // the roof: a black water tank, solar panels, a dish (not on hipped roofs or towers)
          if (!tower && !hipped && lv <= 6) {
            const r0 = Math.sqrt(b.area) * 0.22;
            const spot = () => { const a = rnd() * Math.PI * 2, rr = rnd() * r0; return [b.c.x + Math.cos(a) * rr, b.c.y + Math.sin(a) * rr] as const; };
            if (rnd() < 0.75 * dens) { const [x, z] = spot(); for (const g of place(PREFABS.tank, x, h + 0.12, z, rnd() * 6)) propB.add(g); }
            if (rnd() < 0.5 * dens) { const [x, z] = spot(); for (const g of place(PREFABS.solar, x, h, z, rnd() * 6)) propB.add(g); }
            if (rnd() < 0.3 * dens) { const [x, z] = spot(); for (const g of place(PREFABS.dish, x, h, z, rnd() * 6)) propB.add(g); }
          }
        }
        if (full) aoB.add(skirt(b.pts));
      } catch { /* a broken footprint: skip it */ }
      if (full) for (const t of tiers) {
        const flat = new Float32Array(t.pts.length * 2);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        t.pts.forEach((p, i) => { flat[i * 2] = p.x; flat[i * 2 + 1] = p.y; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y); });
        polys.push({ pts: flat, minX, maxX, minZ, maxZ, h: t.h, y0: t.y0 > 0 ? t.y0 - 0.5 : 0 });
      }
      if (++n % 15 === 0) yield;
    }

    // ---- along the streets: shade trees and palms, parked hover-danfos and cars ----
    if (full && dens > 0) {
      const onBuilding = (x: number, z: number) => {
        const gx = Math.floor(x / 14), gz = Math.floor(z / 14);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of near.get(`${gx + i}_${gz + j}`) ?? []) if (insideRing(o.pts, x, z)) return true;
        return false;
      };
      for (const r of roads) {
        if (r.bridge || r.kind < KIND.secondary || r.kind > KIND.residential) continue;
        let side = 1;
        for (let s = 8 + rnd() * 10; s < r.len - 6; s += 18 + rnd() * 16) {
          side = -side;
          const p = pointAt(r, s), dir = dirAt(r, s), nx = -dir.y * side, nz = dir.x * side;
          if (rnd() < 0.55 * dens) {
            const off = r.width / 2 + 1.6 + rnd() * 1.2, x = p.x + nx * off, z = p.y + nz * off;
            if (!onBuilding(x, z) && kerbDist(x, z) > 0.8) {
              const palm = rnd() < 0.35, k = 0.8 + rnd() * 0.5;
              for (const g of place(palm ? PREFABS.palm : PREFABS.almond, x, 0, z, rnd() * 6, [k, k, k], LEAF_COLORS[Math.floor(rnd() * 4)], LEAF_COLORS[Math.floor(rnd() * 4)])) propB.add(g);
            }
          }
          if (rnd() < 0.32 * dens && r.width >= 6) {
            const off = r.width / 2 - 1.3, x = p.x + nx * off, z = p.y + nz * off;
            const danfo = rnd() < 0.4;
            for (const g of place(danfo ? PREFABS.danfo : PREFABS.car, x, 0.25, z, Math.atan2(dir.x, dir.y) + (rnd() < 0.5 ? Math.PI : 0), [1, 1, 1], CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)])) propB.add(g);
          }
        }
        if (++n % 20 === 0) yield;
      }
    }

    // ---- skybridges: towers near each other joined high up, walkable decks with neon under them ----
    if (full) {
      const done = new Set<string>();
      towerList.forEach((a, ai) => {
        let best = -1, bd = Infinity;
        towerList.forEach((o, oi) => {
          if (oi === ai) return;
          const d = a.c.distanceTo(o.c);
          if (d > a.r + o.r + 6 && d < 95 && d < bd) { bd = d; best = oi; }
        });
        if (best < 0) return;
        const key = ai < best ? `${ai}-${best}` : `${best}-${ai}`;
        if (done.has(key)) return;
        done.add(key);
        const o = towerList[best];
        const deckY = Math.min(a.body, o.body) * (0.55 + 0.25 * fract(a.seed * 9.7));
        const dir = o.c.clone().sub(a.c).normalize(), side = new THREE.Vector2(-dir.y, dir.x);
        const p0 = a.c.clone().addScaledVector(dir, a.r * 0.6), p1 = o.c.clone().addScaledVector(dir, -o.r * 0.6);
        const w = 3.2, bh = 3.6;
        const foot = [p0.clone().addScaledVector(side, w), p1.clone().addScaledVector(side, w), p1.clone().addScaledVector(side, -w), p0.clone().addScaledVector(side, -w)];
        const g = building(foot, bh, a.wall, 0, 3, a.seed);
        g.translate(0, deckY, 0);
        const cu = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < cu.count; i++) cu.setX(i, 3 + 10 * Math.round(deckY + bh));
        bldB.add(g);
        // a neon strip under the deck, seen from the street
        const under = ribbon([p0, p1], [0, p0.distanceTo(p1)], 1.0, () => deckY - 0.05, 1, 1);
        const uc = under.attributes.color as THREE.BufferAttribute;
        for (let i = 0; i < uc.count; i++) uc.setXYZ(i, 0, 0.9, 1);
        lineB.add(under);
        const flat = new Float32Array(foot.flatMap((p) => [p.x, p.y]));
        polys.push({ pts: flat, minX: Math.min(...foot.map((p) => p.x)), maxX: Math.max(...foot.map((p) => p.x)), minZ: Math.min(...foot.map((p) => p.y)), maxZ: Math.max(...foot.map((p) => p.y)), h: deckY + bh, y0: deckY - 0.2 });
      });
    }

    // ---- water and rail ----
    const waterB = new Batch(), railB = new Batch();
    if (full) {
      for (const w of d.water) {
        if (w.length % 2 === 1) {
          const pts: THREE.Vector2[] = [];
          for (let i = 1; i + 1 < w.length; i += 2) pts.push(new THREE.Vector2(w[i] / 10 + ox, w[i + 1] / 10 + oz));
          if (pts.length >= 2) waterB.add(ribbon(pts, lengths(pts), w[0] / 10, () => 0.03, 1, 1));
        } else {
          const pts: THREE.Vector2[] = [];
          for (let i = 0; i + 1 < w.length; i += 2) pts.push(new THREE.Vector2(w[i] / 10 + ox, -(w[i + 1] / 10 + oz)));
          if (pts.length >= 3) waterB.add(tone(new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 1));
        }
      }
      for (const r of d.rail) {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i + 1 < r.length; i += 2) pts.push(new THREE.Vector2(r[i] / 10 + ox, r[i + 1] / 10 + oz));
        if (pts.length >= 2) railB.add(ribbon(pts, lengths(pts), 3.2, () => 0.05, 1, 0.6));
      }
    }
    yield;

    // ---- merge: a few draw calls for the whole tile ----
    const add = (b: Batch, mat: THREE.Material, cast: boolean) => {
      if (b.empty) return;
      const m = new THREE.Mesh(b.geometry(), mat);
      m.userData.caster = cast;
      m.castShadow = cast && this.shadows;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      group.add(m);
    };
    add(roadB, this.asphalt, false);
    add(aoB, this.aoMat, false);
    yield;
    add(bldB, this.wallMat, true);
    add(propB, this.propMat, true);
    for (const t of tops) bridgeB.add(tone(this.antennaGeo.clone().scale(1, t.h, 1).translate(t.x, t.y, t.z), 0.25));
    const onRoad = (x: number, z: number) => roads.some((r) => r.kind !== KIND.foot && r.pts.some((a, i) => {
      const b = r.pts[i + 1];
      if (!b) return false;
      const dx = b.x - a.x, dz = b.y - a.y, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / L));
      return Math.hypot(a.x + dx * t - x, a.y + dz * t - z) < r.width / 2 + 0.4;
    }));
    for (const m4 of lamps.filter((m) => !onRoad(m.elements[12], m.elements[14]))) {
      poolB.add(this.poolGeo.clone().applyMatrix4(m4));
      bridgeB.add(tone(this.poleGeo.clone().applyMatrix4(m4), 0.4));
      const bulb = this.bulbGeo.clone().applyMatrix4(m4);
      bulb.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bulb.attributes.position.count * 3).map((_, i) => [1, 0.85, 0.55][i % 3]), 3));
      lineB.add(bulb);
    }
    add(bridgeB, this.bridgeMat, true);
    add(lineB, this.lineMat, false);
    add(poolB, this.poolMat, false);
    add(waterB, this.waterMat, false);
    add(railB, this.railMat, false);
    if (tops.length) {
      // beacons stay instanced (their material blinks); antennae are baked in with the bridges
      const bea = new THREE.InstancedMesh(this.beaconGeo, this.beaconMat, tops.length);
      const m4 = new THREE.Matrix4();
      tops.forEach((t, i) => bea.setMatrixAt(i, m4.makeTranslation(t.x, t.y + t.h, t.z)));
      bea.computeBoundingSphere();
      group.add(bea);
    }
    if (boards.length) group.add(holoBoards(boards, (i) => fract(Math.sin((d.x * 31 + d.z * 17 + i) * 12.9898) * 43758.5453)));

    yield;

    // ---- swap in: the new level replaces whatever this tile had ----
    this.building.delete(`${key}:${level}`);
    const old = this.tiles.get(key);
    if (old) this.unload(old);
    const t: Tile = { key, level, group, roads, polys };
    for (const poly of polys) eachCell(poly, (k) => (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(poly));
    for (const r of roads) {
      this.sigs.set(r.sig, key);
      r.pts.forEach((pt, i) => {
        const k = endKey(pt);
        (this.nodes.get(k) ?? this.nodes.set(k, []).get(k)!).push({ road: r, s: r.cum[i], atStart: i === 0, atEnd: i === r.pts.length - 1 });
      });
    }
    this.tiles.set(key, t);
    this.scene.add(group);
  }
}

// ---- road helpers ----
/** Height of a road at [s] metres along it: bridges rise over ~30 m from each abutment. */
export function roadY(r: Road, s: number) {
  return r.bridge ? 0.05 + 6.5 * r.bridge * Math.min(1, s / 30, (r.len - s) / 30) : 0.04 + r.kind * 0.002;
}
export function pointAt(r: { pts: THREE.Vector2[]; cum: number[]; len: number }, s: number): THREE.Vector2 {
  const t = Math.max(0, Math.min(r.len, s));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < t) i++;
  const seg = r.cum[i] - r.cum[i - 1] || 1;
  return r.pts[i - 1].clone().lerp(r.pts[i], (t - r.cum[i - 1]) / seg);
}
export function dirAt(r: { pts: THREE.Vector2[]; cum: number[]; len: number }, s: number): THREE.Vector2 {
  const t = Math.max(0, Math.min(r.len, s));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < t) i++;
  return r.pts[i].clone().sub(r.pts[i - 1]).normalize();
}

const endKey = (p: THREE.Vector2) => `${Math.round(p.x)}_${Math.round(p.y)}`;
const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`;
function eachCell(p: Poly, fn: (k: string) => void) {
  for (let cx = Math.floor(p.minX / CELL); cx <= Math.floor(p.maxX / CELL); cx++) for (let cz = Math.floor(p.minZ / CELL); cz <= Math.floor(p.maxZ / CELL); cz++) fn(`${cx}_${cz}`);
}
function insideRing(pts: THREE.Vector2[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function insidePoly(pts: Float32Array, x: number, z: number) {
  let inside = false;
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], zi = pts[i * 2 + 1], xj = pts[j * 2], zj = pts[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function lengths(pts: THREE.Vector2[]) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1])); return cum; }
const signedArea = (pts: THREE.Vector2[]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; } return a / 2; };
function offset(pts: THREE.Vector2[], by: number) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1;
    return new THREE.Vector2(p.x - (dz / l) * by, p.y + (dx / l) * by);
  });
}

// ---- geometry, with light baked into vertex colours ----
const UP_NORMALS = (n: number) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a[i * 3 + 1] = 1; return a; };
/** Geometry for one material, appended piece by piece into plain arrays (position, normal, colour, uv). */
class Batch {
  private p: number[] = []; private n: number[] = []; private c: number[] = []; private uv: number[] = []; private i: number[] = [];
  get empty() { return this.i.length === 0; }
  /** Appends a quad's corners (a,b,c,d in order round it), facing up, of one shade. */
  quad(pts: number[], shade: number, rgb?: [number, number, number]) {
    const o = this.p.length / 3;
    for (let k = 0; k < 4; k++) { this.p.push(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]); this.n.push(0, 1, 0); if (rgb) this.c.push(...rgb); else this.c.push(shade, shade, shade); this.uv.push(0, 0); }
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  add(g: THREE.BufferGeometry) {
    const o = this.p.length / 3, pos = g.attributes.position, nr = g.attributes.normal, cl = g.attributes.color, uv = g.attributes.uv, cnt = pos.count;
    for (let k = 0; k < cnt; k++) {
      this.p.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      if (nr) this.n.push(nr.getX(k), nr.getY(k), nr.getZ(k)); else this.n.push(0, 1, 0);
      if (cl) this.c.push(cl.getX(k), cl.getY(k), cl.getZ(k)); else this.c.push(1, 1, 1);
      if (uv) this.uv.push(uv.getX(k), uv.getY(k)); else this.uv.push(0, 0);
    }
    if (g.index) { const ix = g.index.array; for (let k = 0; k < ix.length; k++) this.i.push(ix[k] + o); }
    else for (let k = 0; k < cnt; k++) this.i.push(o + k);
    g.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}
function tone(g: THREE.BufferGeometry, v: number) {
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(v), 3));
  return g;
}
/** A plain ribbon, 2 vertices across (for thin neon lines). */
function thinRibbon(pts: THREE.Vector2[], y: (s: number) => number, width: number) {
  const pos: number[] = [], cols: number[] = [], idx: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += pts[i].distanceTo(pts[i - 1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1, nx = -dz / l * width / 2, nz = dx / l * width / 2, yy = y(s);
    pos.push(pts[i].x + nx, yy, pts[i].y + nz, pts[i].x - nx, yy, pts[i].y - nz);
    cols.push(1, 1, 1, 1, 1, 1);
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(UP_NORMALS(pos.length / 3), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  return g;
}
/** A ribbon 4 vertices across (kerb, inner, inner, kerb): kerbs darker, as dust and oil gather there. */
function ribbon(pts: THREE.Vector2[], cum: number[], width: number, y: (s: number) => number, shade: number, kerb: number) {
  const pos: number[] = [], cols: number[] = [], uv: number[] = [], idx: number[] = [];
  const across = [-0.5, -0.36, 0.36, 0.5], k4 = [kerb, 1, 1, kerb];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, yy = y(cum[i]);
    for (let k = 0; k < 4; k++) {
      pos.push(pts[i].x + nx * width * across[k], yy, pts[i].y + nz * width * across[k]);
      const v = shade * k4[k];
      cols.push(v, v, v);
      uv.push(across[k] + 0.5, cum[i] / 18);
    }
    if (i > 0) { const o = (i - 1) * 4; for (let k = 0; k < 3; k++) idx.push(o + k, o + k + 1, o + k + 4, o + k + 1, o + k + 5, o + k + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(UP_NORMALS(pos.length / 3), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** Centre-line dashes on a main road: 2.4 m of cyan light, 3.6 m gap. */
function dashes(b: Batch, pts: THREE.Vector2[], cum: number[], y: (s: number) => number) {
  const r = { pts, cum, len: cum[cum.length - 1] };
  for (let s = 2; s < r.len - 2; s += 6) {
    const p = pointAt(r, s), d = dirAt(r, s), yy = y(s) + 0.012;
    const ax = d.x * 1.2, az = d.y * 1.2, sx = -d.y * 0.11, sz = d.x * 0.11;
    b.quad([p.x - ax - sx, yy, p.y - az - sz, p.x - ax + sx, yy, p.y - az + sz, p.x + ax + sx, yy, p.y + az + sz, p.x + ax - sx, yy, p.y + az - sz], 1, [0, 0.9, 1]);
  }
}
const col = new THREE.Color();
const fract = (x: number) => x - Math.floor(x);
/** A hipped roof over a footprint: eaves 0.4 m out, rising to a ridge point over the middle. */
function hipRoof(pts: THREE.Vector2[], h: number, c: THREE.Vector2, style: number, seed: number) {
  const ring = signedArea(pts) > 0 ? pts : [...pts].reverse();
  const rise = 1.2 + Math.min(1.4, Math.sqrt(Math.abs(signedArea(pts))) * 0.12);
  const pos: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i].clone().sub(c).multiplyScalar(1 + 0.4 / Math.max(1, ring[i].distanceTo(c))).add(c);
    const b = ring[(i + 1) % ring.length].clone().sub(c).multiplyScalar(1 + 0.4 / Math.max(1, ring[(i + 1) % ring.length].distanceTo(c))).add(c);
    pos.push(a.x, h, a.y, c.x, h + rise, c.y, b.x, h, b.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // wound so each face looks up and out, whichever way the footprint ran
  if ((g.attributes.normal as THREE.BufferAttribute).getY(0) < 0) {
    for (let i = 0; i < pos.length; i += 9) { for (let k = 0; k < 3; k++) { const t = pos[i + k]; pos[i + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
  }
  const n = pos.length / 3;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 2 ? seed : style)), 2));
  return g;
}
function building(pts: THREE.Vector2[], h: number, wall: number, crowd: number, style = 0, seed = 0) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y))), { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  // sky occlusion: dark at the foot of the wall, full light by ~4 floors; crowded blocks darker
  const p = g.attributes.position, nr = g.attributes.normal, n = p.count, c = new Float32Array(n * 3);
  col.setHex(wall);
  const dark = 1 - crowd * 0.2, top = Math.max(4, Math.min(h, 13));
  for (let i = 0; i < n; i++) {
    const k = (nr.getY(i) > 0.6 ? 1 : 0.58 + 0.42 * Math.min(1, p.getY(i) / top)) * dark;
    c[i * 3] = col.r * k; c[i * 3 + 1] = col.g * k; c[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  // the shader reads the building's type and seed from its uv
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 2 ? seed : style + 10 * Math.round(h))), 2));
  return g;
}
/** A road's dusty shoulder: pale trodden earth at the kerb fading to the ground colour. */
function shoulder(pts: THREE.Vector2[], cum: number[], width: number) {
  const g = ribbon(pts, cum, width, () => 0.03, 1, 1);
  const c = g.attributes.color as THREE.BufferAttribute;
  col.setHex(GROUND_HEX);
  for (let i = 0; i < c.count; i++) {
    const edge = i % 4 === 0 || i % 4 === 3; // the outer vertices meet the ground
    const k = edge ? 1 : 1.1;
    c.setXYZ(i, Math.min(1, col.r * k), Math.min(1, col.g * k * 0.98), Math.min(1, col.b * k * 0.95));
  }
  return g;
}
/** A soft contact shadow on the ground round a footprint: dark at the wall, ground colour 1.6 m out. */
function skirt(pts: THREE.Vector2[], reach = 1.6) {
  const ring = signedArea(pts) > 0 ? pts : [...pts].reverse();
  const n = ring.length, pos: number[] = [], cols: number[] = [], idx: number[] = [];
  col.setHex(GROUND_HEX);
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n], p = ring[i], b = ring[(i + 1) % n];
    const e1 = p.clone().sub(a).normalize(), e2 = b.clone().sub(p).normalize();
    const nrm = new THREE.Vector2(e1.y + e2.y, -(e1.x + e2.x));
    if (nrm.lengthSq() < 1e-6) nrm.set(e1.y, -e1.x);
    nrm.normalize();
    const out = p.clone().addScaledVector(nrm, reach);
    pos.push(p.x, 0.025, p.y, out.x, 0.025, out.y);
    cols.push(col.r * 0.42, col.g * 0.42, col.b * 0.42, col.r, col.g, col.b);
    const o = i * 2, j = ((i + 1) % n) * 2;
    idx.push(o, o + 1, j, o + 1, j + 1, j);
  }
  // face up whichever way the ring winds (a face's normal is (B-A)x(C-A); we want +y)
  const tri = (i: number) => new THREE.Vector3(pos[idx[i] * 3], 0, pos[idx[i] * 3 + 2]);
  const A = tri(0), B = tri(1), C = tri(2);
  if (B.sub(A).cross(C.sub(A)).y < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(UP_NORMALS(pos.length / 3), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  return g;
}
/** Douglas-Peucker on a closed ring, for far-away buildings. */
function simplify(pts: THREE.Vector2[], tol: number) {
  if (pts.length <= 4) return pts;
  const ring = [...pts, pts[0]];
  const keep = new Array(ring.length).fill(false);
  keep[0] = keep[ring.length - 1] = true;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = 0, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const A = ring[a], B = ring[b], P = ring[i];
      const ex = B.x - A.x, ez = B.y - A.y, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((P.x - A.x) * ex + (P.y - A.y) * ez) / l2));
      const d = Math.hypot(P.x - A.x - ex * t, P.y - A.y - ez * t);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = true; stack.push([a, bi], [bi, b]); }
  }
  const out = ring.filter((_, i) => keep[i]).slice(0, -1);
  return out.length >= 3 ? out : pts;
}
