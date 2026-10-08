import fs from 'node:fs';
import path from 'node:path';
import { World } from '../src/world2d/tiles';
(globalThis as { fetch: unknown }).fetch = async (u: string) => { const t = fs.readFileSync(path.join(path.resolve('public'), u), 'utf8'); return { json: async () => JSON.parse(t) }; };
const w = new World(); await w.ready;
const P = Object.getPrototypeOf(w) as Record<string, (...a: unknown[]) => unknown>;
const st: Record<string, number> = {};
for (const k of ['parse', 'clearRoads', 'joinRoads']) { const o = P[k]; P[k] = function (this: unknown, ...a: unknown[]) { const t = performance.now(); const r = o.apply(this, a); st[k] = (st[k] ?? 0) + performance.now() - t; return r; }; }
const L = (w as unknown as { loading: Map<string, Promise<void>> }).loading;
const t0 = performance.now();
w.around(3268, 6616, 900); await Promise.all(L.values());
console.log('tiles', w.tiles.size, 'total ms', Math.round(performance.now() - t0), Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v)])));
