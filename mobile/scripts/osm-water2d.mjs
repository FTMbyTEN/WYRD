// The big water of Lagos for the 2D game: the Atlantic and the lagoons, built from OpenStreetMap's
// coastline (land always on its left), plus mapped lakes and creeks. In the same local metres as the
// world tiles (origin Ojuelegba, x east, z south), simplified to ~3 m.
//
// How: the coastline ways are joined end to end, cut to the map's frame, and each piece is closed
// into a land shape by walking anticlockwise round the frame to the next piece (as osmcoastline does).
// The game paints the frame as water, the land shapes over it, then lakes and creeks on top.
//
//   node scripts/osm-water2d.mjs
// Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = { lat: 6.50955, lon: 3.36395 };
const KX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180), KZ = 110540;
const toX = (lon) => (lon - ORIGIN.lon) * KX, toZ = (lat) => -(lat - ORIGIN.lat) * KZ;
const toLon = (x) => ORIGIN.lon + x / KX, toLat = (z) => ORIGIN.lat - z / KZ;
const OUT = path.resolve('public/world2d/water.json');

// the frame: the world tiles' extent (from the index), and a wider box to fetch so lines run past it
const index = JSON.parse(fs.readFileSync(path.resolve('public/world/v1/index.json'), 'utf8'));
let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity;
for (const t of index.tiles) { const [x, z] = t.split('_').map(Number); fx0 = Math.min(fx0, x * 500); fx1 = Math.max(fx1, x * 500 + 500); fz0 = Math.min(fz0, z * 500); fz1 = Math.max(fz1, z * 500 + 500); }
const pad = 3000;
const bb = `${toLat(fz1 + pad)},${toLon(fx0 - pad)},${toLat(fz0 - pad)},${toLon(fx1 + pad)}`;

const q = `[out:json][timeout:300];(way["natural"="coastline"](${bb});relation["natural"="water"](${bb});way["natural"="water"](${bb});way["natural"~"^(beach|sand)$"](${bb});relation["natural"~"^(beach|sand)$"](${bb}););out geom;`;
let data;
for (let i = 0; i < 8 && !data; i++) {
  try {
    const res = await fetch(['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'][i % 2], {
      method: 'POST', headers: { 'User-Agent': 'WYRD-world/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    const text = await res.text();
    if (res.ok && text.startsWith('{')) data = JSON.parse(text); else await new Promise((r) => setTimeout(r, 10000 * (i + 1)));
  } catch { await new Promise((r) => setTimeout(r, 10000 * (i + 1))); }
}
if (!data) throw new Error('Overpass kept failing');

// work in (x, y) with y pointing NORTH (y = -z), so "anticlockwise" means what it usually does
const pt = (g) => [toX(g.lon), -toZ(g.lat)];
const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
function stitch(lines) {
  const pool = lines.map((l) => l.slice()), out = [];
  while (pool.length) {
    let cur = pool.pop(), grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        if (key(cur[cur.length - 1]) === key(l[0])) cur = cur.concat(l.slice(1));
        else if (key(cur[0]) === key(l[l.length - 1])) cur = l.concat(cur.slice(1));
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    out.push(cur);
  }
  return out;
}

const X0 = fx0, X1 = fx1, Y0 = -fz1, Y1 = -fz0; // the frame, y north
const inside = (p) => p[0] >= X0 && p[0] <= X1 && p[1] >= Y0 && p[1] <= Y1;
// where segment a->b crosses the frame (first crossing from a), as a point
function cross(a, b) {
  let best = null, bt = Infinity;
  const edges = [[X0, 'x'], [X1, 'x'], [Y0, 'y'], [Y1, 'y']];
  for (const [v, axis] of edges) {
    const i = axis === 'x' ? 0 : 1, j = 1 - i;
    const d = b[i] - a[i]; if (!d) continue;
    const t = (v - a[i]) / d; if (t < 0 || t > 1) continue;
    const o = a[j] + (b[j] - a[j]) * t;
    const lo = axis === 'x' ? Y0 : X0, hi = axis === 'x' ? Y1 : X1;
    if (o < lo - 1e-6 || o > hi + 1e-6) continue;
    if (t < bt) { bt = t; best = axis === 'x' ? [v, o] : [o, v]; }
  }
  return best;
}
// cut a line into the runs that lie inside the frame (each starts and ends on the frame edge)
function clip(line) {
  const runs = []; let cur = null;
  for (let k = 0; k < line.length; k++) {
    const p = line[k], prev = line[k - 1];
    if (inside(p)) {
      if (!cur) { cur = prev ? [cross(prev, p) ?? p] : [p]; }
      cur.push(p);
    } else if (cur) { cur.push(cross(p, cur[cur.length - 1]) ?? cur[cur.length - 1]); runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}
// position anticlockwise round the frame, from the bottom-left corner
const P = 2 * (X1 - X0) + 2 * (Y1 - Y0);
function along(p) {
  const [x, y] = p, e = 1e-3;
  if (Math.abs(y - Y0) < e) return x - X0;                                   // bottom, going east
  if (Math.abs(x - X1) < e) return (X1 - X0) + (y - Y0);                      // right, going north
  if (Math.abs(y - Y1) < e) return (X1 - X0) + (Y1 - Y0) + (X1 - x);          // top, going west
  return 2 * (X1 - X0) + (Y1 - Y0) + (Y1 - y);                                // left, going south
}
const corners = [[X0, Y0, 0], [X1, Y0, X1 - X0], [X1, Y1, (X1 - X0) + (Y1 - Y0)], [X0, Y1, 2 * (X1 - X0) + (Y1 - Y0)]];

const coast = [], lakes = [], holes = [], beaches = [];
for (const el of data.elements) {
  const isBeach = el.tags && /^(beach|sand)$/.test(el.tags.natural ?? '');
  if (el.type === 'way' && el.tags?.natural === 'coastline') coast.push(el.geometry.map(pt));
  else if (isBeach && el.type === 'way' && el.geometry?.length > 3) beaches.push(el.geometry.map(pt));
  else if (isBeach && el.type === 'relation') { const outer = []; for (const m of el.members ?? []) if (m.geometry && m.role !== 'inner') outer.push(m.geometry.map(pt)); beaches.push(...stitch(outer).filter((r) => r.length > 3)); }
  else if (el.type === 'way' && el.geometry?.length > 3) lakes.push(el.geometry.map(pt));
  else if (el.type === 'relation') {
    const outer = [], inner = [];
    for (const m of el.members ?? []) if (m.geometry) (m.role === 'inner' ? inner : outer).push(m.geometry.map(pt));
    lakes.push(...stitch(outer).filter((r) => r.length > 3));
    holes.push(...stitch(inner).filter((r) => r.length > 3));
  }
}
const lines = stitch(coast);
const islands = lines.filter((l) => l.length > 3 && key(l[0]) === key(l[l.length - 1]) && l.some(inside)); // closed rings: land wholly inside
// a run must start and end on the frame's edge (a line that stops inside the frame is incomplete data: dropped)
const onEdge = (p) => Math.min(Math.abs(p[0] - X0), Math.abs(p[0] - X1), Math.abs(p[1] - Y0), Math.abs(p[1] - Y1)) < 0.01;
const runs = lines.filter((l) => key(l[0]) !== key(l[l.length - 1])).flatMap(clip).filter((r) => onEdge(r[0]) && onEdge(r[r.length - 1]));
// close each run into land: from its exit, anticlockwise round the frame to the next entry
const land = [], used = new Set();
for (let s = 0; s < runs.length; s++) {
  if (used.has(s)) continue;
  const poly = []; let r = s, guard = 0;
  while (guard++ < runs.length + 2) {
    used.add(r); poly.push(...runs[r]);
    const exitT = along(runs[r][runs[r].length - 1]);
    let next = -1, bestD = Infinity;
    for (let k = 0; k < runs.length; k++) {
      const d = (along(runs[k][0]) - exitT + P) % P;
      if (d < bestD && (!used.has(k) || k === s)) { bestD = d; next = k; }
    }
    if (next < 0) break;
    for (const [cx, cy, ct] of [...corners, ...corners.map(([a, b, t]) => [a, b, t + P])]) {
      const d = ct - exitT; if (d > 0 && d < bestD) poly.push([cx, cy]);
    }
    if (next === s) break;
    r = next;
  }
  land.push(poly);
}

function simplify(pts, tol = 3) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * (by - ay) - (pts[i][1] - ay) * (bx - ax)) / L; if (d > max) { max = d; idx = i; } }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// back to the game's frame: z south, metres x10
const enc = (r) => simplify(r).flatMap(([x, y]) => [Math.round(x * 10), Math.round(-y * 10)]);
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
const json = {
  attribution: 'Map data © OpenStreetMap contributors (ODbL)',
  // painted in this order: the frame as water, then land, then islands, then lakes, then islands in lakes
  frame: enc([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]),
  land: land.filter((r) => Math.abs(area(r)) > 2000).map(enc),
  islands: islands.map(enc),
  water: lakes.filter((r) => Math.abs(area(r)) > 400).map(enc),
  lakeIslands: holes.filter((r) => Math.abs(area(r)) > 400).map(enc),
  // the Atlantic beach: the stretches of coastline facing the open ocean (south of ~6.432 N), drawn as a sand strip
  beachLines: runs.flatMap((r) => { const out = []; let cur = []; for (const p of r) { const lat = toLat(-p[1]); if (lat < 6.432) cur.push(p); else { if (cur.length > 3) out.push(cur); cur = []; } } if (cur.length > 3) out.push(cur); return out; }).map((l) => simplify(l, 4).flatMap(([x, y]) => [Math.round(x * 10), Math.round(-y * 10)])),
  // the beaches and sandbanks: painted as sand over the land
  sand: beaches.filter((r) => Math.abs(area(r)) > 300).map(enc),
  // sanity: the share of the frame that is land
  landShare: +(land.reduce((n, r) => n + Math.abs(area(r)), 0) / ((X1 - X0) * (Y1 - Y0))).toFixed(3),
};
fs.writeFileSync(OUT, JSON.stringify(json));
console.log(`coast lines ${lines.length}, runs ${runs.length}, land ${json.land.length} (share ${json.landShare}), islands ${islands.length}, lakes ${json.water.length}, sand ${json.sand.length}, beach lines ${json.beachLines.length}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
