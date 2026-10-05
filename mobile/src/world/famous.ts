import * as THREE from 'three';
import { facadeMaterial } from './facade';

/**
 * Lagos' famous buildings, modelled at their real places (not generic towers):
 *  - Lagos Civic Centre (VI): the glass oval hall beside its slanted glass tower, on a plaza by the lagoon
 *  - the National Theatre, Iganmu: the "military cap" -- a ribbed drum under a wide brim and a raised crown
 *  - the Lekki Toll Plaza: a long wave of canopy over the toll booths, with its gantry sign
 *  - Eko Hotel & Suites: the white slab with blue glass, on Adetokunbo Ademola
 *  - the Cathedral Church of Christ, Marina: the stone church and its spire
 * Each is a handful of meshes (a few thousand triangles in all) and returns a tag for the map.
 */
type LatLon = [number, number];
export const FAMOUS: { name: string; at: LatLon }[] = [
  { name: 'Lagos Civic Centre', at: [6.4378, 3.4227] },
  { name: 'National Theatre', at: [6.4766, 3.3692] },
  { name: 'Lekki Toll Plaza', at: [6.4352, 3.4562] },
  { name: 'Eko Hotel & Suites', at: [6.4262, 3.4290] },
  { name: 'Cathedral Church of Christ', at: [6.4509, 3.3917] },
];

export function makeFamous(scene: THREE.Scene, P: (at: LatLon) => THREE.Vector2) {
  const group = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x5f8fa8, metalness: 0.9, roughness: 0.08, envMapIntensity: 1.2 });
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x1d3442, metalness: 0.85, roughness: 0.1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.55 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.8 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a8a74, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 0.7, roughness: 0.3 });
  const neon = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const windows = facadeMaterial({ bay: 1.6, tint: 0x2a5a78, glass: true });

  // ---- Lagos Civic Centre: an elliptical glass hall, a slanted-roof glass tower, a white plaza ----
  {
    const c = P(FAMOUS[0].at), ry = 0.35;
    add(new THREE.CylinderGeometry(42, 42, 1.2, 40), concrete, c.x, 0.6, c.y);
    const hall = add(new THREE.CylinderGeometry(1, 1, 18, 40), glass, c.x - 14, 9, c.y, ry);
    hall.scale.set(26, 1, 17);
    add(new THREE.CylinderGeometry(1, 1, 1.2, 40), white, c.x - 14, 18.6, c.y, ry).scale.set(27, 1, 18); // the roof rim
    // the tower: its roof slopes, the glass broken by white floor bands
    const tower = new THREE.BoxGeometry(22, 48, 16, 1, 12, 1).translate(0, 24, 0);
    const p = tower.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 47) p.setY(i, 40 + (p.getX(i) + 11) * 0.7); // slanted top
    tower.computeVertexNormals();
    add(tower, glass, c.x + 20, 0, c.y + 6, ry);
    for (let k = 1; k < 12; k++) add(new THREE.BoxGeometry(22.4, 0.35, 16.4), white, c.x + 20, k * 4, c.y + 6, ry);
    add(new THREE.BoxGeometry(23, 0.4, 0.4), neon(0x00e5ff), c.x + 20, 40.5, c.y - 2, ry);
  }

  // ---- the National Theatre: a ribbed drum, the brim, the crown (the "military cap") ----
  {
    const c = P(FAMOUS[1].at);
    add(new THREE.CylinderGeometry(52, 56, 16, 48), concrete, c.x, 8, c.y);
    // vertical ribs round the drum
    const ribs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      ribs.push(new THREE.BoxGeometry(1.4, 16, 2.2).rotateY(-a).translate(Math.cos(a) * 55, 8, Math.sin(a) * 55));
    }
    add(merge(ribs), white, c.x, 0, c.y);
    add(new THREE.CylinderGeometry(70, 64, 3, 48), white, c.x, 17.5, c.y); // the brim
    add(new THREE.CylinderGeometry(38, 44, 9, 48), concrete, c.x, 23.5, c.y); // the crown
    add(new THREE.CylinderGeometry(30, 38, 4, 48), white, c.x, 30, c.y); // the cap's top
    add(new THREE.TorusGeometry(70, 0.35, 4, 64).rotateX(Math.PI / 2), neon(0xffc400), c.x, 19, c.y); // a gold ring at night
  }

  // ---- the Lekki Toll Plaza: a wave of canopy over ten booths, a gantry sign ----
  {
    const c = P(FAMOUS[2].at), ry = 0.12; // across the expressway (running roughly east-west)
    const N = 32, w = 120, pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const x = -w / 2 + (i / N) * w, y = 11 + Math.sin((i / N) * Math.PI * 3) * 2.2;
      pos.push(x, y, -14, x, y + 1.2, 14);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const canopy = new THREE.BufferGeometry();
    canopy.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    canopy.setIndex(idx); canopy.computeVertexNormals();
    const roof = add(canopy, white, c.x, 0, c.y, ry);
    (roof.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    for (let k = 0; k < 10; k++) {
      const x = -w / 2 + 8 + k * ((w - 16) / 9);
      add(new THREE.BoxGeometry(2.2, 3, 4), steel, 0, 1.5, 0).position.set(c.x + Math.cos(ry) * x, 1.5, c.y - Math.sin(ry) * x);
      add(new THREE.CylinderGeometry(0.45, 0.6, 11, 8), steel, c.x + Math.cos(ry) * x, 5.5, c.y - Math.sin(ry) * x);
      add(new THREE.BoxGeometry(0.2, 0.5, 4), neon(k % 2 ? 0x1aff9c : 0xff2bd6), c.x + Math.cos(ry) * x, 3.2, c.y - Math.sin(ry) * x, ry);
    }
    // the gantry sign
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#0a0f1a'; g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#ffc400'; g.font = 'bold 72px "Share Tech Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('LEKKI TOLL PLAZA', 512, 66);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(40, 5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }), c.x, 16.5, c.y, ry);
  }

  // ---- Eko Hotel & Suites: a white slab, blue glass, a lower wing ----
  {
    const c = P(FAMOUS[3].at), ry = -0.3;
    const slab = new THREE.BoxGeometry(70, 64, 18).translate(0, 32, 0);
    const uv = slab.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 3 + 10 * 64, 0.37);
    add(slab, windows, c.x, 0, c.y, ry);
    add(new THREE.BoxGeometry(72, 2, 20), white, c.x, 65, c.y, ry);
    add(new THREE.BoxGeometry(50, 14, 34), white, c.x + 30, 7, c.y + 26, ry);
    add(new THREE.BoxGeometry(30, 0.6, 1), neon(0x4a6bff), c.x, 66.5, c.y - 10, ry);
  }

  // ---- Cathedral Church of Christ, Marina: a long nave, a square tower, a spire ----
  {
    const c = P(FAMOUS[4].at), ry = 0.1;
    add(new THREE.BoxGeometry(18, 16, 52).translate(0, 8, 0), stone, c.x, 0, c.y, ry);
    const roof = new THREE.CylinderGeometry(0.01, 12, 8, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 2.9).translate(0, 20, 0);
    add(roof, darkGlass, c.x, 0, c.y, ry);
    add(new THREE.BoxGeometry(10, 34, 10).translate(0, 17, 0), stone, c.x + Math.sin(ry) * 30, 0, c.y + Math.cos(ry) * 30, ry);
    add(new THREE.ConeGeometry(6, 22, 4).rotateY(Math.PI / 4).translate(0, 45, 0), darkGlass, c.x + Math.sin(ry) * 30, 0, c.y + Math.cos(ry) * 30, ry);
    add(new THREE.BoxGeometry(0.4, 4, 2.4), neon(0xffeac0), c.x + Math.sin(ry) * 30, 58, c.y + Math.cos(ry) * 30, ry); // the cross, lit
    add(new THREE.BoxGeometry(2.4, 0.4, 0.4), neon(0xffeac0), c.x + Math.sin(ry) * 30, 59, c.y + Math.cos(ry) * 30, ry);
  }

  scene.add(group);
  return { group, tags: FAMOUS.map((f) => ({ name: f.name, p: P(f.at) })) };
}

function merge(gs: THREE.BufferGeometry[]) {
  const pos: number[] = [], nrm: number[] = [];
  for (const g0 of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.attributes.position.array as Float32Array));
    nrm.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}
