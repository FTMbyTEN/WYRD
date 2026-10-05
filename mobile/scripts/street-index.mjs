// Builds public/world/v1/streets.json from the downloaded tiles: every named street, and a point on it
// near its middle (world metres), so a mission on any street can be found before its tile has loaded.
//
//   node scripts/street-index.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('public/world/v1');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const T = index.tile;
const acc = new Map(); // name -> { x, z, n }
for (const key of index.tiles) {
  const f = path.join(DIR, `${key}.json`);
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ox = d.x * T, oz = d.z * T;
  for (const r of d.roads) {
    const name = r[3] >= 0 ? d.names[r[3]] : null;
    if (!name) continue;
    const mid = 5 + 2 * Math.floor((r.length - 5) / 4);
    const x = r[mid] / 10 + ox, z = r[mid + 1] / 10 + oz;
    const a = acc.get(name) ?? { x: 0, z: 0, n: 0 };
    a.x += x; a.z += z; a.n++;
    acc.set(name, a);
  }
}
const out = {};
for (const [name, a] of acc) out[name] = [Math.round(a.x / a.n), Math.round(a.z / a.n)];
fs.writeFileSync(path.join(DIR, 'streets.json'), JSON.stringify(out));
console.log(`${Object.keys(out).length} named streets; Ishaga Road: ${out['Ishaga Road']}`);
