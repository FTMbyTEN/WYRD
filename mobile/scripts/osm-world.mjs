// Builds WYRD's Lagos from OpenStreetMap: roads (with names, types and bridges), building
// footprints and water, cut into square tiles in local metres around Ojuelegba junction and
// written to public/world/v1/ for the open world to stream.
//
//   node scripts/osm-world.mjs <south> <west> <north> <east>      (default: ~3 km round Ojuelegba)
//   e.g. the core districts (Ojuelegba to Lagos Island and Ikoyi): 6.435 3.340 6.535 3.450
//
// Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).
// The tiles are a derived database and are shared under the same licence (see ATTRIBUTION below).
// Downloads are paced, to be a polite user of the public Overpass service.
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = { lat: 6.50955, lon: 3.36395 }; // Ojuelegba junction: Western Avenue over Ojuelegba Road
const TILE = 500; // metres
const OUT = path.resolve('public/world/v1');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const ATTRIBUTION = 'Map data © OpenStreetMap contributors (ODbL). https://www.openstreetmap.org/copyright';

const [s, w, n, e] = process.argv.slice(2).map(Number);
const box = Number.isFinite(s) ? { s, w, n, e } : { s: 6.4955, w: 3.3500, n: 6.5235, e: 3.3780 };

const KX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180), KZ = 110540;
const toX = (lon) => (lon - ORIGIN.lon) * KX;
const toZ = (lat) => -(lat - ORIGIN.lat) * KZ; // north is -z
const toLon = (x) => ORIGIN.lon + x / KX;
const toLat = (z) => ORIGIN.lat - z / KZ;

// road kinds, their widths in metres, and a code for the tile file
const ROADS = {
  motorway: [0, 20], trunk: [1, 16], primary: [2, 13], secondary: [3, 10], tertiary: [4, 8.5],
  motorway_link: [5, 8], trunk_link: [5, 8], primary_link: [5, 7], secondary_link: [5, 6.5], tertiary_link: [5, 6],
  residential: [6, 6.5], unclassified: [6, 6.5], living_street: [6, 5], service: [7, 4.5], pedestrian: [8, 4], footway: [8, 2], path: [8, 1.8], steps: [8, 2],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function overpass(q) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'WYRD-world/1.0 (open-world game; tiles cached, fetched once)', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (res.status === 429 || res.status >= 500) { await sleep(8000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`  retry ${attempt + 1}: ${err.message}`);
      await sleep(5000 * (attempt + 1));
    }
  }
  throw new Error('Overpass kept failing');
}

const hash = (x, z) => { const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); };
// Lagos buildings rarely carry a floor count in OSM: estimate from footprint (big footprints go
// taller), with some variety; a real building:levels / height always wins
function levels(tags, area, cx, cz) {
  if (tags['building:levels']) return Math.min(40, Math.max(1, parseInt(tags['building:levels'], 10) || 1));
  if (tags.height) return Math.max(1, Math.round(parseFloat(tags.height) / 3.2));
  const r = hash(cx, cz);
  if (['church', 'mosque', 'warehouse', 'industrial', 'hangar'].includes(tags.building)) return 2;
  if (area < 50) return 1 + (r > 0.6 ? 1 : 0);
  if (area < 140) return 2 + (r > 0.7 ? 1 : 0);
  if (area < 400) return 2 + Math.floor(r * 3);
  if (area < 1500) return 3 + Math.floor(r * 3);
  return 4 + Math.floor(r * 6);
}
const polyArea = (pts) => { let a = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; } return Math.abs(a) / 2; };

fs.mkdirSync(OUT, { recursive: true });
const x0 = Math.floor(toX(box.w) / TILE), x1 = Math.floor(toX(box.e) / TILE);
const z0 = Math.floor(toZ(box.n) / TILE), z1 = Math.floor(toZ(box.s) / TILE);
console.log(`tiles ${x0}..${x1} x ${z0}..${z1} (${(x1 - x0 + 1) * (z1 - z0 + 1)} tiles of ${TILE} m)`);
const indexPath = path.join(OUT, 'index.json');
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { origin: ORIGIN, tile: TILE, attribution: ATTRIBUTION, tiles: [] };
const have = new Set(index.tiles);
let skipped = 0;

// the map is fetched in blocks of CHUNK x CHUNK tiles (one request each), then cut into tiles here
const CHUNK = 4;
for (let cx = x0; cx <= x1; cx += CHUNK) {
  for (let cz = z0; cz <= z1; cz += CHUNK) {
    const missing = [];
    for (let tx = cx; tx < Math.min(cx + CHUNK, x1 + 1); tx++) for (let tz = cz; tz < Math.min(cz + CHUNK, z1 + 1); tz++) {
      const key = `${tx}_${tz}`;
      if (!(have.has(key) && fs.existsSync(path.join(OUT, `${key}.json`)))) missing.push([tx, tz]);
    }
    if (!missing.length) continue;
    const ex = Math.min(cx + CHUNK, x1 + 1), ez = Math.min(cz + CHUNK, z1 + 1);
    const south = toLat(ez * TILE), north = toLat(cz * TILE), west = toLon(cx * TILE), east = toLon(ex * TILE);
    const bb = `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
    process.stdout.write(`block ${cx}_${cz} (${missing.length} tiles) … `);
    let data;
    try {
      data = await overpass(`[out:json][timeout:180];(way["highway"](${bb});way["building"](${bb});way["natural"="water"](${bb});way["waterway"](${bb});way["railway"="rail"](${bb}););out geom;`);
    } catch (err) {
      // the public server is having a bad moment: skip this block; the next run fetches what is missing
      console.log(`skipped (${err.message})`);
      skipped += missing.length;
      await sleep(20000);
      continue;
    }
    // every element once, in metres, with its bounds
    const els = [];
    for (const el of data.elements) {
      if (!el.geometry || !el.tags) continue;
      const pts = []; for (const g of el.geometry) pts.push(toX(g.lon), toZ(g.lat));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minZ = Math.min(minZ, pts[i + 1]); maxZ = Math.max(maxZ, pts[i + 1]); }
      els.push({ t: el.tags, pts, minX, maxX, minZ, maxZ });
    }
    let total = 0;
    for (const [tx, tz] of missing) {
      const key = `${tx}_${tz}`;
      const ox = tx * TILE, oz = tz * TILE; // tile origin; coordinates stored as decimetres from it
      const q = (v, o) => Math.round((v - o) * 10);
      const touches = (e) => e.maxX >= ox && e.minX <= ox + TILE && e.maxZ >= oz && e.minZ <= oz + TILE;
      const names = [], nameIdx = new Map();
      const nameOf = (n) => { if (!n) return -1; if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); } return nameIdx.get(n); };
      const roads = [], buildings = [], water = [], rail = [];
      for (const e of els) {
        if (!touches(e)) continue;
        const t = e.t, pts = e.pts.slice();
        if (t.highway && ROADS[t.highway]) {
          const [code, width] = ROADS[t.highway];
          const lanes = parseInt(t.lanes, 10);
          const wdt = Number.isFinite(lanes) ? Math.max(width, lanes * 3.4) : width;
          const bridge = t.bridge && t.bridge !== 'no' ? Math.max(1, parseInt(t.layer, 10) || 1) : 0;
          const enc = [code, Math.round(wdt * 10), bridge, nameOf(t.name), t.oneway === 'yes' ? 1 : 0];
          for (let i = 0; i < pts.length; i += 2) enc.push(q(pts[i], ox), q(pts[i + 1], oz));
          roads.push(enc);
        } else if (t.building) {
          if (pts.length >= 8 && pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1]) pts.splice(-2); // closed ring: drop the repeat
          const area = polyArea(pts);
          if (area < 8 || pts.length < 6) continue;
          let bx = 0, bz = 0; for (let i = 0; i < pts.length; i += 2) { bx += pts[i]; bz += pts[i + 1]; }
          bx /= pts.length / 2; bz /= pts.length / 2;
          // a building belongs to the tile its centre is in (so none is drawn twice)
          if (Math.floor(bx / TILE) !== tx || Math.floor(bz / TILE) !== tz) continue;
          const enc = [levels(t, area, bx, bz)];
          for (let i = 0; i < pts.length; i += 2) enc.push(q(pts[i], ox), q(pts[i + 1], oz));
          buildings.push(enc);
        } else if (t.natural === 'water') {
          const enc = []; for (let i = 0; i < pts.length; i += 2) enc.push(q(pts[i], ox), q(pts[i + 1], oz));
          water.push(enc);
        } else if (t.waterway) {
          const enc = [Math.round((t.waterway === 'canal' || t.waterway === 'river' ? 10 : 3) * 10)];
          for (let i = 0; i < pts.length; i += 2) enc.push(q(pts[i], ox), q(pts[i + 1], oz));
          water.push(enc);
        } else if (t.railway === 'rail') {
          const enc = []; for (let i = 0; i < pts.length; i += 2) enc.push(q(pts[i], ox), q(pts[i + 1], oz));
          rail.push(enc);
        }
      }
      fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify({ x: tx, z: tz, names, roads, buildings, water, rail }));
      have.add(key);
      total += buildings.length;
    }
    index.tiles = [...have].sort();
    fs.writeFileSync(indexPath, JSON.stringify(index));
    console.log(`${els.length} features, ${total} buildings`);
    await sleep(3000);
  }
}
console.log(`done: ${index.tiles.length} tiles in ${OUT}${skipped ? ` (${skipped} skipped: run again to fetch them)` : ""}`);
