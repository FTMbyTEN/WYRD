// Fetches the places that make Lagos a city -- clubs and bars, police stations, government buildings,
// factories -- from OpenStreetMap (one request) into public/world/v1/places.json, in the world's
// metres: [{ k, n, x, z }] where k is the kind and n the name (or null).
//
//   node scripts/osm-places.mjs [south west north east]
//
// Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = { lat: 6.50955, lon: 3.36395 };
const [s, w, n, e] = process.argv.slice(2).map(Number);
const bb = Number.isFinite(s) ? `${s},${w},${n},${e}` : '6.400,3.300,6.620,3.560';
const KX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180), KZ = 110540;
const q = `[out:json][timeout:180];(
  nwr["amenity"~"^(nightclub|bar|pub)$"](${bb});
  nwr["amenity"~"^(police|fire_station)$"](${bb});
  nwr["amenity"~"^(townhall|courthouse)$"](${bb});
  nwr["office"="government"](${bb});
  nwr["government"](${bb});
  nwr["building"~"^(industrial|factory)$"]["name"](${bb});
  nwr["man_made"="works"](${bb});
  way["landuse"="industrial"]["name"](${bb});
  nwr["amenity"="hospital"](${bb});
  nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](${bb});
  nwr["amenity"="marketplace"](${bb});
  nwr["amenity"="place_of_worship"]["name"](${bb});
  nwr["amenity"="bank"]["name"](${bb});
  nwr["amenity"~"^(university|college)$"](${bb});
  nwr["tourism"="hotel"]["name"](${bb});
  nwr["shop"="mall"](${bb});
  nwr["amenity"="fuel"]["name"](${bb});
);out center;`;
const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'WYRD-world/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
const kind = (t) => {
  if (t.amenity === 'nightclub') return 'club';
  if (t.amenity === 'bar' || t.amenity === 'pub') return 'bar';
  if (t.amenity === 'police') return 'police';
  if (t.amenity === 'fire_station') return 'fire';
  if (t.amenity === 'hospital') return 'hospital';
  if (t.amenity === 'restaurant' || t.amenity === 'fast_food' || t.amenity === 'cafe') return 'food';
  if (t.amenity === 'marketplace') return 'market';
  if (t.amenity === 'place_of_worship') return t.religion === 'muslim' ? 'mosque' : 'church';
  if (t.amenity === 'bank') return 'bank';
  if (t.amenity === 'university' || t.amenity === 'college') return 'school';
  if (t.tourism === 'hotel') return 'hotel';
  if (t.shop === 'mall') return 'mall';
  if (t.amenity === 'fuel') return 'fuel';
  if (t.amenity === 'townhall' || t.amenity === 'courthouse' || t.office === 'government' || t.government) return 'gov';
  return 'factory';
};
const seen = new Set();
const places = [];
for (const el of data.elements) {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null) continue;
  const t = el.tags ?? {};
  const k = kind(t);
  const x = Math.round((lon - ORIGIN.lon) * KX), z = Math.round(-(lat - ORIGIN.lat) * KZ);
  const key = `${k}_${Math.round(x / 40)}_${Math.round(z / 40)}`; // one per spot (a node and its building)
  if (seen.has(key)) continue;
  seen.add(key);
  places.push({ k, n: t.name ?? null, x, z });
}
fs.writeFileSync(path.resolve('public/world/v1/places.json'), JSON.stringify(places));
const by = {};
for (const p of places) by[p.k] = (by[p.k] ?? 0) + 1;
console.log(places.length, 'places', by);
