// Fetches the real bus stops of the core districts from OpenStreetMap (one small request) into
// public/world/v1/stops.json, in the world's metres: [{ x, z, name }]. Danfos run between them.
//
//   node scripts/osm-stops.mjs [south west north east]
//
// Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = { lat: 6.50955, lon: 3.36395 };
const [s, w, n, e] = process.argv.slice(2).map(Number);
const bb = Number.isFinite(s) ? `${s},${w},${n},${e}` : '6.435,3.340,6.535,3.450';
const KX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180), KZ = 110540;
const q = `[out:json][timeout:120];(node["highway"="bus_stop"](${bb});node["public_transport"="platform"]["bus"="yes"](${bb});node["amenity"="bus_station"](${bb}););out;`;
const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'WYRD-world/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
const seen = new Set();
const stops = [];
for (const el of data.elements) {
  const x = Math.round((el.lon - ORIGIN.lon) * KX), z = Math.round(-(el.lat - ORIGIN.lat) * KZ);
  const key = `${Math.round(x / 15)}_${Math.round(z / 15)}`; // one stop per spot (both directions often mapped)
  if (seen.has(key)) continue;
  seen.add(key);
  stops.push({ x, z, name: el.tags?.name ?? null, station: el.tags?.amenity === 'bus_station' });
}
fs.writeFileSync(path.resolve('public/world/v1/stops.json'), JSON.stringify(stops));
console.log(`${stops.length} stops (${stops.filter((s) => s.name).length} named)`);
