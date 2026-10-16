// LAGOS ISLAND's map, baked once into one small file for the canvas game
// (wyrd_server/web/pages/lagos-island-map.json, served at /lagos-island/map.json).
//
// Less is more: no tiles and no buildings -- the land, the water, the main roads and the island's icons,
// in metres from Tafawa Balewa Square (x east, z south). Only the island side of Lagos is kept, from
// Ilashe in the west to Ajah in the east (the ISLAND outline below); the mainland stays in cold storage
// with NAIJA 2099.
//
// Sources, all already in this repo:
//   public/world2d/water.json    coastline land and mapped water (decimetres from Ojuelegba)
//   public/world2d/overview.json main roads (10 m units from Ojuelegba)
//   scripts/.osm/lekki-ajah.json Lekki to Ajah, past where those end (scripts/osm-lekki-ajah.mjs)
//
//   node scripts/lagos-island.mjs
// Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('../../wyrd_serverpod/wyrd/wyrd_server/web/pages/lagos-island-map.json');

// the old maps' origin (Ojuelegba) and the island's (Tafawa Balewa Square)
const OLD = { lat: 6.50955, lon: 3.36395 };
const NEW = { lat: 6.4476, lon: 3.3986 };
const KX = (o) => 111320 * Math.cos((o.lat * Math.PI) / 180), KZ = 110540;
const oldToLL = (x, z) => [OLD.lat - z / KZ, OLD.lon + x / KX(OLD)];
const toXZ = ([lat, lon]) => [Math.round((lon - NEW.lon) * KX(NEW)), Math.round(-(lat - NEW.lat) * KZ)];

// The island side of Lagos, as [lat, lon]: the barrier beach from Ilashe to Lighthouse Beach, Lagos
// Island, Ikoyi, Victoria Island, Eko Atlantic and the Lekki peninsula to Ajah. Its north edge runs
// through the harbour, the channel past Apapa and Iddo, and the lagoon, so no mainland is inside.
const ISLAND = [
  // the barrier beach (Ilashe to Lighthouse Beach), then up the Commodore Channel and the harbour
  // channel, keeping Apapa and Iddo (mainland) to the west, round the top of Lagos Island
  [6.416, 3.270], [6.416, 3.390], [6.4375, 3.3985], [6.4425, 3.392], [6.445, 3.3875],
  [6.4475, 3.385], [6.450, 3.381], [6.455, 3.377], [6.4625, 3.376], [6.4665, 3.381], [6.4665, 3.392], [6.469, 3.392],
  [6.471, 3.416], [6.473, 3.440], [6.471, 3.468], [6.490, 3.500], [6.520, 3.520],
  [6.520, 3.605], [6.380, 3.605], [6.380, 3.270],
].map(toXZ);

function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const box = (pts) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, x1, z0, z1]; };
const IB = box(ISLAND);
const touches = (b) => b[0] < IB[1] && b[1] > IB[0] && b[2] < IB[3] && b[3] > IB[2];

// Douglas-Peucker, on [[x, z]]
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a], [bx, bz] = pts[b], L = Math.hypot(bx - ax, bz - az) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * (bz - az) - (pts[i][1] - az) * (bx - ax)) / L; if (d > max) { max = d; idx = i; } }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const flat = (pts) => pts.flat();

// The land is generated from the real shapes, not copied: simplified to its broad outline, then
// rounded by corner cutting (Chaikin), so the coast and the lagoon shores read as a game's clean,
// soft land -- and still cut exactly where the real ones do. Slivers too small to see are dropped.
function chaikin(pts, rounds) {
  let out = pts;
  for (let r = 0; r < rounds; r++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const [ax, az] = out[i], [bx, bz] = out[(i + 1) % out.length];
      next.push([Math.round(ax * 0.75 + bx * 0.25), Math.round(az * 0.75 + bz * 0.25)]);
      next.push([Math.round(ax * 0.25 + bx * 0.75), Math.round(az * 0.25 + bz * 0.75)]);
    }
    out = next;
  }
  return out;
}
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length]; a += x0 * z1 - x1 * z0; } return Math.abs(a / 2); };
const shape = (pts, tol) => { const p = simplify(pts, tol); return p.length > 2 ? simplify(chaikin(p, 2), 3) : p; };

// ---- land and water, west of where the repo's map ends (water.json, decimetres from Ojuelegba)
const water = JSON.parse(fs.readFileSync('public/world2d/water.json', 'utf8'));
const fromDm = (a) => { const out = []; for (let i = 0; i < a.length; i += 2) out.push(toXZ(oldToLL(a[i] / 10, a[i + 1] / 10))); return out; };
const land = [], wet = [];
for (const a of [...water.land, ...water.islands, ...water.lakeIslands]) { const p = shape(fromDm(a), 22); if (p.length > 2 && area(p) > 4000 && touches(box(p))) land.push(p); }
for (const a of water.water) { const p = shape(fromDm(a), 18); if (p.length > 2 && area(p) > 6000 && touches(box(p))) wet.push(p); }
const westEdgeLon = OLD.lon + (water.frame[2] / 10) / KX(OLD); // where water.json's frame ends (east)

// ---- Lekki to Ajah (the one download): the ocean coast, and the lagoon shore from the roads
const east = JSON.parse(fs.readFileSync('scripts/.osm/lekki-ajah.json', 'utf8')).elements;
const coast = east.find((e) => e.tags?.natural === 'coastline');
const start = westEdgeLon - 0.006, end = 3.605;
const coastLL = coast.geometry.map((g) => [g.lat, g.lon]).filter(([, lon]) => lon >= start && lon <= end).sort((a, b) => a[1] - b[1]);
// the lagoon shore: in each 0.004 degree strip, a little north of the northernmost main road
const roadsEast = east.filter((e) => e.tags?.highway);
const strips = new Map();
for (const r of roadsEast) for (const g of r.geometry) {
  if (g.lon < start || g.lon > end) continue;
  const k = Math.floor(g.lon / 0.004);
  strips.set(k, Math.max(strips.get(k) ?? -Infinity, g.lat));
}
const shore = [...strips.entries()].sort((a, b) => a[0] - b[0]).map(([k, lat]) => [lat + 0.0035, k * 0.004 + 0.002]);
// smooth the shore a little, so one long road doesn't make a spike
const smooth = shore.map((p, i) => [(shore[Math.max(0, i - 1)][0] + p[0] + shore[Math.min(shore.length - 1, i + 1)][0]) / 3, p[1]]);
const eastLand = [...coastLL, [coastLL[coastLL.length - 1][0], end], [smooth[smooth.length - 1][0], end], ...smooth.reverse(), [smooth[0][0], start], [coastLL[0][0], start]];
land.push(shape(eastLand.map(toXZ), 22));
for (const e of east.filter((e) => e.tags?.natural === 'water')) {
  const p = shape(e.geometry.map((g) => toXZ([g.lat, g.lon])), 18);
  if (p.length > 2 && area(p) > 6000) wet.push(p);
}

// ---- roads: the main ones (by kind: 0 motorway, 1 trunk, 2 primary, 3 secondary, 4 tertiary), cut to the island
const overview = JSON.parse(fs.readFileSync('public/world2d/overview.json', 'utf8'));
const roads = [];
const keepRuns = (pts, kind, name) => {
  let run = [];
  const flush = () => { if (run.length > 1) roads.push({ k: kind, n: name, p: flat(simplify(run, kind <= 2 ? 6 : 10)) }); run = []; };
  for (const p of pts) { if (inside(ISLAND, p[0], p[1])) run.push(p); else flush(); }
  flush();
};
overview.roads.forEach((list, kind) => {
  for (const enc of list) {
    const pts = [];
    for (let i = 0; i < enc.length; i += 2) {
      const [lat, lon] = oldToLL(enc[i] * 10, enc[i + 1] * 10);
      if (lon < westEdgeLon - 0.004) pts.push(toXZ([lat, lon]));
    }
    keepRuns(pts, kind, null);
  }
});
const KIND = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4 };
for (const r of roadsEast) {
  const kind = KIND[r.tags.highway.replace('_link', '')];
  const pts = r.geometry.filter((g) => g.lon >= westEdgeLon - 0.004).map((g) => toXZ([g.lat, g.lon]));
  keepRuns(pts, kind, r.tags.name ?? null);
}

// ---- the island's icons. Positions from OpenStreetMap where the repo has them (geo.ts and places);
// the ones marked ~ are well-known positions, to check against the map and correct.
const ICONS = [
  // Lagos Island
  ['tbs', 'Tafawa Balewa Square', 6.4476, 3.3986, 'square'],
  ['central-mosque', 'Lagos Central Mosque', 6.45738, 3.38814, 'faith'],
  ['cathedral', 'Cathedral Church of Christ', 6.45089, 3.39020, 'faith'],
  ['tinubu-square', 'Tinubu Square', 6.45384, 3.38944, 'square'],
  ['balogun', 'Balogun Market', 6.4553, 3.3903, 'market'],
  ['idumota', 'Idumota', 6.46294, 3.38669, 'market'],
  ['oba-palace', "Iga Idunganran (Oba's Palace)", 6.4615, 3.3842, 'palace'], // ~
  ['freedom-park', 'Freedom Park', 6.4497, 3.3994, 'park'], // ~
  ['museum', 'National Museum, Onikan', 6.4434, 3.4024, 'culture'], // ~
  ['glover-hall', 'Glover Memorial Hall', 6.4512, 3.3953, 'culture'], // ~
  ['city-hall', 'Lagos City Hall', 6.45065, 3.39714, 'civic'],
  ['independence-house', 'Independence House', 6.44876, 3.39853, 'tower'],
  ['necom-house', 'NECOM House', 6.44647, 3.39775, 'tower'],
  ['css-bookshop', 'CSS Bookshop', 6.4540, 3.3905, 'shop'],
  ['marina', 'The Marina', 6.45235, 3.38793, 'water'],
  ['obalende', 'Obalende Motor Park', 6.4467, 3.4085, 'transport'],
  // Ikoyi
  ['falomo', 'Falomo Shopping Centre', 6.44481, 3.42821, 'shop'],
  ['ikoyi-club', 'Ikoyi Club 1938', 6.4560, 3.4320, 'park'], // ~
  ['banana-island', 'Banana Island', 6.4660, 3.4510, 'home'], // ~
  ['link-bridge', 'Lekki-Ikoyi Link Bridge', 6.4400, 3.4436, 'bridge'],
  // Victoria Island and Eko Atlantic
  ['civic-centre', 'Lagos Civic Centre', 6.44012, 3.43087, 'civic'],
  ['eko-hotel', 'Eko Hotel', 6.42661, 3.43030, 'hotel'],
  ['federal-palace', 'Federal Palace Hotel', 6.43118, 3.40690, 'hotel'],
  ['muri-okunola', 'Muri Okunola Park', 6.43782, 3.42508, 'park'],
  ['kuramo', 'Kuramo Beach', 6.42627, 3.43034, 'beach'],
  ['bar-beach', 'Bar Beach', 6.4084, 3.4300, 'beach'],
  ['eko-atlantic', 'Eko Atlantic', 6.4067, 3.4106, 'tower'],
  ['oriental', 'Lagos Oriental Hotel', 6.43627, 3.44463, 'hotel'],
  ['landmark-beach', 'Landmark Beach', 6.4205, 3.4475, 'beach'], // ~ (Landmark Towers is 6.42362, 3.44782)
  // Lekki and the Coastal Road
  ['lekki-toll', 'Lekki Toll Gate', 6.43593, 3.44721, 'transport'],
  ['elegushi', 'Elegushi Beach', 6.4280, 3.4740, 'beach'], // ~
  ['nike-gallery', 'Nike Art Gallery', 6.43152, 3.48189, 'culture'],
  ['circle-mall', 'Circle Mall', 6.4383, 3.5165, 'shop'], // ~
  ['lekki-conservation', 'Lekki Conservation Centre', 6.4417, 3.5355, 'park'], // ~
  ['vgc', 'Victoria Garden City', 6.4610, 3.5520, 'home'], // ~
  ['ajah', 'Ajah', 6.4686, 3.5700, 'market'], // ~
  // the barrier beach, by boat
  ['tarkwa-bay', 'Tarkwa Bay', 6.4005, 3.3930, 'beach'], // ~
  ['lighthouse-beach', 'Lighthouse Beach', 6.3985, 3.4010, 'beach'], // ~
  ['ilashe', 'Ilashe Beach', 6.4005, 3.3020, 'beach'], // ~
];
const icons = ICONS.map(([id, name, lat, lon, kind]) => { const [x, z] = toXZ([lat, lon]); return { id, name, x, z, kind }; });

const map = {
  name: 'LAGOS ISLAND',
  attribution: 'Map data © OpenStreetMap contributors (ODbL). https://www.openstreetmap.org/copyright',
  origin: NEW,
  bounds: IB,
  island: flat(ISLAND),
  land: land.map(flat),
  water: wet.map(flat),
  roads,
  icons,
};
fs.writeFileSync(OUT, JSON.stringify(map));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`LAGOS ISLAND: ${land.length} land, ${wet.length} water, ${roads.length} roads, ${icons.length} icons -> ${kb} KB`);
