// Every landmark against the real map, using the game's own loader and models:
//   npx tsx scripts/check-landmarks.mts
// For each: the real building footprint at its coordinate (or the nearest one), which footprint the game's snap
// would pick, how far that is from the true spot, the model's plan beside the footprint's, and whether the model,
// stood and turned there, covers any road.
import fs from 'node:fs';
import path from 'node:path';
import { LANDMARKS, toXZ } from '../src/world2d/geo';
import { modelFor } from '../src/world2d/mesh';
import { place, planRect } from '../src/world2d/place';
import { KIND, World, crosses, inPoly, type Bld } from '../src/world2d/tiles';

const ROOT = path.resolve('public');
(globalThis as { fetch: unknown }).fetch = async (u: string) => {
  const file = path.join(ROOT, u.replace(/^\/?/, ''));
  const text = fs.readFileSync(file, 'utf8');
  return { json: async () => JSON.parse(text), text: async () => text };
};
const w = new World();
await w.ready;
const settle = async () => { const l = (w as unknown as { loading: Map<string, Promise<void>> }).loading; for (let i = 0; i < 50 && l.size; i++) await Promise.all(l.values()); };

/** distance from (x, z) to a polygon's edge (0 inside) */
const polyDist = (p: Float32Array, x: number, z: number) => {
  if (inPoly(p, x, z)) return 0;
  let d = Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length, ax = p[i], az = p[i + 1], dx = p[j] - ax, dz = p[j + 1] - az, L = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    d = Math.min(d, Math.hypot(ax + dx * u - x, az + dz * u - z));
  }
  return d;
};
/** a footprint's size along its longest edge and across it */
const dims = (b: Bld) => {
  let ang = 0, len = 0;
  for (let i = 0; i < b.p.length; i += 2) { const j = (i + 2) % b.p.length, ex = b.p[j] - b.p[i], ez = b.p[j + 1] - b.p[i + 1], l = Math.hypot(ex, ez); if (l > len) { len = l; ang = Math.atan2(ex, ez); } }
  const ux = Math.sin(ang), uz = Math.cos(ang);
  let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (let i = 0; i < b.p.length; i += 2) { const x = b.p[i] - b.cx, z = b.p[i + 1] - b.cz, a = x * ux + z * uz, c = -x * uz + z * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  return { along: a1 - a0, across: c1 - c0, ang };
};

const rows: string[] = [];
for (const l of LANDMARKS) {
  const P = toXZ(l.at);
  w.around(P.x, P.z, 700);
  await settle(); await settle();
  const blds: Bld[] = [];
  for (const t of w.tiles.values()) for (const b of t.blds) if (!b.gone) blds.push(b);
  const at = blds.filter((b) => inPoly(b.p, P.x, P.z)).sort((a, b) => b.area - a.area)[0];
  const nearest = blds.map((b) => ({ b, d: polyDist(b.p, P.x, P.z) })).sort((a, b) => a.d - b.d)[0];
  const md = modelFor(l.id);
  const mdW = md ? md.box[1] - md.box[0] : 0, mdD = md ? md.box[3] - md.box[2] : 0;
  const fp = at ?? (nearest && nearest.d < 15 ? nearest.b : undefined);
  const fd = fp ? dims(fp) : null;
  // where the game now stands it (place.ts), and the streets its plan still covers there
  const pl = md && l.id !== 'link-bridge' ? place(w, md, P.x, P.z, !!l.open) : null;
  let covered = 0; const names = new Set<string>();
  if (md && pl) {
    const rect = planRect(md, pl.x, pl.z, pl.heading, pl.size);
    for (const t of w.tiles.values()) for (const r of t.roads) if (!r.bridge && r.kind <= KIND.residential && crosses(rect, r.p)) { covered++; if (r.name) names.add(r.name); }
  }
  rows.push([
    l.id.padEnd(20),
    (at ? `ON ${Math.round(at.area)}m2` : nearest ? `near ${nearest.d.toFixed(0)}m` : 'none').padEnd(14),
    (pl ? (pl.foot ? (pl.foot === at ? 'own plot' : 'plot ' + Math.round(Math.hypot(pl.foot.cx - P.x, pl.foot.cz - P.z)) + 'm off') : 'no plot, ' + Math.round(Math.hypot(pl.x - P.x, pl.z - P.z)) + 'm off') + ' x' + pl.size.toFixed(2) : '-').padEnd(24),
    fd ? `foot ${fd.along.toFixed(0)}x${fd.across.toFixed(0)}` : 'foot -',
    md ? `model ${mdW.toFixed(0)}x${mdD.toFixed(0)}` : 'no model',
    md ? `roads ${covered}${names.size ? ' (' + [...names].slice(0, 3).join(', ') + ')' : ''}` : '',
    l.open ? 'open' : '',
  ].join('  '));
}
console.log(rows.join('\n'));
process.exit(0);
