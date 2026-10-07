// The whole of NAIJA 2099's Lagos at a glance, for the in-game city map: every main road (down to
// tertiary), rail and mapped water from all the world tiles, simplified to ~12 m and stored in
// metres/10 as one small file, public/world2d/overview.json.
//   node scripts/overview2d.mjs      (run again after downloading more tiles)
// Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('public/world/v1');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const T = index.tile;

function simplify(pts, tol) {
  if (pts.length < 6) return pts;
  const n = pts.length / 2, keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], az = pts[a * 2 + 1], bx = pts[b * 2], bz = pts[b * 2 + 1], L = Math.hypot(bx - ax, bz - az) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i * 2] - ax) * (bz - az) - (pts[i * 2 + 1] - az) * (bx - ax)) / L; if (d > max) { max = d; idx = i; } }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}
const enc = (pts) => pts.map((v) => Math.round(v / 10)); // 10 m units (the map is drawn small)

const roads = [[], [], [], [], []]; // by kind: motorway, trunk, primary, secondary, tertiary
const rail = [], water = [];
const seen = new Set();
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const key of index.tiles) {
  const f = path.join(DIR, `${key}.json`);
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ox = d.x * T, oz = d.z * T;
  minX = Math.min(minX, ox); maxX = Math.max(maxX, ox + T); minZ = Math.min(minZ, oz); maxZ = Math.max(maxZ, oz + T);
  for (const r of d.roads) {
    const kind = r[0];
    if (kind > 4) continue;
    const pts = [];
    for (let i = 5; i + 1 < r.length; i += 2) pts.push(r[i] / 10 + ox, r[i + 1] / 10 + oz);
    if (pts.length < 4) continue;
    const sig = pts.slice(0, 2).concat(pts.slice(-2)).map(Math.round).join(',');
    if (seen.has(sig)) continue; // the same street in two tiles
    seen.add(sig);
    roads[kind].push(enc(simplify(pts, kind <= 2 ? 8 : 12)));
  }
  for (const r of d.rail) { const pts = []; for (let i = 0; i + 1 < r.length; i += 2) pts.push(r[i] / 10 + ox, r[i + 1] / 10 + oz); if (pts.length >= 4) rail.push(enc(simplify(pts, 12))); }
  for (const w of d.water) {
    if (w.length % 2 === 1) { const pts = []; for (let i = 1; i + 1 < w.length; i += 2) pts.push(w[i] / 10 + ox, w[i + 1] / 10 + oz); if (pts.length >= 4) water.push({ w: w[0] / 10, p: enc(simplify(pts, 12)) }); }
    else { const pts = []; for (let i = 0; i + 1 < w.length; i += 2) pts.push(w[i] / 10 + ox, w[i + 1] / 10 + oz); if (pts.length >= 6) water.push({ w: 0, p: enc(simplify(pts, 12)) }); }
  }
}
const out = { attribution: index.attribution, bounds: [minX, minZ, maxX, maxZ], roads, rail, water };
fs.writeFileSync(path.resolve('public/world2d/overview.json'), JSON.stringify(out));
console.log(`roads ${roads.map((r) => r.length).join('/')}, rail ${rail.length}, water ${water.length}, ${(fs.statSync('public/world2d/overview.json').size / 1024).toFixed(0)} KB`);
