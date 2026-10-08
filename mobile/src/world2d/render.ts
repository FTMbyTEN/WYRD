/**
 * Draws NAIJA 2099 in the clean-minimal look (design/naija2099-styles/4-minimal.png): an angled
 * bird's-eye view of the real map that the player can turn (yaw) and tip (pitch) with the mouse.
 * Ground (grass, pavements with kerbs, roads with markings and zebra crossings, water) is drawn
 * flat in world metres through one canvas transform; buildings rise as white and glass blocks;
 * people and vehicles come from sheets baked from the 3D city's own models (TEN, Ama, the danfo,
 * okada and keke, the cars and BRT bus) at 8 or 16 headings; props and landmarks are pictures.
 * Everything upright is painted back to front. At night the same city is darkened and lit by neon,
 * lamps and headlights.
 *
 * No 3D engine: one 2D canvas, only what is on screen drawn.
 */
import { SIZE } from './geo';
import { drawPerson, facingOf, type Look } from './person';
import { KIND, inPoly, type Road, type Tile } from './tiles';
/** The camera: centre (x, z) in metres, zoom (px per metre), screen size, and its angles. */
export type Cam = { x: number; z: number; scale: number; w: number; h: number; dpr: number;
  /** turn around the vertical axis (radians) */ yaw: number;
  /** ground squash = sin(pitch); height rise = cos(pitch) */ tilt: number; rise: number };
export type Sprite = { s: string; x: number; z: number; rot?: number; up?: boolean; lift?: number; scale?: number;
  /** which way it is heading in the world, atan2(dx, dz) -- picks the right baked view */
  heading?: number;
  /** a vehicle drawn from its baked sheet (16 headings) */
  veh?: boolean;
  /** a passer-by drawn by the small rig: look, and walk phase (undefined = standing) */
  look?: Look; walk?: number;
  /** TEN or Ama, from their baked motion-capture sheets */
  hero?: { who: 'ten' | 'ama'; anim: 'walk' | 'run' | 'idle'; frame: number } };
// baked sheets: people 192 px cells x 8 rows of headings, spanning 1.7 m, feet 90% down
const HERO_FRAMES = { walk: 10, run: 10, idle: 6 } as const;
const HERO_CELL = 192, HERO_FEET = 0.9, HERO_SIZE = 1.8;
/** TEN and Ama are baked from four camera angles (as in Bake.tsx); each cell spans 2 x heroHalf metres, feet 90% down */
const HERO_PITCHES = [0.2, 0.42, Math.asin(0.6), 0.9];
const heroHalf = (e: number) => Math.max(0.85, (1.8 * Math.cos(e)) / 1.75 + 0.03);
// vehicles: 160 px cells, 32 headings across x 6 camera pitches down; how many metres a cell spans (BakeVehicles.tsx)
const VEH_CELL = 160, VEH_DIRS = 32, VEH_PITCHES = [0.15, 0.25, 0.35, 0.55, 0.75, 0.95];
const vehGround = (span: number, pitch: number) => 0.5 + (0.06 * span * Math.cos(pitch)) / span;
export const VEH_SPAN: Record<string, number> = {
  'car-red': 6.2, 'car-blue': 6.2, 'car-white': 6.2, 'car-purple': 6.2, 'car-grey': 6.2, 'car-taxi': 6.2,
  'car-danfo': 6.8, 'bus-brt': 14.5, okada: 3.2, keke: 3.8,
};
const VEH_SIZE = 1.25; // a touch larger than life, like the poster
const DAY = {
  grass: '#4A5240', grass2: '#3F4737', pave: '#727780', kerbFace: '#2E3238', road: '#23262C', line: '#D8D3C0', yellow: '#FCEE0A',
  water: '#0B3E4C', waterEdge: '#19D3E6', roofs: ['#3B3F47', '#454951', '#4D5058', '#363A41'], glassRoof: '#173445', wall: '#5E6168', wallGlass: '#1E3A4C', outline: 'rgba(0,0,0,0.4)',
  rail: '#5B5E66', shadow: 'rgba(0,0,0,0.32)',
};
// ---- facades: one small repeating tile per style (a bay 3 m wide, a storey 3.2 m tall), laid along
// each wall with a pattern transform, so a whole wall of windows costs one fill ----
const WALLS = ['#7B7468', '#6C6F76', '#5D6670', '#86745F', '#6A5D6E', '#787060', '#5B6965', '#8B8072'];
const GLASS = ['#163A4D', '#1A2E46', '#23304B', '#153E45', '#2A2442'];
const ROOFS_ZINC = ['#6E4A35', '#5A5F66', '#7A5238', '#4E5459'];
const AWNINGS = ['#FF003C', '#00F0FF', '#FCEE0A', '#FF2BD6', '#3DFF9A', '#FF8A00'];
/** the neon of the street: signs, crowns and edge lights */
const NEON = ['#00F0FF', '#FF2BD6', '#FCEE0A', '#FF003C', '#3DFF9A', '#9B6BFF'];
const patterns = new Map<string, CanvasPattern>();
function facade(ctx: CanvasRenderingContext2D, kind: 'house' | 'block' | 'shops' | 'tower', color: string, night: boolean, accent = 0): CanvasPattern | null {
  const key = kind + color + night + accent;
  const hit = patterns.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const T = 48, el = document.createElement('canvas'); el.width = T; el.height = T;
  const g = el.getContext('2d')!;
  const lit = night ? ['#FFC46B', '#5FF3FF', '#FF7BE3'][Math.floor(Math.random() * 3)] : null;
  g.fillStyle = color; g.fillRect(0, 0, T, T);
  if (kind === 'tower') {
    // a curtain wall: glass panes between slim mullions and a floor slab line
    g.fillStyle = lit && Math.random() < 0.6 ? lit : 'rgba(120,200,230,0.10)'; g.fillRect(2, 4, T - 4, T - 10);
    g.fillStyle = 'rgba(0,240,255,0.22)'; g.fillRect(0, T - 4, T, 3);
    g.fillStyle = 'rgba(10,25,50,0.35)'; g.fillRect(T / 2 - 1, 0, 2, T);
  } else if (kind === 'house') {
    // one window per bay, shuttered
    g.fillStyle = lit ?? '#1C232C'; g.fillRect(14, 14, 20, 18);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(12, 12, 24, 3); g.fillRect(12, 32, 24, 3);
  } else {
    // a walk-up: a window per bay with a sill and a balcony line every storey
    g.fillStyle = lit ?? (Math.random() < 0.18 ? 'rgba(0,240,255,0.55)' : '#1A212B'); g.fillRect(10, 10, 28, 20);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(8, 30, 32, 3);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, T - 6, T, 6);
    if (kind === 'shops' && accent) { /* the shop band is drawn separately */ }
  }
  const p = g.canvas && ctx.createPattern(el, 'repeat');
  if (p) patterns.set(key, p);
  return p;
}
/** a shopfront band at street level: shutters, glass and a striped awning */
function shopfront(ctx: CanvasRenderingContext2D, awning: string, night: boolean): CanvasPattern | null {
  const key = 'shop' + awning + night;
  const hit = patterns.get(key);
  if (hit) return hit;
  const T = 48, el = document.createElement('canvas'); el.width = T; el.height = T;
  const g = el.getContext('2d')!;
  g.fillStyle = '#2A2D33'; g.fillRect(0, 0, T, T);
  g.fillStyle = night ? '#FFE3A8' : '#3A4C5C'; g.fillRect(4, 18, T - 8, T - 20);           // shop window / open front
  g.fillStyle = awning; g.fillRect(0, 6, T, 12);                                          // awning
  g.fillStyle = 'rgba(0,0,0,0.45)'; for (let x = 0; x < T; x += 12) g.fillRect(x, 6, 6, 12);
  const p = ctx.createPattern(el, 'repeat');
  if (p) patterns.set(key, p);
  return p;
}
const imgs = new Map<string, HTMLImageElement>();
export function img(name: string) {
  let i = imgs.get(name);
  if (!i) { i = new Image(); i.src = `world2d/${name.includes('.') ? name : `pics/${name}.webp`}`; imgs.set(name, i); }
  return i;
}
/** world -> camera-turned coordinates (rx across the screen, rz down it) */
function turn(c: Cam, x: number, z: number) {
  const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
  return { rx: co * dx - si * dz, rz: si * dx + co * dz };
}
/** depth for painting order: larger is nearer the camera */
export const depth = (c: Cam, x: number, z: number) => Math.sin(c.yaw) * (x - c.x) + Math.cos(c.yaw) * (z - c.z);
/** world -> screen */
export function toScreen(c: Cam, x: number, z: number, y = 0) {
  const { rx, rz } = turn(c, x, z);
  return { sx: rx * c.scale + c.w / 2, sy: rz * c.scale * c.tilt + c.h / 2 - y * c.scale * c.rise };
}
/** a heading in the world, as seen on screen (0 = towards the camera, down the screen) */
export const screenHeading = (c: Cam, heading: number) => heading - c.yaw; // the turned direction (sin h, cos h) is (sin(h - yaw), cos(h - yaw)) on screen
/** Ground drawing in world metres: the canvas itself turned and tilted. [lift] raises it (bridges). */
function worldSpace(ctx: CanvasRenderingContext2D, c: Cam, lift = 0) {
  ctx.translate(c.w / 2, c.h / 2 - lift * c.scale * c.rise);
  ctx.scale(c.scale, c.scale * c.tilt);
  ctx.rotate(c.yaw);
  ctx.translate(-c.x, -c.z);
}
function wpath(ctx: CanvasRenderingContext2D, p: Float32Array) {
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
}
/** a path parallel to a road, [off] metres to its right */
function offsetPath(ctx: CanvasRenderingContext2D, r: Road, off: number) {
  const n = r.cum.length;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = r.p[i1 * 2] - r.p[i0 * 2], dz = r.p[i1 * 2 + 1] - r.p[i0 * 2 + 1], L = Math.hypot(dx, dz) || 1;
    const x = r.p[i * 2] - (dz / L) * off, z = r.p[i * 2 + 1] + (dx / L) * off;
    if (i) ctx.lineTo(x, z); else ctx.moveTo(x, z);
  }
}
export type View = { minX: number; maxX: number; minZ: number; maxZ: number };
export function viewOf(c: Cam): View {
  // whatever the turn, everything on screen lies within this distance of the centre (tall things reach in from below)
  const r = Math.min(420, Math.hypot(c.w / 2 / c.scale, c.h / 2 / (c.scale * c.tilt)) + 60); // low cameras see far: stop at ~400 m
  return { minX: c.x - r, maxX: c.x + r, minZ: c.z - r, maxZ: c.z + r };
}
const inView = (v: View, minX: number, maxX: number, minZ: number, maxZ: number) => maxX > v.minX && minX < v.maxX && maxZ > v.minZ && minZ < v.maxZ;
/** The ground: grass, water, then every road (verge, kerbed pavement, asphalt, markings, crossings), rail. */
export type Sand = { p: Float32Array; line: boolean };
export function drawGround(ctx: CanvasRenderingContext2D, c: Cam, tiles: Tile[], sea: { p: Float32Array; island: boolean }[], v: View, sand: Sand[] = []) {
  ctx.fillStyle = DAY.grass;
  ctx.fillRect(0, 0, c.w, c.h);
  const k = c.scale;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const roads: Road[] = [];
  for (const t of tiles) for (const r of t.roads) if (inView(v, r.minX, r.maxX, r.minZ, r.maxZ) && r.kind !== KIND.foot) roads.push(r);
  const pass = (pick: (r: Road) => number, color: string) => {
    ctx.strokeStyle = color;
    for (const r of roads) { const w = pick(r); if (w <= 0) continue; ctx.lineWidth = w; ctx.beginPath(); wpath(ctx, r.p); ctx.stroke(); }
  };
  const pave = (r: Road) => (r.bridge ? 0 : r.w + (r.kind <= KIND.tertiary ? 7 : 3.5));
  ctx.save(); worldSpace(ctx, c);
  for (const q of sea) {
    ctx.beginPath(); wpath(ctx, q.p); ctx.closePath();
    ctx.fillStyle = q.island ? DAY.grass : DAY.water; ctx.fill();
    if (!q.island) { ctx.strokeStyle = DAY.waterEdge; ctx.lineWidth = Math.max(1 / k, 1.5); ctx.stroke(); }
  }
  // the beaches: mapped sand areas, and a broad strip of sand along the Atlantic shore
  for (const q of sand) {
    ctx.beginPath(); wpath(ctx, q.p);
    if (q.line) {
      ctx.strokeStyle = '#EAD49A'; ctx.lineWidth = 46; ctx.stroke();
      ctx.strokeStyle = '#F3E2B3'; ctx.lineWidth = 30; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1 / k, 1.2); ctx.stroke(); // the line of surf
    } else { ctx.closePath(); ctx.fillStyle = '#F1DFAE'; ctx.fill(); }
  }
  for (const t of tiles) for (const w of t.water) {
    ctx.beginPath(); wpath(ctx, w.p);
    if (w.ribbon) { ctx.strokeStyle = DAY.water; ctx.lineWidth = Math.max(1 / k, w.ribbon); ctx.stroke(); }
    else { ctx.closePath(); ctx.fillStyle = DAY.water; ctx.fill(); }
  }
  pass((r) => (r.kind <= KIND.secondary && !r.bridge ? r.w + 16 : 0), DAY.grass2);
  ctx.restore();
  // the kerb's face: the pavement drawn a kerb's height lower first, so a darker sliver shows under its edge
  ctx.save(); worldSpace(ctx, c, -0.18); pass(pave, DAY.kerbFace); ctx.restore();
  ctx.save(); worldSpace(ctx, c);
  pass(pave, DAY.pave);
  pass((r) => (r.bridge ? 0 : r.w), DAY.road);
  ctx.setLineDash([]);
  for (const t of tiles) for (const p of t.rail) { ctx.strokeStyle = DAY.rail; ctx.lineWidth = 3; ctx.beginPath(); wpath(ctx, p); ctx.stroke(); }
  if (k > 3) markings(ctx, roads, k);
  ctx.restore();
}
/** Lane lines, solid edge lines and zebra crossings, in world metres (the transform is already set). */
function markings(ctx: CanvasRenderingContext2D, roads: Road[], k: number) {
  for (const r of roads) {
    if (r.bridge || r.kind > KIND.tertiary || r.w < 7) continue;
    // centre: dashed (yellow on two-way main roads)
    ctx.strokeStyle = r.kind <= KIND.primary && !r.oneway ? DAY.yellow : DAY.line;
    ctx.lineWidth = Math.max(1 / k, 0.18);
    ctx.setLineDash([3, 3.5]);
    ctx.beginPath(); wpath(ctx, r.p); ctx.stroke();
    ctx.setLineDash([]);
    // solid edge lines on the big roads
    if (r.kind <= KIND.secondary) {
      ctx.strokeStyle = 'rgba(244,246,248,0.85)'; ctx.lineWidth = Math.max(1 / k, 0.15);
      for (const side of [-1, 1]) { ctx.beginPath(); offsetPath(ctx, r, side * (r.w / 2 - 0.6)); ctx.stroke(); }
    }
  }
  // zebra crossings where the main roads end at junctions
  if (k < 6) return;
  ctx.strokeStyle = 'rgba(248,250,252,0.95)'; ctx.lineCap = 'butt';
  for (const r of roads) {
    if (r.bridge || r.kind > KIND.secondary || r.len < 60) continue;
    for (const s of [7, r.len - 7]) {
      const n = r.cum.length;
      let i = 1; while (i < n - 1 && r.cum[i] < s) i++;
      const x0 = r.p[i * 2 - 2], z0 = r.p[i * 2 - 1], x1 = r.p[i * 2], z1 = r.p[i * 2 + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1;
      const t = Math.min(1, Math.max(0, (s - r.cum[i - 1]) / L)), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
      const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let o = -r.w / 2 + 0.6; o <= r.w / 2 - 0.5; o += 1.0) {
        const px = cx - dz * o, pz = cz + dx * o;
        ctx.moveTo(px - dx * 1.5, pz - dz * 1.5); ctx.lineTo(px + dx * 1.5, pz + dz * 1.5);
      }
      ctx.stroke();
    }
  }
  ctx.lineCap = 'round';
}
/** Bridges float over everything on the ground, with their shadow beneath. */
export function drawBridges(ctx: CanvasRenderingContext2D, c: Cam, tiles: Tile[], v: View) {
  const k = c.scale, lift = 7;
  const bridges: Road[] = [];
  for (const t of tiles) for (const r of t.roads) if (r.bridge && inView(v, r.minX, r.maxX, r.minZ, r.maxZ)) bridges.push(r);
  if (!bridges.length) return;
  ctx.save(); worldSpace(ctx, c);
  ctx.strokeStyle = 'rgba(20,40,70,0.25)';
  for (const r of bridges) { ctx.lineWidth = r.w + 1; ctx.beginPath(); wpath(ctx, r.p); ctx.stroke(); }
  ctx.restore();
  ctx.save(); worldSpace(ctx, c, lift);
  for (const r of bridges) {
    ctx.strokeStyle = '#E8EBEF'; ctx.lineWidth = r.w + 1.6; ctx.beginPath(); wpath(ctx, r.p); ctx.stroke();
    ctx.strokeStyle = DAY.road; ctx.lineWidth = r.w; ctx.beginPath(); wpath(ctx, r.p); ctx.stroke();
    if (k > 3 && r.w >= 7) {
      ctx.strokeStyle = DAY.line; ctx.lineWidth = Math.max(1 / k, 0.18); ctx.setLineDash([3, 3.5]);
      ctx.beginPath(); wpath(ctx, r.p); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.restore();
}
type Item = { z: number; draw: () => void };
/** Buildings and pictures, back to front. Returns whether anything solid stands between the camera and [focus]
 *  (the game then shows the player's silhouette through it -- buildings never turn see-through). */
export function drawUpright(ctx: CanvasRenderingContext2D, c: Cam, tiles: Tile[], sprites: Sprite[], v: View, night: boolean, focus?: { x: number; z: number }): boolean {
  let hidden = false;
  const items: Item[] = [];
  const f = focus ? turn(c, focus.x, focus.z) : null;
  for (const t of tiles) {
    for (const b of t.blds) {
      if (!inView(v, b.minX, b.maxX, b.minZ, b.maxZ)) continue;
      // its extent as seen by the turned camera
      let rx0 = Infinity, rx1 = -Infinity, rz0 = Infinity, rz1 = -Infinity;
      for (let i = 0; i < b.p.length; i += 2) {
        const q = turn(c, b.p[i], b.p[i + 1]);
        if (q.rx < rx0) rx0 = q.rx; if (q.rx > rx1) rx1 = q.rx; if (q.rz < rz0) rz0 = q.rz; if (q.rz > rz1) rz1 = q.rz;
      }
      const hides = !!f && rz1 > f.rz && rx0 - 2 < f.rx && rx1 + 2 > f.rx && (rz0 - f.rz) * c.tilt < b.h * c.rise + 3;
      if (hides && !b.hide) hidden = true;
      items.push({ z: rz1, draw: () => building(ctx, c, b, night) });
    }
    for (const p of t.props) {
      if (p.x < v.minX || p.x > v.maxX || p.z < v.minZ || p.z > v.maxZ) continue;
      items.push({ z: depth(c, p.x, p.z), draw: () => picture(ctx, c, { s: p.s, x: p.x, z: p.z, up: true }) });
    }
  }
  for (const s of sprites) {
    if (s.x < v.minX - 200 || s.x > v.maxX + 200 || s.z < v.minZ - 200 || s.z > v.maxZ + 200) continue;
    // a landmark picture in front of the player fades, like a building would
    let fade = false;
    if (f && s.scale && s.up) {
      const im = img(s.s), metres = (SIZE[s.s] ?? 4) * s.scale;
      if (im.naturalWidth) {
        const q = turn(c, s.x, s.z), w = metres / 2, hpx = (metres * im.naturalHeight / Math.max(im.naturalWidth, im.naturalHeight)) * c.scale;
        const sy = q.rz * c.scale * c.tilt, fy = f.rz * c.scale * c.tilt;
        fade = q.rz > f.rz && Math.abs(q.rx - f.rx) < w && fy > sy - hpx * 0.92;
      }
    }
    if (fade) hidden = true;
    items.push({ z: depth(c, s.x, s.z), draw: () => picture(ctx, c, s) });
  }
  items.sort((a, b) => a.z - b.z);
  for (const it of items) it.draw();
  return hidden;
}
/** The player seen through whatever hides them: a soft silhouette drawn over everything. */
export function drawGhost(ctx: CanvasRenderingContext2D, c: Cam, s: Sprite) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  picture(ctx, c, s);
  ctx.restore();
}
function building(ctx: CanvasRenderingContext2D, c: Cam, b: Tile['blds'][number], night: boolean) {
  if (b.hide) return;
  const k = c.scale, up = b.h * k * c.rise;
  const p = b.p, n = p.length / 2;
  const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
  const pts = Array.from({ length: n }, (_, i) => toScreen(c, p[i * 2], p[i * 2 + 1]));
  const tower = b.style === 'tower', house = b.style === 'house';
  const wallColor = tower ? GLASS[Math.floor(b.tone * GLASS.length)] : WALLS[Math.floor(b.tone * WALLS.length)];
  // soft shadow to the lower right
  ctx.beginPath();
  pts.forEach((q, i) => { const x = q.sx + b.h * k * 0.18, y = q.sy + b.h * k * 0.05; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath(); ctx.fillStyle = DAY.shadow; ctx.fill();
  const detailed = k > 2.6; // windows, doors and roof details once they'd be a few pixels
  const pat = detailed ? facade(ctx, b.style, wallColor, night) : null;
  const shop = detailed && b.style === 'shops' ? shopfront(ctx, AWNINGS[Math.floor(b.tone * 97) % AWNINGS.length], night) : null;
  // walls whose outside faces the camera, painted far to near so a building never covers itself
  const walls: { i: number; j: number; d: number; len: number; nx: number; nz: number }[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = p[j * 2] - p[i * 2], ez = p[j * 2 + 1] - p[i * 2 + 1], len = Math.hypot(ex, ez);
    if (len < 0.3) continue;
    // which way is out: step a little off the wall's middle -- if that lands inside the footprint, out is the other way
    // (map data lists corners in either order, and a wrong guess would show the building's inside)
    let nx = -ez / len, nz = ex / len;
    const mx = (p[i * 2] + p[j * 2]) / 2, mz = (p[i * 2 + 1] + p[j * 2 + 1]) / 2;
    if (inPoly(p, mx + nx * 0.4, mz + nz * 0.4)) { nx = -nx; nz = -nz; }
    if (si * nx + co * nz <= 0.02) continue;
    walls.push({ i, j, len, nx, nz, d: depth(c, (p[i * 2] + p[j * 2]) / 2, (p[i * 2 + 1] + p[j * 2 + 1]) / 2) });
  }
  walls.sort((w1, w2) => w1.d - w2.d);
  const front = walls.reduce<(typeof walls)[number] | null>((best, w) => (!best || w.len > best.len ? w : best), null); // the main facade: it gets the door
  for (const w of walls) {
    const a = pts[w.i], d = pts[w.j], len = w.len, nx = w.nx, nz = w.nz;
    const quad = (y0: number, y1: number) => { ctx.beginPath(); ctx.moveTo(a.sx, a.sy - y0); ctx.lineTo(d.sx, d.sy - y0); ctx.lineTo(d.sx, d.sy - y1); ctx.lineTo(a.sx, a.sy - y1); ctx.closePath(); };
    // the facade, laid along the wall: bays of 3 m, storeys of 3.2 m
    const ux = (d.sx - a.sx) / len, uy = (d.sy - a.sy) / len, vy = -k * c.rise;
    const lay = (pp: CanvasPattern) => pp.setTransform(new DOMMatrix([ux * 3 / 48, uy * 3 / 48, 0, vy * 3.2 / 48, a.sx, a.sy]));
    const shopTop = shop ? Math.min(b.h, 3.6) * k * c.rise : 0;
    quad(shopTop, up);
    if (pat) { lay(pat); ctx.fillStyle = pat; } else ctx.fillStyle = wallColor;
    ctx.fill();
    if (shop) { quad(0, shopTop); lay(shop); ctx.fillStyle = shop; ctx.fill(); }
    // light: walls facing left are lit, facing right in shade
    const across = (co * nx - si * nz) / (Math.hypot(nx, nz) || 1);
    ctx.fillStyle = `rgba(5,8,18,${(0.12 + 0.22 * Math.max(0, across)).toFixed(3)})`;
    quad(0, up); ctx.fill();
    // a darker plinth where the building meets the street
    ctx.fillStyle = 'rgba(30,38,52,0.22)'; quad(0, Math.min(0.7, b.h * 0.2) * k * c.rise); ctx.fill();
    // the front door, centred on the main facade (with a little canopy over it)
    if (w === front && detailed && len > 4 && !shop) {
      const t0 = 0.5 - 0.7 / len, t1 = 0.5 + 0.7 / len, hDoor = 2.3 * k * c.rise;
      const x0 = a.sx + (d.sx - a.sx) * t0, y0 = a.sy + (d.sy - a.sy) * t0, x1 = a.sx + (d.sx - a.sx) * t1, y1 = a.sy + (d.sy - a.sy) * t1;
      ctx.fillStyle = night ? '#FFD58A' : tower ? '#2B3F5C' : '#5A4636';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - hDoor); ctx.lineTo(x0, y0 - hDoor); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, 0.25 * k);
      ctx.beginPath(); ctx.moveTo(x0 - (x1 - x0) * 0.3, y0 - hDoor - 1); ctx.lineTo(x1 + (x1 - x0) * 0.3, y1 - hDoor - 1); ctx.stroke();
    }
    // neon on the main facade: a glowing bar across it on about half the blocks, a blade sign on the shops
    if (w === front && detailed && !house && len > 5) {
      const pick = (b.tone * 97) % 1, neon = NEON[Math.floor(b.tone * 53) % NEON.length];
      const at = (t: number, hgt: number) => ({ x: a.sx + (d.sx - a.sx) * t, y: a.sy + (d.sy - a.sy) * t - hgt * k * c.rise });
      const glowLine = (p0: { x: number; y: number }, p1: { x: number; y: number }, wide: number) => {
        ctx.strokeStyle = neon; ctx.lineCap = 'round';
        ctx.globalAlpha = night ? 0.35 : 0.22; ctx.lineWidth = wide * 3.2; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = wide; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        if (k > 6) { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(0.6, wide * 0.35); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); } // the white-hot core, close up
      };
      if (pick < 0.55) { const hgt = Math.min(b.h - 1, Math.max(3.4, b.h * 0.62)); glowLine(at(0.2, hgt), at(0.8, hgt), Math.max(1.2, 0.35 * k)); }
      if (shop || (tower && pick > 0.7)) {
        // a vertical blade sign near one end, standing off the wall
        const t = 0.12, base = Math.min(b.h - 0.5, shop ? 4.2 : b.h * 0.3), tall = Math.min(b.h - base - 0.3, shop ? 4.5 : 9);
        if (tall > 1.5) glowLine(at(t, base), at(t, base + tall), Math.max(1.6, 0.55 * k));
      }
      ctx.lineCap = 'butt';
    }
    // crisp edges: the wall's top and its corners
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(a.sx, a.sy - up); ctx.moveTo(d.sx, d.sy); ctx.lineTo(d.sx, d.sy - up); ctx.stroke();
  }
  // roof: zinc on houses (with a ridge), concrete with tanks and AC units on blocks, a lit crown on towers
  ctx.beginPath();
  pts.forEach((q, i) => { if (i) ctx.lineTo(q.sx, q.sy - up); else ctx.moveTo(q.sx, q.sy - up); });
  ctx.closePath();
  ctx.fillStyle = house ? ROOFS_ZINC[Math.floor(b.tone * 13) % ROOFS_ZINC.length] : tower ? DAY.glassRoof : DAY.roofs[Math.floor(b.tone * DAY.roofs.length)];
  ctx.fill();
  ctx.strokeStyle = DAY.outline; ctx.lineWidth = 1; ctx.stroke();
  if (!house && detailed) {
    // the parapet: a low wall round the edge of a flat roof, its top lit
    const lip = 0.8 * k * c.rise;
    ctx.strokeStyle = 'rgba(20,22,28,0.7)'; ctx.lineWidth = Math.max(1.5, 0.45 * k);
    ctx.beginPath(); pts.forEach((q, i) => { if (i) ctx.lineTo(q.sx, q.sy - up - lip * 0.5); else ctx.moveTo(q.sx, q.sy - up - lip * 0.5); }); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = tower ? 'rgba(0,240,255,0.7)' : 'rgba(150,155,165,0.6)'; ctx.lineWidth = Math.max(1, 0.22 * k);
    ctx.beginPath(); pts.forEach((q, i) => { if (i) ctx.lineTo(q.sx, q.sy - up - lip); else ctx.moveTo(q.sx, q.sy - up - lip); }); ctx.closePath(); ctx.stroke();
  }
  if (!house && detailed && b.area > 150) {
    // a stair hut on the roof: a little box with a door
    const hx = b.cx + ((b.tone * 13.7) % 1 - 0.5) * (b.maxX - b.minX) * 0.3, hz = b.cz + ((b.tone * 7.9) % 1 - 0.5) * (b.maxZ - b.minZ) * 0.3;
    const hw = 1.6, hh2 = 2.6;
    const corners = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]].map(([ox, oz]) => toScreen(c, hx + ox, hz + oz, b.h));
    const lift = hh2 * k * c.rise;
    // its two camera-facing sides, then its top
    const order = [0, 1, 2, 3].map((i) => ({ i, d: depth(c, hx + [-hw, hw, hw, -hw][i], hz + [-hw, -hw, hw, hw][i]) }));
    for (let e = 0; e < 4; e++) {
      const q0 = corners[e], q1 = corners[(e + 1) % 4];
      const mid = (order[e].d + order[(e + 1) % 4].d) / 2;
      if (mid < depth(c, hx, hz)) continue;
      ctx.beginPath(); ctx.moveTo(q0.sx, q0.sy); ctx.lineTo(q1.sx, q1.sy); ctx.lineTo(q1.sx, q1.sy - lift); ctx.lineTo(q0.sx, q0.sy - lift); ctx.closePath();
      ctx.fillStyle = e % 2 ? '#40444C' : '#4D525A'; ctx.fill();
    }
    ctx.beginPath(); corners.forEach((q, i) => { if (i) ctx.lineTo(q.sx, q.sy - lift); else ctx.moveTo(q.sx, q.sy - lift); }); ctx.closePath();
    ctx.fillStyle = '#565B63'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
  }
  const top = toScreen(c, b.cx, b.cz, b.h);
  if (house && detailed) {
    // ridge along the longer side, and corrugation lines
    const wide = b.maxX - b.minX > b.maxZ - b.minZ;
    const r0 = wide ? toScreen(c, b.minX + 1, b.cz, b.h) : toScreen(c, b.cx, b.minZ + 1, b.h);
    const r1 = wide ? toScreen(c, b.maxX - 1, b.cz, b.h) : toScreen(c, b.cx, b.maxZ - 1, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1, 0.25 * k);
    ctx.beginPath(); ctx.moveTo(r0.sx, r0.sy); ctx.lineTo(r1.sx, r1.sy); ctx.stroke();
  }
  if (b.tanks && detailed) {
    // black water tanks (and a grey AC unit) on the roof -- every Lagos rooftop has them
    for (let t = 0; t < b.tanks; t++) {
      const ox = ((b.tone * (t + 3) * 7.3) % 1 - 0.5) * Math.min(8, (b.maxX - b.minX) * 0.5);
      const oz = ((b.tone * (t + 5) * 3.1) % 1 - 0.5) * Math.min(8, (b.maxZ - b.minZ) * 0.5);
      const q = toScreen(c, b.cx + ox, b.cz + oz, b.h);
      const r = 0.75 * k, hh = 1.4 * k * c.rise;
      ctx.fillStyle = '#1F2328'; ctx.fillRect(q.sx - r, q.sy - hh, r * 2, hh);
      ctx.beginPath(); ctx.ellipse(q.sx, q.sy - hh, r, r * c.tilt, 0, 0, Math.PI * 2); ctx.fillStyle = '#3A4048'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(q.sx, q.sy, r, r * c.tilt, 0, 0, Math.PI); ctx.fillStyle = '#1F2328'; ctx.fill();
      if (t === 0) { ctx.fillStyle = '#B8C0CA'; ctx.fillRect(q.sx + 1.5 * k, q.sy - 0.7 * k * c.rise, 1.2 * k, 0.7 * k * c.rise); }
    }
  }
  if (tower && detailed) {
    // a crown band at the top
    const crown = NEON[Math.floor(b.tone * 31) % NEON.length];
    ctx.strokeStyle = crown; ctx.globalAlpha = night ? 1 : 0.85; ctx.lineWidth = Math.max(1.5, 0.5 * k);
    ctx.beginPath(); pts.forEach((q, i) => { const y = q.sy - up + 1.2 * k * c.rise; if (i) ctx.lineTo(q.sx, y); else ctx.moveTo(q.sx, y); }); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  void top;
}
/** which of [n] baked headings to show for a world heading, as this camera sees it */
const view = (c: Cam, heading: number, n: number) => ((Math.round((screenHeading(c, heading) / (Math.PI * 2)) * n) % n) + n) % n;
function picture(ctx: CanvasRenderingContext2D, c: Cam, s: Sprite) {
  const { sx, sy } = toScreen(c, s.x, s.z, s.lift ?? 0);
  if (s.hero) {
    const pitch = Math.asin(c.tilt);
    let row = 0; HERO_PITCHES.forEach((p, k) => { if (Math.abs(p - pitch) < Math.abs(HERO_PITCHES[row] - pitch)) row = k; });
    const sheet = img(`people/${s.hero.who}-${s.hero.anim}-p${'abcd'[row]}.webp`);
    if (sheet.complete && sheet.naturalWidth) {
      const size = 2 * heroHalf(HERO_PITCHES[row]) * HERO_SIZE * c.scale;
      const f = Math.floor(s.hero.frame) % HERO_FRAMES[s.hero.anim];
      ctx.fillStyle = 'rgba(20,30,50,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy, size * 0.14, size * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(sheet, f * HERO_CELL, view(c, s.heading ?? 0, 8) * HERO_CELL, HERO_CELL, HERO_CELL, sx - size / 2, sy - size * HERO_FEET, size, size);
    }
    return;
  }
  if (s.veh) {
    const sheet = img(`vehicles/${s.s}.webp`);
    if (!sheet.complete || !sheet.naturalWidth) return;
    const span = VEH_SPAN[s.s] ?? 6, size = span * VEH_SIZE * c.scale;
    // the baked pitch nearest the camera's, and the nearest of 32 headings; the small leftovers are
    // made up by turning the picture a few degrees and stretching it to the camera's exact tilt
    const pitch = Math.asin(c.tilt);
    let row = 0; VEH_PITCHES.forEach((p, k) => { if (Math.abs(p - pitch) < Math.abs(VEH_PITCHES[row] - pitch)) row = k; });
    const want = screenHeading(c, s.heading ?? 0), step = (Math.PI * 2) / VEH_DIRS;
    const i = ((Math.round(want / step) % VEH_DIRS) + VEH_DIRS) % VEH_DIRS;
    const twist = want - Math.round(want / step) * step;
    const stretch = c.tilt / Math.sin(VEH_PITCHES[row]);
    const ground = vehGround(span, VEH_PITCHES[row]);
    // a soft shadow pooled under the body
    const sh = screenHeading(c, s.heading ?? 0);
    const len = (VEH_SPAN[s.s] ?? 6) * 0.42 * c.scale, wid = len * 0.45;
    ctx.save(); ctx.translate(sx, sy + 0.25 * c.scale); ctx.scale(1, c.tilt); ctx.rotate(-sh);
    ctx.fillStyle = 'rgba(15,22,38,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, wid, len, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-twist * 0.5); ctx.scale(1, 0.5 + 0.5 * stretch);
    ctx.drawImage(sheet, i * VEH_CELL, row * VEH_CELL, VEH_CELL, VEH_CELL, -size / 2, -size * ground, size, size);
    ctx.restore();
    return;
  }
  if (s.look) {
    const sh = screenHeading(c, s.heading ?? 0);
    drawPerson(ctx, sx, sy, c.scale, s.look, facingOf(Math.sin(sh), Math.cos(sh)), s.walk ?? null);
    return;
  }
  const im = img(s.s);
  if (!im.complete || !im.naturalWidth) return;
  const metres = (SIZE[s.s] ?? 4) * (s.scale ?? 1);
  const k = c.scale, longest = Math.max(im.naturalWidth, im.naturalHeight), f = (metres * k) / longest;
  const w = im.naturalWidth * f, h = im.naturalHeight * f;
  if (s.up) {
    ctx.drawImage(im, sx - w / 2, sy - h * 0.92, w, h);
  } else {
    // top-down things on the water (boats): turned with the camera
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, c.tilt); ctx.rotate((s.rot ?? 0) + c.yaw);
    ctx.shadowColor = 'rgba(15,22,38,0.35)'; ctx.shadowBlur = Math.max(2, 0.5 * k); ctx.shadowOffsetY = 0.5 * k;
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
/** A landmark: its picture standing over its real spot, [width] metres across. */
export function landmarkSprite(id: string, sprite: string, x: number, z: number, width: number): Sprite & { id: string } {
  return { id, s: sprite, x, z, up: true, scale: width / (SIZE[sprite] ?? 4) };
}
/** Night, step 1 -- the ground: dimmed, then the neon kerb strips and the pools of light on the road.
 *  (Buildings and people are drawn after this, on their own dimmed layer, so they stand in front of the neon.) */
export function nightGround(ctx: CanvasRenderingContext2D, c: Cam, tiles: Tile[], pools: Light[], v: View) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#2A1F55';
  ctx.fillRect(0, 0, c.w, c.h);
  ctx.globalCompositeOperation = 'lighter';
  const k = c.scale;
  for (const lifted of [false, true]) {
    ctx.save(); worldSpace(ctx, c, lifted ? 7 : 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const t of tiles) for (const r of t.roads) {
      if (r.bridge !== lifted || r.kind > KIND.secondary || !inView(v, r.minX, r.maxX, r.minZ, r.maxZ)) continue;
      for (const [side, color] of [[-1, 'rgba(255,60,200,0.4)'], [1, 'rgba(40,220,255,0.4)']] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1 / k, 0.35);
        ctx.beginPath(); offsetPath(ctx, r, (r.w / 2 - 0.3) * side); ctx.stroke();
      }
    }
    ctx.restore();
  }
  glows(ctx, c, pools, v);
  ctx.restore();
}
/** Night, step 2 -- the upright layer (buildings, people, vehicles, props) drawn on its own canvas is dimmed where it has anything. */
export function nightTint(layer: CanvasRenderingContext2D, c: Cam) {
  layer.save();
  layer.globalCompositeOperation = 'source-atop';
  layer.fillStyle = 'rgba(18,10,48,0.55)';
  layer.fillRect(0, 0, c.w, c.h);
  layer.restore();
}
/** Night, step 3 -- what glows in the air: lamp heads, headlights, the landmarks' light. */
export function nightLights(ctx: CanvasRenderingContext2D, c: Cam, lights: Light[], v: View, tiles: Tile[]) {
  // a light behind a building (from the camera) is hidden by it
  const fronts: { d: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const t of tiles) for (const b of t.blds) {
    if (b.hide || !inView(v, b.minX, b.maxX, b.minZ, b.maxZ)) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, d = -Infinity;
    for (let i = 0; i < b.p.length; i += 2) {
      const q = toScreen(c, b.p[i], b.p[i + 1]);
      x0 = Math.min(x0, q.sx); x1 = Math.max(x1, q.sx); y1 = Math.max(y1, q.sy); y0 = Math.min(y0, q.sy - b.h * c.scale * c.rise);
      d = Math.max(d, depth(c, b.p[i], b.p[i + 1]));
    }
    fronts.push({ d, x0, x1, y0, y1 });
  }
  const seen = lights.filter((l) => {
    const { sx, sy } = toScreen(c, l.x, l.z, l.y ?? 0), d = depth(c, l.x, l.z);
    return !fronts.some((f) => f.d > d + 1 && sx > f.x0 + 2 && sx < f.x1 - 2 && sy > f.y0 + 2 && sy < f.y1);
  });
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; glows(ctx, c, seen, v); ctx.restore();
}
export type Light = { x: number; z: number; r: number; color: string; y?: number };
function glows(ctx: CanvasRenderingContext2D, c: Cam, lights: Light[], v: View) {
  const k = c.scale;
  for (const l of lights) {
    if (l.x < v.minX || l.x > v.maxX || l.z < v.minZ || l.z > v.maxZ) continue;
    const { sx, sy } = toScreen(c, l.x, l.z, l.y ?? 0);
    const R = l.r * k;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, l.color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
  }
}
/** Low cameras look far up the street: the distance fades into a pale haze (a deep blue one at night). */
export function drawHaze(ctx: CanvasRenderingContext2D, c: Cam, night: boolean) {
  // (the colour grade over the whole view is a page layer in Lagos2D, cheaper than painting it each frame)
  const s = Math.max(0, Math.min(1, (0.62 - c.tilt) / 0.32));
  if (!s) return;
  const g = ctx.createLinearGradient(0, 0, 0, c.h * 0.55);
  g.addColorStop(0, night ? `rgba(30,10,52,${0.95 * s})` : `rgba(196,150,96,${0.92 * s})`);
  g.addColorStop(0.45, night ? `rgba(30,10,52,${0.5 * s})` : `rgba(196,150,96,${0.42 * s})`);
  g.addColorStop(1, night ? 'rgba(30,10,52,0)' : 'rgba(196,150,96,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.w, c.h * 0.55);
}