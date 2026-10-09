// Builds the map search's street list from every tile of the 2D map (public/world/v1):
//   npx tsx scripts/build-street-index.mts   ->  public/world2d/streets.json
// One entry per street name and area: [name, x, z] at the middle of its longest stretch (a long road crossing the city
// keeps one entry per ~3 km, so "Ikorodu Road" finds every part of it). Map data (c) OpenStreetMap contributors.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('public/world/v1');
const best = new Map<string, { x: number; z: number; len: number }>();
let tiles = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
  tiles++;
  // a tile: its corner (in 500 m tiles), the street names it uses, and its roads as [kind, width*10, bridge, name index,
  // one-way, x0*10, z0*10, x1*10, z1*10, ...] relative to the tile's corner (see src/world2d/tiles.ts)
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as { x: number; z: number; names: string[]; roads: number[][] };
  const ox = raw.x * 500, oz = raw.z * 500;
  for (const r of raw.roads) {
    const name = r[3] >= 0 ? (raw.names[r[3]] ?? '').trim() : '';
    if (name.length < 3) continue;
    const n = (r.length - 5) >> 1;
    let len = 0, mx = 0, mz = 0, longest = 0;
    for (let i = 1; i < n; i++) {
      const x0 = r[5 + (i - 1) * 2] / 10 + ox, z0 = r[6 + (i - 1) * 2] / 10 + oz, x1 = r[5 + i * 2] / 10 + ox, z1 = r[6 + i * 2] / 10 + oz;
      const l = Math.hypot(x1 - x0, z1 - z0);
      len += l;
      if (l > longest) { longest = l; mx = (x0 + x1) / 2; mz = (z0 + z1) / 2; }
    }
    if (!len) continue;
    // one entry per name per ~3 km cell
    const key = `${name}|${Math.floor(mx / 3000)}|${Math.floor(mz / 3000)}`;
    const b = best.get(key);
    if (!b || len > b.len) best.set(key, { x: mx, z: mz, len });
  }
}
const out = [...best.entries()].map(([k, v]) => [k.split('|')[0], Math.round(v.x), Math.round(v.z)]);
out.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
fs.writeFileSync(path.resolve('public/world2d/streets.json'), JSON.stringify(out));
console.log(`${tiles} tiles, ${out.length} street entries, ${new Set(out.map((o) => o[0])).size} names`);
