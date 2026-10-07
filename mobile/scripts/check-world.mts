// Whole-city check of the 2D map, using the game's own loader (src/world2d/tiles.ts):
//   npx tsx scripts/check-world.ts
// Walks every tile of metro Lagos and checks that no drawn building stands on a road or its pavement,
// that main roads join up, and that no street is lost when tiles are unloaded and others take over.
import fs from 'node:fs';
import path from 'node:path';
import { KIND, World, inPoly, type Road, type Tile } from '../src/world2d/tiles';

const ROOT = path.resolve('public');
(globalThis as { fetch: unknown }).fetch = async (u: string) => {
  const file = path.join(ROOT, u.replace(/^\/?/, ''));
  const text = fs.readFileSync(file, 'utf8');
  return { json: async () => JSON.parse(text), text: async () => text };
};

const w = new World();
await w.ready;
const keys = [...w.have];
const xs = keys.map((k) => +k.split('_')[0]), zs = keys.map((k) => +k.split('_')[1]);
const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
const T = 500;
const settle = async () => { for (let i = 0; i < 400 && [...(w as unknown as { loading: Map<string, Promise<void>> }).loading.values()].length; i++) { await Promise.all((w as unknown as { loading: Map<string, Promise<void>> }).loading.values()); break; } };

let onRoad = 0, intoPavement = 0, buildings = 0, deadMain = 0, lostStreets = 0, windows = 0;
const examples: string[] = [];
const segDist = (x: number, z: number, r: Road) => {
  let b = Infinity;
  for (let i = 2; i < r.p.length; i += 2) {
    const ax = r.p[i - 2], az = r.p[i - 1], dx = r.p[i] - ax, dz = r.p[i + 1] - az, L = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    b = Math.min(b, Math.hypot(ax + dx * u - x, az + dz * u - z));
  }
  return b;
};

// a 3x3-tile window walked across the city, like a player travelling; only the middle tile is judged,
// since by then everything around it is loaded
for (let tx = x0; tx <= x1; tx++) for (let tz = z0; tz <= z1; tz++) {
  const mid = `${tx}_${tz}`;
  if (!w.have.has(mid)) continue;
  w.around(tx * T + T / 2, tz * T + T / 2, T * 1.2);
  await settle(); await settle();
  windows++;
  const tile = w.tiles.get(mid);
  if (!tile) continue;
  const roads: Road[] = [];
  for (const t of w.tiles.values()) for (const r of t.roads) roads.push(r);
  // 1. buildings
  for (const b of tile.blds) {
    if (b.hide || b.gone) continue;
    buildings++;
    for (const r of roads) {
      if (r.bridge || r.kind > KIND.residential) continue;
      const band = r.w / 2 + (r.kind <= KIND.tertiary ? 3.5 : 1.75);
      if (r.maxX + band < b.minX || r.minX - band > b.maxX || r.maxZ + band < b.minZ || r.minZ - band > b.maxZ) continue;
      let through = false;
      for (let i = 2; i < r.p.length && !through; i += 2) for (let k = 0; k <= 10; k++) {
        const x = r.p[i - 2] + ((r.p[i] - r.p[i - 2]) * k) / 10, z = r.p[i - 1] + ((r.p[i + 1] - r.p[i - 1]) * k) / 10;
        if (inPoly(b.p, x, z)) { through = true; break; }
      }
      if (through) { onRoad++; if (examples.length < 12) examples.push(`building on ${r.name ?? 'a street'} at ${Math.round(b.cx)},${Math.round(b.cz)}`); break; }
      let worst = 0;
      for (let v = 0; v < b.p.length; v += 2) worst = Math.max(worst, band - segDist(b.p[v], b.p[v + 1], r));
      if (worst > 0.3) { intoPavement++; break; }
    }
  }
  // 2. main roads join up (ends inside this tile; the map's outer edge and the shore aside)
  for (const r of tile.roads) {
    if (r.kind > KIND.tertiary || r.bridge) continue;
    for (const e of [0, r.p.length - 2]) {
      const x = r.p[e], z = r.p[e + 1];
      if (Math.floor(x / T) !== tx || Math.floor(z / T) !== tz) continue;
      // the edge of the mapped area (the map is not a rectangle: coast, lagoon, the city limits)
      let edge = false;
      for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) if (!w.have.has(`${Math.floor(x / T) + dx}_${Math.floor(z / T) + dz}`)) edge = true;
      if (edge) continue;
      const joined = roads.some((o) => o !== r && !(o.maxX < x - 3 || o.minX > x + 3 || o.maxZ < z - 3 || o.minZ > z + 3) && segDist(x, z, o) < 3);
      if (!joined) { deadMain++; if (examples.length < 24) examples.push(`main road ${r.name ?? '(unnamed)'} ends at ${Math.round(x)},${Math.round(z)}`); }
    }
  }
  // 3. every street any loaded tile has is kept by some loaded tile
  const kept = new Set<Road>();
  for (const t of w.tiles.values()) for (const r of t.roads) kept.add(r);
  const sigs = new Set<string>();
  for (const t of w.tiles.values() as IterableIterator<Tile>) for (const { sig, r } of t.all) if (kept.has(r)) sigs.add(sig);
  for (const t of w.tiles.values() as IterableIterator<Tile>) for (const { sig } of t.all) if (!sigs.has(sig)) lostStreets++;
}

console.log(JSON.stringify({ tiles: windows, buildings, onRoad, intoPavement, deadMain, lostStreets }, null, 1));
for (const e of examples) console.log(' -', e);
console.log(onRoad || lostStreets ? "FAIL" : "PASS");
process.exit(onRoad || lostStreets ? 1 : 0);
