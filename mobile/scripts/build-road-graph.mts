// Builds the ride router's road network from every tile of the 2D map (public/world/v1):
//   npx tsx scripts/build-road-graph.mts   ->  public/world2d/roadgraph.json
// The main roads (motorway to tertiary, and their links) at full detail, joined where they really meet: a node at every
// junction (a point two roads share) and every dead end, and an edge for each stretch between, with its shape, whether
// it's one-way, and its width. Map data (c) OpenStreetMap contributors.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('public/world/v1');
const MAIN = 5; // kinds 0..5: motorway, trunk, primary, secondary, tertiary, link
type Way = { pts: number[]; oneway: boolean; w: number };
const ways: Way[] = [];
const seen = new Set<string>();
for (const f of fs.readdirSync(DIR)) {
  if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as { x: number; z: number; roads: number[][] };
  const ox = raw.x * 500, oz = raw.z * 500;
  for (const r of raw.roads) {
    const [kind, w10, bridge, , oneway] = r;
    void bridge;
    if (kind > MAIN) continue;
    const n = (r.length - 5) >> 1;
    if (n < 2) continue;
    // in decimetres, so shared points match exactly
    const pts: number[] = [];
    for (let i = 0; i < n; i++) pts.push(Math.round(r[5 + i * 2] + ox * 10), Math.round(r[6 + i * 2] + oz * 10));
    const sig = `${pts[0]},${pts[1]},${pts[pts.length - 2]},${pts[pts.length - 1]},${n}`;
    if (seen.has(sig)) continue; // (the same road listed by two tiles)
    seen.add(sig);
    ways.push({ pts, oneway: !!oneway, w: w10 / 10 });
  }
}
// how many ways use each point: shared points are junctions
const key = (x: number, z: number) => `${x},${z}`;
const uses = new Map<string, number>();
for (const w of ways) for (let i = 0; i < w.pts.length; i += 2) {
  const k = key(w.pts[i], w.pts[i + 1]);
  uses.set(k, (uses.get(k) ?? 0) + 1);
}
const nodeIds = new Map<string, number>();
const nodes: number[] = [];
const node = (x: number, z: number) => {
  const k = key(x, z);
  let id = nodeIds.get(k);
  if (id === undefined) { id = nodes.length / 2; nodeIds.set(k, id); nodes.push(x, z); }
  return id;
};
// edges: each way split at its junctions; [from, to, oneway, width*10, ...shape between (decimetres, relative to from)]
const edges: number[][] = [];
for (const w of ways) {
  let start = 0;
  const n = w.pts.length / 2;
  for (let i = 1; i < n; i++) {
    const end = i === n - 1 || (uses.get(key(w.pts[i * 2], w.pts[i * 2 + 1])) ?? 0) > 1;
    if (!end) continue;
    const a = node(w.pts[start * 2], w.pts[start * 2 + 1]), b = node(w.pts[i * 2], w.pts[i * 2 + 1]);
    if (a !== b) {
      const shape: number[] = [];
      for (let k = start + 1; k < i; k++) shape.push(w.pts[k * 2] - w.pts[start * 2], w.pts[k * 2 + 1] - w.pts[start * 2 + 1]);
      edges.push([a, b, w.oneway ? 1 : 0, Math.round(w.w * 10), ...shape]);
    }
    start = i;
  }
}
const out = { attribution: 'Map data (c) OpenStreetMap contributors', unit: 'dm', nodes, edges };
fs.writeFileSync(path.resolve('public/world2d/roadgraph.json'), JSON.stringify(out));
const size = fs.statSync(path.resolve('public/world2d/roadgraph.json')).size;
console.log(`${ways.length} main roads, ${nodes.length / 2} nodes, ${edges.length} edges, ${(size / 1e6).toFixed(2)} MB`);
