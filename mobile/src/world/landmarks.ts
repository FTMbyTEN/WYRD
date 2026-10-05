import * as THREE from 'three';
import { facadeMaterial } from './facade';
import { buildTower, type TowerForm } from './towers';

/**
 * The Lagos you see from anywhere: the landmarks, always present, at their real positions (from
 * latitude and longitude, in the same frame as the street map). Drawn coarse and cheap -- a few draw
 * calls for all of it -- because they're seen from afar:
 *  - the Lagos Lagoon, and the islands in it (Lagos Island, Ikoyi, Victoria Island, Eko Atlantic);
 *  - Third Mainland Bridge, Eko Bridge and Carter Bridge, on piers, with neon edges and the lights
 *    of hover traffic flowing across;
 *  - the skylines of 2099: towers on the islands (supertalls on Eko Atlantic), in Ikeja and Yaba,
 *    lit with the same neon facade as the streets;
 *  - air-traffic lanes: lit craft flying between the districts.
 * District names and positions are exported for the bird's-eye map.
 */
export type LatLon = [number, number];

export const DISTRICTS: { name: string; at: LatLon }[] = [
  { name: 'Ojuelegba', at: [6.50955, 3.36395] },
  { name: 'Yaba', at: [6.5095, 3.3785] },
  { name: 'Surulere', at: [6.4985, 3.3535] },
  { name: 'Mushin', at: [6.5273, 3.3449] },
  { name: 'Ebute-Metta', at: [6.4878, 3.3805] },
  { name: 'Maryland', at: [6.5713, 3.3676] },
  { name: 'Ikeja', at: [6.6018, 3.3515] },
  { name: 'Oworonshoki', at: [6.5517, 3.4015] },
  { name: 'Apapa', at: [6.4474, 3.3594] },
  { name: 'Lagos Island', at: [6.4541, 3.3947] },
  { name: 'Ikoyi', at: [6.4523, 3.4339] },
  { name: 'Victoria Island', at: [6.4281, 3.4219] },
  { name: 'Eko Atlantic', at: [6.4067, 3.4106] },
  { name: 'Third Mainland Bridge', at: [6.512, 3.4052] },
];

// Third Mainland Bridge, from Oworonshoki down the lagoon to Adeniji Adele on Lagos Island
const TMB: LatLon[] = [[6.5517, 3.4015], [6.5405, 3.4049], [6.5255, 3.4062], [6.512, 3.4052], [6.4985, 3.4012], [6.4855, 3.3968], [6.4745, 3.3937], [6.4655, 3.3926]];
const EKO_BRIDGE: LatLon[] = [[6.4655, 3.3705], [6.4615, 3.3775], [6.4575, 3.3855]];
const CARTER_BRIDGE: LatLon[] = [[6.4705, 3.3815], [6.4675, 3.3872], [6.4635, 3.3905]];
// the lagoon's mainland shore (west), then round the east; the islands sit inside it
const LAGOON: LatLon[] = [
  [6.63, 3.395], [6.5517, 3.3975], [6.5405, 3.4005], [6.5255, 3.4015], [6.512, 3.4005], [6.4985, 3.3965], [6.4855, 3.392], [6.4745, 3.3885],
  [6.4705, 3.379], [6.4655, 3.3695], [6.455, 3.367], [6.44, 3.37], [6.425, 3.385], [6.39, 3.39], [6.38, 3.46], [6.42, 3.52], [6.5, 3.55], [6.63, 3.55],
];
const ISLANDS: LatLon[][] = [
  [[6.4665, 3.3895], [6.4655, 3.402], [6.459, 3.412], [6.4505, 3.408], [6.4465, 3.395], [6.4505, 3.386], [6.458, 3.3855]], // Lagos Island
  [[6.4645, 3.414], [6.4615, 3.452], [6.444, 3.456], [6.4405, 3.43], [6.4465, 3.413]], // Ikoyi
  [[6.4395, 3.405], [6.4375, 3.455], [6.4205, 3.46], [6.4185, 3.41]], // Victoria Island
  [[6.414, 3.399], [6.4125, 3.424], [6.3995, 3.426], [6.4005, 3.401]], // Eko Atlantic
];
// skyline districts: centre, radius (m), number of towers, height range (m)
const SKYLINES: { at: LatLon; r: number; n: number; h: [number, number]; forms: TowerForm[] }[] = [
  { at: [6.4535, 3.3955], r: 600, n: 40, h: [60, 220], forms: ['taper', 'curved', 'residential', 'cylinder', 'taper'] }, // Marina / Broad Street
  { at: [6.4535, 3.432], r: 750, n: 30, h: [40, 150], forms: ['residential', 'residential', 'residential', 'curved', 'twin'] }, // Ikoyi: white apartment towers
  { at: [6.429, 3.428], r: 900, n: 44, h: [50, 200], forms: ['taper', 'residential', 'curved', 'residential', 'twin'] }, // Victoria Island
  { at: [6.407, 3.4125], r: 650, n: 26, h: [120, 380], forms: ['taper', 'taper', 'curved', 'twin'] }, // Eko Atlantic: the supertalls of 2099
  { at: [6.6015, 3.3505], r: 900, n: 22, h: [40, 140], forms: ['residential', 'curved', 'taper'] }, // Ikeja
  { at: [6.5155, 3.3835], r: 450, n: 12, h: [50, 160], forms: ['curved', 'taper', 'residential'] }, // Yaba tech district
  { at: [6.492, 3.3555], r: 500, n: 8, h: [40, 110], forms: ['residential', 'residential', 'cylinder'] }, // Surulere
];
// NECOM House on the Marina: the terracotta cylinder with its mast
const NECOM: LatLon = [6.4528, 3.3897];
// the Lekki-Ikoyi Link Bridge (cable-stayed, one tall pylon); its line is approximate
const LEKKI_IKOYI: LatLon[] = [[6.4488, 3.4392], [6.4466, 3.4445], [6.4437, 3.4505]];

export function makeLandmarks(scene: THREE.Scene, origin: { lat: number; lon: number }) {
  const KX = 111320 * Math.cos((origin.lat * Math.PI) / 180), KZ = 110540;
  const P = ([lat, lon]: LatLon) => new THREE.Vector2((lon - origin.lon) * KX, -(lat - origin.lat) * KZ);
  const group = new THREE.Group();
  scene.add(group);
  const rnd = (() => { let s = 2099; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

  // ---- water and islands ----
  const shape = (pts: LatLon[]) => new THREE.Shape(pts.map((q) => { const v = P(q); return new THREE.Vector2(v.x, -v.y); }));
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0f3346, roughness: 0.08, metalness: 0.5, fog: false });
  const lagoon = new THREE.Mesh(new THREE.ShapeGeometry(shape(LAGOON)).rotateX(-Math.PI / 2), waterMat);
  lagoon.position.y = 0.05;
  const landGeo = new THREE.BufferGeometry();
  const islands = ISLANDS.map((isl) => new THREE.ShapeGeometry(shape(isl)).rotateX(-Math.PI / 2));
  const land = new THREE.Mesh(islands.length ? mergeShapes(islands) : landGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 1 }));
  land.position.y = 0.12;
  group.add(lagoon, land);

  // ---- bridges: deck ribbons on piers, neon edges ----
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.7, fog: false });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false, fog: false });
  const decks: THREE.BufferGeometry[] = [], edges: THREE.BufferGeometry[] = [], piers: THREE.Matrix4[] = [];
  const lanes: { pts: THREE.Vector2[]; cum: number[]; y: number }[] = [];
  for (const [line, width, height] of [[TMB, 24, 11], [EKO_BRIDGE, 20, 9], [CARTER_BRIDGE, 18, 8]] as const) {
    const pts = (line as LatLon[]).map(P);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    decks.push(ribbon(pts, width, height));
    for (const side of [-1, 1]) edges.push(ribbon(offsetLine(pts, side * (width / 2 - 0.6)), 1.2, height + 0.25)); // neon rails: readable from the air
    edges.push(ribbon(pts, 0.6, height + 0.2)); // and the centre line
    const len = cum[cum.length - 1];
    for (let s = 20; s < len; s += 45) {
      const p = along(pts, cum, s);
      piers.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, height / 2, p.y), new THREE.Quaternion(), new THREE.Vector3(2.2, height, 6)));
    }
    lanes.push({ pts, cum, y: height + 0.9 });
  }
  group.add(new THREE.Mesh(mergeShapes(decks), deckMat), new THREE.Mesh(mergeShapes(edges), neonMat));
  const pierMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), deckMat, piers.length);
  piers.forEach((m, i) => pierMesh.setMatrixAt(i, m));
  pierMesh.computeBoundingSphere();
  group.add(pierMesh);

  // ---- skylines: real Lagos tower forms, each district with its own mix (one mesh for all) ----
  const towers: THREE.BufferGeometry[] = [];
  const tops: THREE.Vector3[] = [];
  for (const d of SKYLINES) {
    const c = P(d.at);
    for (let i = 0; i < d.n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * d.r;
      const x = c.x + Math.cos(a) * r, z = c.y + Math.sin(a) * r;
      const h = d.h[0] + Math.pow(rnd(), 1.8) * (d.h[1] - d.h[0]);
      const seed = rnd(), form = d.forms[Math.floor(rnd() * d.forms.length)];
      const T = buildTower(form, new THREE.Vector2(x, z), 14 + rnd() * 14, h, seed);
      towers.push(...T.pieces);
      tops.push(new THREE.Vector3(x, T.top, z));
    }
  }
  // NECOM House, at its real place
  {
    const n = P(NECOM);
    const T = buildTower('cylinder', n, 26, 156, 0.31);
    towers.push(...T.pieces);
    const mast = new THREE.CylinderGeometry(0.6, 1.4, 34, 8).translate(n.x, T.top + 17, n.y);
    const mc = new Float32Array(mast.attributes.position.count * 3).fill(0.55);
    mast.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    towers.push(mast);
    tops.push(new THREE.Vector3(n.x, T.top + 34, n.y));
  }
  const towerMat = facadeMaterial({ bay: 1.8, tint: 0x24485a });
  towerMat.vertexColors = true;
  towerMat.fog = false; // seen across kilometres: haze is in the colour, not the fog
  const skyline = new THREE.Mesh(mergeShapes(towers), towerMat);
  group.add(skyline);

  // ---- the Lekki-Ikoyi Link Bridge: a deck, one tall pylon, fans of cables ----
  {
    const pts = LEKKI_IKOYI.map(P);
    const deckH = 9, pyl = pts[1];
    group.add(new THREE.Mesh(ribbon(pts, 22, deckH), deckMat));
    const cable = new THREE.MeshBasicMaterial({ color: 0xe6eaef, toneMapped: false, fog: false });
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 90, 8).translate(pyl.x, 45, pyl.y), deckMat);
    group.add(pylon);
    const cables: THREE.BufferGeometry[] = [];
    for (const end of [pts[0], pts[2]]) for (let k = 1; k <= 9; k++) {
      const t = k / 10, at = pyl.clone().lerp(end, t), top = new THREE.Vector3(pyl.x, 50 + k * 3.8, pyl.y), foot = new THREE.Vector3(at.x, deckH + 0.5, at.y);
      const len = top.distanceTo(foot);
      const g = new THREE.CylinderGeometry(0.12, 0.12, len, 4);
      g.applyMatrix4(new THREE.Matrix4().compose(top.clone().add(foot).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize()), new THREE.Vector3(1, 1, 1)));
      cables.push(g);
    }
    group.add(new THREE.Mesh(mergeShapes(cables), cable));
  }
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false, fog: false });
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 6, 4), beaconMat, tops.length);
  tops.forEach((t, i) => beacons.setMatrixAt(i, new THREE.Matrix4().makeTranslation(t.x, t.y + 3, t.z)));
  beacons.computeBoundingSphere();
  group.add(beacons);

  // ---- moving lights: hover traffic on the bridges, craft in the air lanes ----
  const airLanes: { pts: THREE.Vector2[]; cum: number[]; y: number }[] = [];
  const hub = (n: string) => P(DISTRICTS.find((d) => d.name === n)!.at);
  for (const [a, b, y] of [['Ojuelegba', 'Lagos Island', 140], ['Yaba', 'Victoria Island', 170], ['Ikeja', 'Ojuelegba', 160], ['Surulere', 'Eko Atlantic', 190], ['Maryland', 'Ikoyi', 210], ['Mushin', 'Apapa', 150]] as const) {
    const pts = [hub(a), hub(b)];
    airLanes.push({ pts, cum: [0, pts[0].distanceTo(pts[1])], y });
  }
  type Mover = { lane: { pts: THREE.Vector2[]; cum: number[]; y: number }; s: number; v: number; side: number };
  const movers: Mover[] = [];
  for (const lane of lanes) for (let i = 0; i < Math.ceil(lane.cum[lane.cum.length - 1] / 90); i++) movers.push({ lane, s: rnd() * lane.cum[lane.cum.length - 1], v: (18 + rnd() * 10) * (i % 2 ? 1 : -1), side: i % 2 ? 1 : -1 });
  for (const lane of airLanes) for (let i = 0; i < 9; i++) movers.push({ lane, s: rnd() * lane.cum[1], v: (35 + rnd() * 25) * (i % 2 ? 1 : -1), side: i % 2 ? 1 : -1 });
  const craftMat = new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false, fog: false });
  const craft = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.6, 2.6), craftMat, movers.length);
  craft.frustumCulled = false;
  const col = new THREE.Color();
  movers.forEach((m, i) => craft.setColorAt(i, col.setHex(m.v > 0 ? 0xfff2d8 : 0xff3348)));
  group.add(craft);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), pos = new THREE.Vector3();

  return {
    group,
    /** latitude/longitude to the world's metres */
    toWorld: (at: LatLon) => P(at),
    update(dt: number, now: number, night: number) {
      beaconMat.color.setHex(Math.sin(now / 520) > 0 ? 0xff2a3a : 0x2a0508);
      neonMat.color.setRGB(0, 0.9 * (0.55 + 0.45 * night), 1 * (0.55 + 0.45 * night));
      movers.forEach((m, i) => {
        const L = m.lane.cum[m.lane.cum.length - 1];
        m.s = (m.s + m.v * dt + L) % L;
        const p = along(m.lane.pts, m.lane.cum, m.s), d = dirOf(m.lane.pts, m.lane.cum, m.s);
        const off = m.lane.y > 50 ? m.side * 12 : m.side * 5;
        pos.set(p.x - d.y * off, m.lane.y + (m.lane.y > 50 ? Math.sin(now / 900 + i) * 2 : 0), p.y + d.x * off);
        q.setFromAxisAngle(up, Math.atan2(d.x, d.y));
        const big = m.lane.y > 50 ? 2.6 : 1.4;
        craft.setMatrixAt(i, m4.compose(pos, q, sc.set(big, big, big)));
      });
      craft.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- helpers ----
function mergeShapes(gs: THREE.BufferGeometry[]) {
  const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nrm.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    if (g.attributes.color) col.set(g.attributes.color.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
function ribbon(pts: THREE.Vector2[], width: number, y: number) {
  const pos: number[] = [];
  const edge = (i: number, side: number) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1;
    return [pts[i].x - (dz / l) * side * width / 2, y, pts[i].y + (dx / l) * side * width / 2];
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = edge(i, -1), b = edge(i, 1), c = edge(i + 1, -1), d = edge(i + 1, 1);
    pos.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // face up whichever way the line runs
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
  }
  return g;
}
function offsetLine(pts: THREE.Vector2[], by: number) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1;
    return new THREE.Vector2(p.x - (dz / l) * by, p.y + (dx / l) * by);
  });
}
function along(pts: THREE.Vector2[], cum: number[], s: number) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
  return pts[i - 1].clone().lerp(pts[i], Math.max(0, Math.min(1, t)));
}
function dirOf(pts: THREE.Vector2[], cum: number[], s: number) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  return pts[i].clone().sub(pts[i - 1]).normalize();
}
/** A tower block for the skyline, its uv carrying the facade type and its top height for the neon. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, style: number, seed: number, top: number) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, style + 10 * Math.round(top), seed);
  return g;
}
