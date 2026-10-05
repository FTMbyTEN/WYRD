import * as THREE from 'three';

/**
 * Lagos tower forms, modelled on the real skyline rather than extruded footprints:
 *  - 'cylinder': NECOM House on the Marina -- a round terracotta-concrete shaft, narrow windows;
 *  - 'taper':    the new glass supertalls (Eko Atlantic) -- a rounded plan narrowing as it rises,
 *                cut by a sloping crown;
 *  - 'curved':   Heritage Place -- an elliptical glass tower wrapped in bronze fins;
 *  - 'residential': the white and cream apartment towers of Ikoyi and Banana Island, balconies on
 *                every floor;
 *  - 'twin':     two slender towers on one podium.
 * Each is built from rings (smooth where round, sharp where squared), fitted inside its real plot;
 * its uv carries the facade type and height, so the shared facade shader draws its windows, fins,
 * balconies and neon. Returns the geometry pieces and the footprint ring (for collisions and roofs).
 */
export type TowerForm = 'cylinder' | 'taper' | 'curved' | 'residential' | 'twin';
/** Facade types the shader knows: 3 glass office, 4 Adire, 5 residential, 6 terracotta concrete. */
export const FACADE = { glass: 3, adire: 4, residential: 5, terracotta: 6 } as const;

export const TOWER_PALETTE = {
  glass: [0x8fb4c8, 0x7aa0b8, 0x9cb8b0, 0xa89a84, 0x6f8aa8],
  residential: [0xf2eee6, 0xece2d0, 0xf6f2ea, 0xe4d8c2, 0xdfe4e6],
  terracotta: [0x9a5a3c, 0x8a4e34, 0xa86a48],
};

type Ring = { pts: THREE.Vector2[]; y: number | ((p: THREE.Vector2) => number) };

/** Points round a rounded rectangle (w x d, corner radius r), counter-clockwise. */
function roundedRect(w: number, d: number, r: number, perCorner = 2) {
  const pts: THREE.Vector2[] = [];
  const hw = w / 2 - r, hd = d / 2 - r;
  const corners: [number, number, number][] = [[hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, (3 * Math.PI) / 2]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= perCorner; i++) {
    const a = a0 + (i / perCorner) * (Math.PI / 2);
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}
function ellipse(rx: number, rz: number, n = 12) {
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return new THREE.Vector2(Math.cos(a) * rx, Math.sin(a) * rz); });
}

/** A lofted shell through rings (same point count), with a flat or sloped cap on top. */
function loft(rings: Ring[], at: THREE.Vector2, rot: number, color: number, style: number, seed: number, top: number) {
  const n = rings[0].pts.length, pos: number[] = [], idx: number[] = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  const place = (p: THREE.Vector2) => new THREE.Vector2(at.x + p.x * c - p.y * s, at.y + p.x * s + p.y * c);
  for (const r of rings) for (const p of r.pts) {
    const w = place(p);
    pos.push(w.x, typeof r.y === 'number' ? r.y : r.y(p), w.y);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + ((i + 1) % n), a2 = a + n, b2 = b + n;
    idx.push(a, b, a2, b, b2, a2);
  }
  // the top cap: a fan from the centre
  const last = rings[rings.length - 1], base = (rings.length - 1) * n, ci = pos.length / 3;
  const cy = typeof last.y === 'number' ? last.y : last.y(new THREE.Vector2(0, 0));
  const ce = place(new THREE.Vector2(0, 0));
  pos.push(ce.x, cy, ce.y);
  for (let i = 0; i < n; i++) idx.push(ci, base + ((i + 1) % n), base + i);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // sharp where the plan turns sharply, smooth where it's round: split by non-indexing when squared
  g = g.toNonIndexed();
  g.computeVertexNormals();
  // outward check: the first wall face should point away from the centre; flip if not
  const p0 = new THREE.Vector3().fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, 0);
  const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal as THREE.BufferAttribute, 0);
  if (n0.x * (p0.x - ce.x) + n0.z * (p0.z - ce.y) < 0) {
    const pa = g.attributes.position.array as Float32Array;
    for (let i = 0; i < pa.length; i += 9) for (let k = 0; k < 3; k++) { const t = pa[i + 3 + k]; pa[i + 3 + k] = pa[i + 6 + k]; pa[i + 6 + k] = t; }
    g.computeVertexNormals();
  }
  const cnt = g.attributes.position.count, col = new THREE.Color(color), cols = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2);
  const ys = g.attributes.position;
  for (let i = 0; i < cnt; i++) {
    // sky occlusion at the foot, like the low buildings
    const k = 0.62 + 0.38 * Math.min(1, ys.getY(i) / 14);
    cols[i * 3] = col.r * k; cols[i * 3 + 1] = col.g * k; cols[i * 3 + 2] = col.b * k;
    uv[i * 2] = style + 10 * Math.round(top); uv[i * 2 + 1] = seed;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * A tower of [form] at [at], fitting a plot of radius [r] (metres), [h] tall. Returns its pieces, the
 * footprint ring (world coords, for collisions), and its top height.
 */
export function buildTower(form: TowerForm, at: THREE.Vector2, r: number, h: number, seed: number) {
  const rot = seed * Math.PI * 2;
  const pick = <T,>(xs: T[], k = 1) => xs[Math.floor(((seed * 13.7 * k) % 1) * xs.length)];
  const pieces: THREE.BufferGeometry[] = [];
  let ring: THREE.Vector2[] = [];
  let top = h;
  const toWorld = (pts: THREE.Vector2[]) => pts.map((p) => new THREE.Vector2(at.x + p.x * Math.cos(rot) - p.y * Math.sin(rot), at.y + p.x * Math.sin(rot) + p.y * Math.cos(rot)));
  if (form === 'cylinder') {
    const rr = r * 0.55, plan = ellipse(rr, rr, 14);
    pieces.push(loft([{ pts: plan, y: 0 }, { pts: plan, y: h }], at, rot, pick(TOWER_PALETTE.terracotta), FACADE.terracotta, seed, h));
    // a recessed crown ring, then a narrower top drum
    const crown = ellipse(rr * 0.8, rr * 0.8, 14);
    pieces.push(loft([{ pts: crown, y: h }, { pts: crown, y: h + 4 }], at, rot, 0x6a4a3a, FACADE.terracotta, seed, h + 4));
    ring = toWorld(plan); top = h + 4;
  } else if (form === 'taper') {
    const w = r * 1.15, d = r * 0.8;
    const plan = roundedRect(w, d, Math.min(w, d) * 0.28, 2);
    const rings: Ring[] = [];
    const n = 3;
    for (let k = 0; k <= n; k++) {
      const t = k / n, sc = 1 - 0.38 * t * t;
      const yk = h * 0.86 * t;
      rings.push({ pts: plan.map((p) => p.clone().multiplyScalar(sc)), y: yk });
    }
    // the sloping crown: the top ring rises across the tower
    const sc = 0.6;
    rings.push({ pts: plan.map((p) => p.clone().multiplyScalar(sc)), y: (p: THREE.Vector2) => h * 0.86 + (0.5 + p.x / (w * sc)) * h * 0.14 });
    pieces.push(loft(rings, at, rot, pick(TOWER_PALETTE.glass), FACADE.glass, seed, h));
    ring = toWorld(plan);
  } else if (form === 'curved') {
    const plan = ellipse(r * 0.95, r * 0.55, 14);
    pieces.push(loft([{ pts: plan, y: 0 }, { pts: plan, y: h }], at, rot, pick(TOWER_PALETTE.glass, 2), FACADE.glass, seed, h));
    ring = toWorld(plan);
  } else if (form === 'residential') {
    const w = r * 1.3, d = r * 0.62;
    const plan = roundedRect(w, d, 2.5, 3);
    const podium = roundedRect(w * 1.15, d * 1.3, 3, 3);
    pieces.push(loft([{ pts: podium, y: 0 }, { pts: podium, y: 7 }], at, rot, 0xd8d2c6, FACADE.residential, seed, 7));
    pieces.push(loft([{ pts: plan, y: 7 }, { pts: plan, y: h }], at, rot, pick(TOWER_PALETTE.residential), FACADE.residential, seed, h));
    ring = toWorld(podium);
  } else {
    // twin: two slender towers on a podium, one a little taller
    const podium = roundedRect(r * 1.5, r * 0.9, 3, 3);
    pieces.push(loft([{ pts: podium, y: 0 }, { pts: podium, y: 9 }], at, rot, 0xd8d2c6, FACADE.residential, seed, 9));
    for (const [side, hh] of [[-1, h], [1, h * 0.86]] as const) {
      const plan = roundedRect(r * 0.55, r * 0.55, 3, 3).map((p) => p.add(new THREE.Vector2(side * r * 0.38, 0)));
      pieces.push(loft([{ pts: plan, y: 9 }, { pts: plan, y: hh }], at, rot, pick(TOWER_PALETTE.glass, 3), FACADE.glass, seed, hh));
    }
    ring = toWorld(podium);
  }
  return { pieces, ring, top };
}

/** Which form a plot gets: mostly glass and white residential, with the odd cylinder and twin. */
export function formFor(seed: number, area: number): TowerForm {
  const t = (seed * 7.31) % 1;
  if (area > 900 && t < 0.18) return 'twin';
  if (t < 0.32) return 'residential';
  if (t < 0.58) return 'taper';
  if (t < 0.78) return 'curved';
  if (t < 0.9) return 'residential';
  return 'cylinder';
}
