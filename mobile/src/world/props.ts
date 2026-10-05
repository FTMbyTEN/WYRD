import * as THREE from 'three';

/**
 * Street life for NAIJA 2099's Lagos: the things that make a street feel lived in -- shop awnings,
 * balconies with railings, black water tanks, solar panels and satellite dishes on the roofs, almond
 * and palm trees, market stalls under umbrellas, container kiosks, parked hover-danfos and cars.
 *
 * Each prop is a small prefab of coloured parts, placed by the city builder from the real map (which
 * side of a building faces a street, where the kerbs are). Placed props are merged into one mesh per
 * tile with vertex colours, so a whole district of detail costs one draw call.
 */
type Part = { g: THREE.BufferGeometry; color: number | 'tint' | 'tint2' };
export type Prefab = Part[];

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z);

export const PREFABS = {
  // a shopfront awning, hung from the wall (local +z points into the street); width is scaled per shop
  awning: [{ g: box(1, 0.06, 1.3, 0, 0, 0.65), color: 'tint' }, { g: box(1, 0.22, 0.04, 0, -0.12, 1.3), color: 'tint2' }] as Prefab,
  // a balcony: slab and railing, along a street-facing wall
  balcony: [{ g: box(1, 0.14, 1.0, 0, 0, 0.5), color: 0x9a978f }, { g: box(1, 0.85, 0.05, 0, 0.45, 1.0), color: 0x2b2d31 }, { g: box(0.05, 0.85, 1.0, -0.5, 0.45, 0.5), color: 0x2b2d31 }, { g: box(0.05, 0.85, 1.0, 0.5, 0.45, 0.5), color: 0x2b2d31 }] as Prefab,
  // the black plastic water tank on every Lagos roof
  tank: [{ g: cyl(0.55, 0.6, 1.3, 10), color: 0x1a1b1e }, { g: cyl(0.25, 0.25, 0.12, 8, 0, 1.3), color: 0x2a2b2e }, { g: box(1.4, 0.25, 1.4, 0, -0.12), color: 0x6a6660 }] as Prefab,
  // a solar panel on legs, tilted to the sun
  solar: [{ g: box(1.7, 0.05, 1.05).rotateX(-0.35).translate(0, 0.55, 0), color: 0x1a2a4a }, { g: box(0.06, 0.5, 0.06, -0.7, 0.25, 0.35), color: 0x8a8d92 }, { g: box(0.06, 0.5, 0.06, 0.7, 0.25, 0.35), color: 0x8a8d92 }] as Prefab,
  dish: [{ g: new THREE.SphereGeometry(0.45, 8, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-1.1).translate(0, 0.9, 0), color: 0xd8d8d4 }, { g: cyl(0.04, 0.04, 0.8, 5), color: 0x6a6d72 }] as Prefab,
  // an almond tree: a broad, flat canopy on a short trunk (the shade tree of Lagos streets)
  almond: [{ g: cyl(0.14, 0.2, 3.2, 6), color: 0x4a3626 }, { g: new THREE.IcosahedronGeometry(2.4, 0).scale(1.25, 0.55, 1.25).translate(0, 3.9, 0), color: 'tint' }, { g: new THREE.IcosahedronGeometry(1.6, 0).scale(1.2, 0.5, 1.2).translate(0.6, 4.7, -0.3), color: 'tint2' }] as Prefab,
  // a palm: tall thin trunk, a crown of fronds
  palm: [{ g: cyl(0.12, 0.2, 6.5, 6), color: 0x6a5640 }, ...Array.from({ length: 7 }, (_, i) => ({ g: box(0.5, 0.05, 2.6, 0, 0, 1.3).rotateX(0.5).rotateY((i / 7) * Math.PI * 2).translate(0, 6.5, 0), color: (i % 2 ? 'tint' : 'tint2') as 'tint' | 'tint2' }))] as Prefab,
  // a market stall: a table of goods under an umbrella
  stall: [{ g: box(2.0, 0.85, 1.1, 0, 0.42, 0), color: 0x6b4a32 }, { g: box(1.8, 0.2, 0.9, 0, 0.95, 0), color: 'tint2' }, { g: cyl(0.03, 0.03, 2.3, 4), color: 0x4a4a4a }, { g: new THREE.ConeGeometry(1.7, 0.7, 8).translate(0, 2.55, 0), color: 'tint' }] as Prefab,
  // a converted shipping container: a kiosk with its shutter up and a sign
  kiosk: [{ g: box(2.4, 2.5, 2.1, 0, 1.25, 0), color: 'tint' }, { g: box(1.8, 1.2, 0.05, 0, 1.4, 1.06), color: 0x101214 }, { g: box(2.2, 0.4, 0.06, 0, 2.3, 1.09), color: 'tint2' }] as Prefab,
  // parked: a hover-car (low, sleek) and a hover-danfo (the yellow bus with its black stripes)
  car: [{ g: box(1.9, 0.75, 4.3, 0, 0.75, 0), color: 'tint' }, { g: box(1.6, 0.55, 2.0, 0, 1.38, -0.2), color: 0x0a1218 }, { g: box(1.95, 0.06, 4.35, 0, 0.42, 0), color: 0x00e5ff }] as Prefab,
  danfo: [{ g: box(2.0, 1.9, 5.2, 0, 1.35, 0), color: 0xf2c200 }, { g: box(2.02, 0.12, 5.22, 0, 1.0, 0), color: 0x16171a }, { g: box(2.02, 0.12, 5.22, 0, 1.7, 0), color: 0x16171a }, { g: box(2.04, 0.6, 3.6, 0, 1.95, -0.3), color: 0x101418 }] as Prefab,
};

export const AWNING_COLORS = [0xd9472b, 0x2a46ff, 0xf2c200, 0x2f8f5b, 0xe07b1f, 0x8c2f7a, 0x1f6f8b, 0xefe6d6];
export const UMBRELLA_COLORS = [0xd9472b, 0x2a46ff, 0xf2c200, 0x2f8f5b, 0xefe6d6, 0xe07b1f];
export const GOODS_COLORS = [0xe07b1f, 0xd9472b, 0x6ea33a, 0xf2c200, 0xe8d9a8];
export const LEAF_COLORS = [0x3f6e2e, 0x4c7d34, 0x35612a, 0x5a8a3a];
export const CAR_COLORS = [0x1b2440, 0xd9dde4, 0x16171a, 0x8a1c24, 0x2a46ff, 0x3a3d44];
export const KIOSK_COLORS = [0x2a6e8a, 0xa8402c, 0x2f8f5b, 0xd8a028, 0x5a4a8c];

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
const col = new THREE.Color();

/**
 * One placed prop, as a geometry with vertex colours, ready to merge: at (x, y, z), turned [yaw]
 * (local +z faces that way), tilted [tilt] about its own x, scaled; 'tint' parts take [tint].
 */
export function place(p: Prefab, x: number, y: number, z: number, yaw: number, s: [number, number, number] = [1, 1, 1], tint = 0xffffff, tint2 = 0xffffff, tilt = 0) {
  e.set(tilt, yaw, 0, 'YXZ');
  m4.compose(ps.set(x, y, z), q.setFromEuler(e), sc.set(...s));
  const parts = p.map(({ g, color }) => {
    const c = g.clone().applyMatrix4(m4);
    col.setHex(color === 'tint' ? tint : color === 'tint2' ? tint2 : color);
    const n = c.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return c;
  });
  return parts;
}
