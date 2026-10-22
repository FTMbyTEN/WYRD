import fs from 'node:fs'; import path from 'node:path';
import { LANDMARKS, toXZ } from '../src/world2d/geo';
import { modelFor } from '../src/world2d/mesh';
import { place } from '../src/world2d/place';
import { World } from '../src/world2d/tiles';
(globalThis as { fetch: unknown }).fetch = async (u: string) => { const t = fs.readFileSync(path.join(path.resolve('public'), u.replace(/^\/?/, '')), 'utf8'); return { json: async () => JSON.parse(t), text: async () => t }; };
const w = new World(); await w.ready;
const out: string[] = [];
for (const l of LANDMARKS) {
  const P = toXZ(l.at); w.around(P.x, P.z, 700); const L = (w as unknown as { loading: Map<string, Promise<void>> }).loading; for (let i = 0; i < 50 && L.size; i++) await Promise.all(L.values());
  const md = modelFor(l.id)!; const t = performance.now(); place(w, md, P.x, P.z, !!l.open); out.push(`${l.id} ${(performance.now() - t).toFixed(0)}ms`);
}
console.log(out.join('  '));
process.exit(0);
