/**
 * Where a landmark's model stands, how it's turned and how big it is -- worked out from the real map, once its
 * tiles are in. Shared by the game (Lagos2D's snap) and the whole-city check (scripts/check-landmarks.mts).
 *
 * A building landmark takes the footprint its true coordinate stands in (or one within a few metres of it): the
 * model stands on that footprint's centre, its long side along the footprint's long side, scaled to fill it, its
 * front to the nearest street; a landmark is scaled in plan only, keeping its true height. A landmark with no footprint of its own (a square, a market, a stadium mapped as
 * ground, a district) stands at its coordinate, or the nearest spot to it, at the largest size that covers no road.
 */
import type { Model } from './mesh';
import { KIND, along as alongRoad, crosses, inPoly, type Bld, type Road, type World } from './tiles';

export type Placement = { x: number; z: number; heading: number; size: number; foot: Bld | null };

/** the model's plan as a ground rectangle, stood at (x, z), turned to [heading], scaled by [size], grown by [pad] m */
export function planRect(md: Model, x: number, z: number, heading: number, size: number, pad = 0) {
  const co = Math.cos(heading), si = Math.sin(heading);
  const [a, b, d, e] = md.box;
  return Float32Array.from([[a - pad / size, d - pad / size], [b + pad / size, d - pad / size], [b + pad / size, e + pad / size], [a - pad / size, e + pad / size]]
    .flatMap(([lx, lz]) => [x + (lx * co + lz * si) * size, z + (-lx * si + lz * co) * size]));
}

/** where the model's origin goes for its plan's middle to stand at (cx, cz) (a model's plan needn't be centred on its
 *  origin: the Cathedral's tower stands out to one side) */
function originFor(md: Model, cx: number, cz: number, heading: number, size: number) {
  const bx = (md.box[0] + md.box[1]) / 2, bz = (md.box[2] + md.box[3]) / 2, co = Math.cos(heading), si = Math.sin(heading);
  return { x: cx - (bx * co + bz * si) * size, z: cz - (-bx * si + bz * co) * size };
}
/** the footprint's tightest box: of the directions of its edges, the one whose box is smallest (a round footprint
 *  gets a square, not a sliver along one long chord), turned so its long side runs along (sin ang, cos ang) */
function tightBox(b: Bld) {
  let best = { ang: 0, ext: [0, 0, 0, 0], area: Infinity };
  for (let i = 0; i < b.p.length; i += 2) {
    const j = (i + 2) % b.p.length, ex = b.p[j] - b.p[i], ez = b.p[j + 1] - b.p[i + 1];
    if (Math.hypot(ex, ez) < 0.5) continue;
    const ang = Math.atan2(ex, ez), e = extent(b.p, b.cx, b.cz, Math.sin(ang), Math.cos(ang)), area = (e[1] - e[0]) * (e[3] - e[2]);
    if (area < best.area) best = { ang, ext: e, area };
  }
  const [a0, a1, c0, c1] = best.ext;
  return a1 - a0 >= c1 - c0 ? { ang: best.ang, ext: best.ext } : { ang: best.ang + Math.PI / 2, ext: extent(b.p, b.cx, b.cz, Math.sin(best.ang + Math.PI / 2), Math.cos(best.ang + Math.PI / 2)) };
}
/** how far the polygon reaches from (cx, cz) along (ux, uz) and across it: [min, max, min, max] */
function extent(p: ArrayLike<number>, cx: number, cz: number, ux: number, uz: number) {
  let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i] - cx, z = p[i + 1] - cz, a = x * ux + z * uz, c = -x * uz + z * ux;
    if (a < a0) a0 = a; if (a > a1) a1 = a; if (c < c0) c0 = c; if (c > c1) c1 = c;
  }
  return [a0, a1, c0, c1];
}
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

/** the landmark's own footprint: the one its coordinate stands in (the biggest, if several), else one within 12 m */
export function footprintAt(world: World, x: number, z: number): Bld | null {
  let best: Bld | null = null, bestD = 12;
  for (const t of world.tiles.values()) for (const b of t.blds) {
    if (b.hide || b.gone || b.area < 150) continue;
    if (b.maxX < x - 12 || b.minX > x + 12 || b.maxZ < z - 12 || b.minZ > z + 12) continue;
    const d = polyDist(b.p, x, z);
    if (d < bestD || (d === 0 && bestD === 0 && best && b.area > best.area)) { best = b; bestD = d; }
  }
  return best;
}

/** whether the plan, its middle at (cx, cz), turned and sized so, covers a street (its carriageway, not just its middle line) */
function coversRoad(roads: Road[], md: Model, cx: number, cz: number, heading: number, size: number, kerb = true) {
  const { x, z } = originFor(md, cx, cz, heading, size);
  const rect = planRect(md, x, z, heading, size);
  const r0 = Math.hypot(md.box[1] - md.box[0], md.box[3] - md.box[2]) * size / 2 + 12;
  for (const r of roads) {
    if (r.maxX < x - r0 || r.minX > x + r0 || r.maxZ < z - r0 || r.minZ > z + r0) continue;
    const grown = kerb ? planRect(md, x, z, heading, size, r.w / 2 + 1) : rect; // (kerb: the carriageway and a metre, not just the middle line)
    if (crosses(grown, r.p) || crosses(rect, r.p)) return true;
    for (let i = 0; i < r.p.length; i += 2) if (inPoly(grown, r.p[i], r.p[i + 1])) return true;
  }
  return false;
}

export function place(world: World, md: Model, x: number, z: number, open: boolean, keepOff?: (x: number, z: number) => boolean): Placement {
  const roads: Road[] = [];
  for (const t of world.tiles.values()) for (const r of t.roads) if (!r.bridge && r.kind <= KIND.residential) roads.push(r);
  const near = world.nearestRoad(x, z, 300, KIND.residential);
  /** of the four turns square to [ang], the one whose front faces the street most */
  const facing = (cx: number, cz: number, turns: number[]) => {
    if (!near) return turns[0];
    const tx = near.x - cx, tz = near.z - cz;
    let best = turns[0], dot = -Infinity;
    for (const h of turns) { const d = Math.sin(h) * tx + Math.cos(h) * tz; if (d > dot) { dot = d; best = h; } }
    return best;
  };
  const W = md.box[1] - md.box[0], D = md.box[3] - md.box[2];

  const foot = open ? null : footprintAt(world, x, z);
  // a footprint the model can't fill (a fragment of the real building, an annex beside it) isn't its plot
  const fits = (b: Bld) => { const [a0, a1, c0, c1] = tightBox(b).ext; return Math.max(Math.min((a1 - a0) / D, (c1 - c0) / W), Math.min((a1 - a0) / W, (c1 - c0) / D)) >= 0.6; };
  if (foot && fits(foot)) {
    // square to the footprint, the model's long side along its long side, scaled to fill it
    const { ang, ext: [a0, a1, c0, c1] } = tightBox(foot), ux = Math.sin(ang), uz = Math.cos(ang);
    const cx = foot.cx + ux * (a0 + a1) / 2 - uz * (c0 + c1) / 2, cz = foot.cz + uz * (a0 + a1) / 2 + ux * (c0 + c1) / 2; // the footprint's box centre
    const along = a1 - a0, across = c1 - c0;
    // heading h puts the model's z (depth D) along (sin h, cos h): turns ang, ang+pi put D along the long side
    const fitAlong = Math.min(along / D, across / W), fitAcross = Math.min(along / W, across / D);
    const turns = fitAlong >= fitAcross * 0.97 ? [ang, ang + Math.PI] : [ang + Math.PI / 2, ang - Math.PI / 2];
    if (Math.abs(fitAlong - fitAcross) / Math.max(fitAlong, fitAcross) < 0.03) turns.push(...(turns[0] === ang ? [ang + Math.PI / 2, ang - Math.PI / 2] : [ang, ang + Math.PI]));
    const heading = facing(cx, cz, turns);
    const fit = Math.max(fitAlong, fitAcross);
    // a little over its footprint (its own forecourt, up to a quarter more) where that's clear of streets, so a
    // tight footprint doesn't leave a thin, pinched model; never bigger than its true size, unless the plot is
    let size = Math.max(0.45, Math.min(1.3, fit < 1 ? Math.min(1, fit * 1.25) : fit));
    // beyond its footprint, only clear of the carriageway; within it, the real building's own line stands (the map's
    // road widths are estimates) unless a street's middle actually runs through
    while (size > fit && coversRoad(roads, md, cx, cz, heading, size)) size -= 0.05;
    if (size < fit) size = Math.max(0.45, Math.min(1.3, fit));
    while (size > 0.45 && coversRoad(roads, md, cx, cz, heading, size, false)) size -= 0.05;
    return { ...originFor(md, cx, cz, heading, size), heading, size, foot };
  }

  // no footprint of its own: the nearest spot, the biggest size, that covers no street (and isn't in the water)
  // square to the nearest street
  const along = near ? (() => { const a = alongRoad(near.r.p, near.r.cum, near.s); return Math.atan2(a.dx, a.dz); })() : 0;
  // the best spot: as big as it can be, as near its true place as it can be -- 10 m nearer is worth 10% of size
  let pick: Placement | null = null, score = -Infinity;
  for (const ring of [0, 8, 16, 25, 35, 45, 60, 80]) {
    const steps = ring === 0 ? 1 : 12;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2, sx = x + Math.cos(a) * ring, sz = z + Math.sin(a) * ring;
      if (keepOff?.(sx, sz)) continue;
      const heading = facing(sx, sz, [along, along + Math.PI / 2, along + Math.PI, along - Math.PI / 2]);
      for (let size = 1; size >= 0.4 - 1e-9; size -= 0.05) {
        const sc = size - ring / 100;
        if (sc <= score) break; // (smaller only scores less)
        if (!coversRoad(roads, md, sx, sz, heading, size)) { pick = { ...originFor(md, sx, sz, heading, size), heading, size, foot: null }; score = sc; break; }
      }
    }
  }
  if (pick) return pick;
  const heading = facing(x, z, [along, along + Math.PI / 2, along + Math.PI, along - Math.PI / 2]);
  return { ...originFor(md, x, z, heading, 0.4), heading, size: 0.4, foot: null };
}
