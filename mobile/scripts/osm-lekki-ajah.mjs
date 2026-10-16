// One download for LAGOS ISLAND's east, past where the repo's map ends: the coastline, mapped water and
// the main roads from Lekki to Ajah, saved as scripts/.osm/lekki-ajah.json. The bake
// (scripts/lagos-island.mjs) reads this file; nothing is fetched while people play.
//   node scripts/osm-lekki-ajah.mjs
// Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';

const bb = '6.395,3.500,6.520,3.610'; // south, west, north, east
const q = `[out:json][timeout:120];(
  way["natural"="coastline"](${bb});
  way["natural"="water"](${bb});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"](${bb});
);out geom;`;
let res;
for (const url of ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
  res = await fetch(url, {
  method: 'POST',
  headers: { 'User-Agent': 'WYRD-lagos-island/1.0 (one-off map bake)', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent(q),
  });
  if (res.ok) break;
  console.warn('busy (' + res.status + '), trying again in 10 s');
  await new Promise((r) => setTimeout(r, 10000));
}
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
fs.writeFileSync('scripts/.osm/lekki-ajah.json', JSON.stringify(data));
const kinds = {};
for (const e of data.elements) { const k = e.tags?.highway ?? e.tags?.natural ?? '?'; kinds[k] = (kinds[k] ?? 0) + 1; }
console.log(data.elements.length, 'ways', kinds);
