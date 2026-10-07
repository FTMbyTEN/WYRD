// Finds where NAIJA 2099's famous buildings really stand (OpenStreetMap, via Nominatim -- one query
// a second, as its usage policy asks) and writes scripts/.landmarks-found.json for review.
//   node scripts/landmarks2d.mjs
// Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';

const WANT = [
  ['central-mosque', 'Lagos Central Mosque, Lagos Island'],
  ['tinubu-square', 'Tinubu Square, Lagos'],
  ['independence-house', 'Independence House, Lagos'],
  ['necom-house', 'NECOM House, Marina, Lagos'],
  ['css-bookshop', 'CSS Bookshop, Broad Street, Lagos'],
  ['union-bank', 'Stallion Plaza, Marina, Lagos'],
  ['city-hall', 'Lagos City Hall, Catholic Mission Street'],
  ['idumota', 'Idumota Market, Lagos'],
  ['obalende', 'Obalende Bus Terminal, Lagos'],
  ['falomo', 'Falomo Shopping Centre, Ikoyi'],
  ['link-bridge', 'Lekki-Ikoyi Link Bridge'],
  ['bar-beach', 'Bar Beach, Victoria Island'],
  ['federal-palace', 'Federal Palace Hotel, Victoria Island'],
  ['muri-okunola', 'Muri Okunola Park, Victoria Island'],
  ['unilag-senate', 'Senate Building, University of Lagos'],
  ['unilag-gate', 'University of Lagos Main Gate, Akoka'],
  ['yaba-market', 'Yaba Market, Lagos'],
  ['tejuosho', 'Tejuosho Market, Yaba'],
  ['oshodi', 'Oshodi Transport Interchange'],
  ['computer-village', 'Computer Village, Ikeja'],
  ['alausa', 'Lagos State Secretariat, Alausa'],
  ['rail-terminal', 'Mobolaji Johnson Railway Station, Lagos'],
  ['shrine', 'New Afrika Shrine, Ikeja'],
  ['conservation', 'Lekki Conservation Centre'],
  ['nike-gallery', 'Nike Art Gallery, Lekki'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
for (const [id, q] of WANT) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ng&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'WYRD-NAIJA2099/1.0 (game map landmarks)' } });
    const j = await r.json();
    if (j[0]) {
      const [s, n, w, e] = j[0].boundingbox.map(Number);
      const width = Math.min(400, Math.max(40, Math.max((n - s) * 110540, (e - w) * 110540)));
      out[id] = { name: j[0].name || q.split(',')[0], at: [+(+j[0].lat).toFixed(5), +(+j[0].lon).toFixed(5)], width: Math.round(width), type: j[0].type };
      console.log(id, out[id].at, out[id].width, j[0].type);
    } else console.log(id, 'not found');
  } catch (e) { console.log(id, 'error', e.message); }
  await sleep(1100);
}
fs.writeFileSync('scripts/.landmarks-found.json', JSON.stringify(out, null, 1));
