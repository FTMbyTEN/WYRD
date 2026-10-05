import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makePerson, randomBuild } from './people';

const DANFO = 0xf2c200;

const m = (color: number, rough = 0.4, metal = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const yellow = m(DANFO, 0.38, 0.25);
const black = m(0x141414, 0.5, 0.2);
const glass = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.08, metalness: 0.7 });
const chrome = m(0xc8ccd0, 0.25, 0.9);
const rubber = m(0x111111, 0.9, 0);
const rim = m(0x8a8f96, 0.4, 0.8);
const headlight = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffeec0, emissiveIntensity: 0.3 });
const tail = new THREE.MeshStandardMaterial({ color: 0xa31212, emissive: 0x6a0808, emissiveIntensity: 0.4 });
const amber = new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0x7a4200, emissiveIntensity: 0.4 });
// the danfo is one mesh: colour in the vertices, a slight sheen on the paint
const busMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 });
const BAGS = [0x7a4a2a, 0x2a46ff, 0xb23a48, 0x2f8f5b, 0x8c6d3f, 0xe7e2d6];

/** A rounded box: the danfo's body has soft edges, not a brick's. */
function rounded(w: number, h: number, d: number, r: number) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - r * 2) / 2);
  return g;
}

/**
 * A Lagos danfo, after the Volkswagen T3 that made it famous: a boxy egg-yolk-yellow minibus with a
 * flat nose, two black stripes, a row of side windows split by pillars, the sliding door open on the
 * kerb side with the conductor leaning out, rust and a dented panel, a roof rack piled with bags --
 * and, in 2099, hover thrusters ringed in cyan. One merged mesh. Its length runs along +x (the front).
 */
export function makeDanfo(shadows = true) {
  const g = new THREE.Group();
  // the T3 shape: a box van, 4.6 m long, flat upright nose; length runs along +x (the front)
  const L = 4.6, W = 1.86, base = 0.42, waist = 1.28, roof = 2.32;
  const parts: { geo: THREE.BufferGeometry; color: number }[] = [];
  const add = (geo: THREE.BufferGeometry, color: number) => parts.push({ geo, color });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const YEL = 0xf2b705, YEL2 = 0xe0a400, BLACK = 0x121212, GLASS = 0x10181f, RUST = 0x8a4a1c;
  // lower body and the cabin above it; the roof's edges rounded
  add(rounded(L, waist - base, W, 0.12).translate(0, (base + waist) / 2, 0), YEL);
  add(rounded(L - 0.25, roof - waist, W - 0.06, 0.22).translate(-0.12, (waist + roof) / 2, 0), YEL);
  // the flat nose: a slightly raked windscreen above a dark grille band with square lamps
  add(box(0.06, 0.78, W - 0.34, L / 2 - 0.2, 1.78, 0).rotateZ(0).translate(0, 0, 0), GLASS);
  add(box(0.05, 0.26, W - 0.1, L / 2 + 0.01, 0.82, 0), BLACK);
  for (const s of [-1, 1]) {
    add(box(0.06, 0.2, 0.26, L / 2 + 0.03, 0.82, s * 0.66), 0xfff1c8); // headlamps
    add(box(0.05, 0.1, 0.16, L / 2 + 0.03, 0.62, s * 0.78), 0xff9a1a); // indicators
    add(box(0.05, 0.32, 0.18, -L / 2 - 0.01, 1.05, s * 0.72), 0xa31212); // tail lights
  }
  add(box(0.14, 0.16, W + 0.04, L / 2 + 0.06, 0.52, 0), 0x2a2a2a); // bumpers
  add(box(0.14, 0.16, W + 0.04, -L / 2 - 0.06, 0.52, 0), 0x2a2a2a);
  // the two black stripes along each side (and round the back)
  for (const y of [waist - 0.02, 0.86]) add(box(L + 0.02, 0.09, W + 0.02, 0, y, 0), BLACK);
  // the side windows: a dark band split by yellow pillars, both sides; rear windows too
  for (const s of [-1, 1]) {
    add(box(L - 0.75, 0.62, 0.02, -0.2, 1.86, s * (W / 2 - 0.02)), GLASS);
    for (let i = 0; i < 5; i++) add(box(0.09, 0.64, 0.03, -L / 2 + 0.5 + i * 0.9, 1.86, s * (W / 2 - 0.01)), YEL);
  }
  add(box(0.02, 0.55, W - 0.5, -L / 2 + 0.11, 1.86, 0), GLASS);
  // the sliding door, open on the kerb side (+z): a dark doorway
  add(box(1.0, 1.55, 0.04, 0.55, 1.2, W / 2 + 0.005), 0x060606);
  add(box(1.02, 1.5, 0.05, -0.55, 1.2, W / 2 + 0.06), YEL2); // the door, slid back along the side
  // wear: rust patches and a dented panel
  add(box(0.5, 0.18, 0.02, 1.4, 0.6, W / 2 + 0.01), RUST);
  add(box(0.35, 0.25, 0.02, -1.6, 0.68, -W / 2 - 0.01), RUST);
  add(box(0.6, 0.3, 0.02, -0.4, 1.0, -W / 2 - 0.012), YEL2);
  // the roof rack, piled with bags
  add(box(L * 0.7, 0.04, W * 0.86, -0.3, roof + 0.1, 0), BLACK);
  for (let i = 0; i < 6; i++) add(box(0.35 + Math.random() * 0.4, 0.22 + Math.random() * 0.3, 0.35 + Math.random() * 0.45, -1.6 + i * 0.55, roof + 0.3, (Math.random() - 0.5) * 0.9).rotateY(0), BAGS[i % BAGS.length]);
  // 2099: hover thrusters underneath, ringed in cyan
  for (const [x, z] of [[1.3, 0.6], [1.3, -0.6], [-1.3, 0.6], [-1.3, -0.6]] as const) {
    add(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 10).translate(x, base - 0.04, z), 0x2a2d33);
    add(new THREE.TorusGeometry(0.3, 0.035, 4, 12).rotateX(Math.PI / 2).translate(x, base - 0.12, z), 0x00e5ff);
  }
  // one mesh for the whole bus
  const geos = parts.map(({ geo, color }) => {
    const c = new THREE.Color(color), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    const ng = (geo.index ? geo.toNonIndexed() : geo);
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    ng.setAttribute('color', new THREE.BufferAttribute(geo.index ? new Float32Array(ng.attributes.position.count * 3).map((_, i) => [c.r, c.g, c.b][i % 3]) : arr, 3));
    return ng;
  });
  const merged = mergeGeometries(geos)!;
  const body = new THREE.Mesh(merged, busMat);
  body.castShadow = shadows;
  body.receiveShadow = true;
  g.add(body);
  // the conductor, leaning out of the open door calling the route
  const conductor = makePerson({ ...randomBuild(Math.random), sex: 'm', outfit: 'shirt', hairStyle: 'cap' }, { shadows });
  conductor.root.position.set(0.55, 0.45, W / 2 + 0.15);
  conductor.root.rotation.y = Math.PI / 2 - 0.4;
  conductor.joints.rShoulder.rotation.x = -2.6; // holding the roof rail
  conductor.joints.rShoulder.rotation.z = -0.3;
  conductor.joints.lShoulder.rotation.x = -0.9; // calling for passengers
  conductor.joints.lElbow.rotation.x = -0.8;
  conductor.body.rotation.z = -0.15; // leaning out
  g.add(conductor.root);
  return { group: g, wheels: [] as THREE.Group[], length: L + 0.3, width: W };
}

export function makeOkada(shadows = true) {
  const g = new THREE.Group();
  const red = m(0x8c1d1d, 0.35, 0.4);
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), red);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0.15, 0.82, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.3), black);
  seat.position.set(-0.35, 0.86, 0);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), chrome);
  frame.position.set(0, 0.55, 0);
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7), chrome);
  bars.rotation.x = Math.PI / 2;
  bars.position.set(0.62, 1.08, 0);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75), chrome);
  fork.position.set(0.72, 0.68, 0);
  fork.rotation.z = 0.35;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), headlight);
  lamp.position.set(0.82, 0.98, 0);
  g.add(tank, seat, frame, bars, fork, lamp);
  const wheels: THREE.Group[] = [];
  for (const x of [0.78, -0.72]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 18), rubber);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), rim);
    h.rotation.x = Math.PI / 2;
    w.add(t, h);
    w.position.set(x, 0.36, 0);
    wheels.push(w);
    g.add(w);
  }
  tank.castShadow = shadows;
  const rider = makePerson({ ...randomBuild(Math.random), sex: 'm', outfit: 'shirt', hairStyle: 'cap' }, { shadows });
  rider.root.position.set(-0.3, 0.05, 0);
  rider.root.rotation.y = Math.PI / 2;
  rider.joints.lHip.rotation.x = rider.joints.rHip.rotation.x = -1.35;
  rider.joints.lKnee.rotation.x = rider.joints.rKnee.rotation.x = 1.45;
  rider.joints.lShoulder.rotation.x = rider.joints.rShoulder.rotation.x = -1.1;
  rider.joints.lElbow.rotation.x = rider.joints.rElbow.rotation.x = -0.4;
  rider.body.rotation.x = 0.25;
  g.add(rider.root);
  return { group: g, wheels, length: 1.9, width: 0.8 };
}

/** A keke (tricycle taxi): yellow-and-green canopy, an open passenger bench, the driver up front. */
export function makeKeke(shadows = true) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(rounded(2.4, 0.9, 1.3, 0.25), yellow);
  body.position.set(0, 0.85, 0);
  body.castShadow = shadows;
  const canopy = new THREE.Mesh(rounded(2.3, 0.12, 1.35, 0.05), m(0x1f7a3a, 0.6, 0.1));
  canopy.position.set(-0.05, 2.0, 0);
  canopy.castShadow = shadows;
  const pillars: THREE.Mesh[] = [];
  for (const [x, z] of [[1.0, 0.6], [1.0, -0.6], [-1.1, 0.6], [-1.1, -0.6]]) {
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), black);
    pl.position.set(x, 1.5, z);
    pillars.push(pl);
  }
  const ws = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 1.1), glass);
  ws.position.set(1.05, 1.55, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.1, 1.32), m(0x1f7a3a, 0.6, 0.1));
  stripe.position.set(0, 0.95, 0);
  g.add(body, canopy, ws, stripe, ...pillars);
  const wheels: THREE.Group[] = [];
  for (const [x, z] of [[1.05, 0], [-0.9, 0.62], [-0.9, -0.62]]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 14), rubber);
    t.rotation.x = Math.PI / 2;
    w.add(t);
    w.position.set(x, 0.3, z);
    wheels.push(w);
    g.add(w);
  }
  const driver = makePerson({ ...randomBuild(Math.random), sex: 'm', outfit: 'shirt' }, { shadows });
  driver.root.position.set(0.55, 0.45, 0);
  driver.root.rotation.y = Math.PI / 2;
  driver.joints.lHip.rotation.x = driver.joints.rHip.rotation.x = -1.4;
  driver.joints.lKnee.rotation.x = driver.joints.rKnee.rotation.x = 1.4;
  driver.joints.lShoulder.rotation.x = driver.joints.rShoulder.rotation.x = -1.0;
  g.add(driver.root);
  return { group: g, wheels, length: 2.5, width: 1.35 };
}
