/**
 * Searching Lagos by name: every named street of the 2D map, the landmarks, the districts and the map's named places
 * (churches, mosques, markets, banks, hotels, schools...), each with its kind and the area it's in. Used by the city
 * map and the WYRD phone's rides.
 */
import { asset } from './asset';
import { DISTRICTS, LANDMARKS, toXZ } from './geo';

/** something on the map you can search for: a landmark, a district, a street or a named place */
export type Found = { name: string; x: number; z: number; kind: string; area: string };
const KIND_NAMES: Record<string, string> = { church: 'Church', mosque: 'Mosque', bank: 'Bank', hotel: 'Hotel', school: 'School', market: 'Market', mall: 'Mall', hospital: 'Hospital', fuel: 'Fuel station', gov: 'Government', fire: 'Fire station', police: 'Police' };
/** the district a point is in (the nearest district centre), to tell apart places with the same name */
export const areaOf = (x: number, z: number) => { let best = '', bd = Infinity; for (const d of DISTRICTS) { const p = toXZ(d.at), q = Math.hypot(p.x - x, p.z - z); if (q < bd) { bd = q; best = d.name; } } return best; };
/** everything searchable, gathered once: the famous buildings and districts, then the map's named places and streets */
export let index: Found[] | null = null;
let loading: Promise<Found[]> | null = null;
export function searchIndex(): Promise<Found[]> {
  if (index) return Promise.resolve(index);
  loading ??= (async () => {
    const out: Found[] = [
      ...LANDMARKS.map((l) => { const p = toXZ(l.at); return { name: l.name, ...p, kind: 'Landmark', area: areaOf(p.x, p.z) }; }),
      ...DISTRICTS.map((d) => { const p = toXZ(d.at); return { name: d.name, ...p, kind: 'District', area: '' }; }),
    ];
    try {
      const places = await fetch(asset('world/v1/places.json')).then((q) => q.json()) as { k: string; n: string | null; x: number; z: number }[];
      for (const p of places) if (p.n && !/^\d/.test(p.n)) out.push({ name: p.n, x: p.x, z: p.z, kind: KIND_NAMES[p.k] ?? 'Place', area: areaOf(p.x, p.z) });
    } catch { /* offline: the rest still works */ }
    try {
      // every named street of the 2D map (scripts/build-street-index.mts): [name, x, z], a long road once per part of town
      const streets = await fetch(asset('world2d/streets.json')).then((q) => q.json()) as [string, number, number][];
      for (const [name, x, z] of streets) out.push({ name, x, z, kind: 'Street', area: areaOf(x, z) });
    } catch { /* offline */ }
    index = out;
    return out;
  })();
  return loading;
}
/** the best matches for [q]: whole-word starts first, then anywhere in the name; landmarks and districts before the rest */
export function search(all: Found[], q: string): Found[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const rank = (f: Found) => {
    const n = f.name.toLowerCase();
    const at = n.startsWith(t) ? 0 : n.split(/[\s-]+/).some((w) => w.startsWith(t)) ? 1 : n.includes(t) ? 2 : -1;
    if (at < 0) return -1;
    return at * 10 + (f.kind === 'Landmark' ? 0 : f.kind === 'District' ? 1 : f.kind === 'Street' ? 3 : 2);
  };
  return all.map((f) => ({ f, k: rank(f) })).filter((x) => x.k >= 0).sort((a, b) => a.k - b.k || a.f.name.length - b.f.name.length).slice(0, 8).map((x) => x.f);
}
