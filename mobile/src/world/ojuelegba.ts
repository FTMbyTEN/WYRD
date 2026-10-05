import * as THREE from 'three';
import { makePerson, randomBuild, type Person } from './people';
import { makeDanfo } from './vehicles';

type Box = { x: number; z: number; w: number; d: number; h: number };
type Ctx = {
  scene: THREE.Scene; roadsAt: number[]; HALF: number; ROAD: number; BLOCK: number;
  blockAt: (g: number) => number; lowRise: Box[]; shadows: boolean; rnd: () => number;
  park: { x: number; z: number }; // the motor park block, under the edge of the flyover
};

/** Worn Lagos asphalt: patched, cracked, oil-stained, sun-bleached at the edges. */
export function wornAsphalt() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#34363a'; x.fillRect(0, 0, 512, 512);
  const r = (n: number) => Math.random() * n;
  for (let i = 0; i < 9000; i++) { const v = 40 + r(40); x.fillStyle = `rgba(${v},${v},${v + 3},0.35)`; x.fillRect(r(512), r(512), 2, 2); } // grain
  for (let i = 0; i < 10; i++) { const v = 38 + r(14); x.fillStyle = `rgba(${v},${v},${v + 2},0.3)`; x.fillRect(r(512), r(512), 30 + r(60), 40 + r(80)); } // patches: repairs, close to the road's own grey
  for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(10,10,12,0.35)'; x.beginPath(); x.ellipse(r(512), r(512), 10 + r(30), 6 + r(18), r(3), 0, 7); x.fill(); } // oil stains
  x.strokeStyle = 'rgba(15,15,17,0.7)'; x.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { x.beginPath(); let px = r(512), py = r(512); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += r(40) - 20; py += r(40) - 20; x.lineTo(px, py); } x.stroke(); } // cracks
  x.fillStyle = 'rgba(120,80,55,0.12)'; x.fillRect(0, 0, 40, 512); x.fillRect(472, 0, 40, 512); // red dust blown onto the edges
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const striped = (a: string, b: string, n = 8) => {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 8;
  const x = cv.getContext('2d')!;
  for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect((i * 64) / n, 0, 64 / n, 8); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const corrugated = (base: string) => {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 8;
  const x = cv.getContext('2d')!;
  x.fillStyle = base; x.fillRect(0, 0, 64, 8);
  for (let i = 0; i < 64; i += 4) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 1.5, 8); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export type Ojuelegba = {
  colliders: Box[];
  crowd: { person: Person; sway: number }[]; // people standing about at the park and the stop
  deckTraffic: { mesh: THREE.Group; wheels: THREE.Group[]; t: number; dir: number; speed: number }[];
  deckY: number;
  hawkers: Person[];
};

/**
 * What makes it Ojuelegba rather than any town:
 *  - the flyover: a raised dual carriageway on columns down the main road, with its own traffic, a
 *    green OJUELEGBA gantry sign, and lamp posts along the deck;
 *  - the motor park under its edge: danfos parked nose to tail, conductors and a waiting crowd, the
 *    bus-stop shelter and its sign;
 *  - yellow-and-black kerbs; electric poles with sagging wires on every street; satellite dishes;
 *  - roadside life: container shops, traders under umbrellas, hawkers with trays on their heads.
 */
export function buildOjuelegba(c: Ctx): Ojuelegba {
  const { scene, roadsAt, HALF, ROAD, BLOCK, blockAt, lowRise, shadows, rnd, park } = c;
  const colliders: Box[] = [];
  const crowd: Ojuelegba['crowd'] = [];
  const hawkers: Person[] = [];
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.95 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x8e887d, roughness: 0.95 });

  // ---- the flyover, down the main road (z = mainZ) ----
  const mainZ = roadsAt[Math.floor(roadsAt.length / 2)];
  const deckY = 7.2, deckW = 11, len = HALF * 2 + 160;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, deckW), concrete);
  deck.position.set(0, deckY, mainZ);
  deck.castShadow = shadows; deck.receiveShadow = true;
  scene.add(deck);
  const deckTop = new THREE.Mesh(new THREE.PlaneGeometry(len, deckW - 1), new THREE.MeshStandardMaterial({ map: (() => { const t = wornAsphalt(); t.repeat.set(len / 16, 1); return t; })(), roughness: 0.9 }));
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.set(0, deckY + 0.56, mainZ);
  deckTop.receiveShadow = true;
  scene.add(deckTop);
  // parapets with the yellow-and-black stripe Lagos paints on everything that can be hit
  const stripeTex = striped('#f2c200', '#141414', 10);
  stripeTex.repeat.set(len / 6, 1);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.3), concrete);
    wall.position.set(0, deckY + 1.05, mainZ + side * (deckW / 2 - 0.15));
    const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.32), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 }));
    band.position.set(0, deckY - 0.25, mainZ + side * (deckW / 2 + 0.02));
    scene.add(wall, band);
  }
  // columns down the median, clear of the cross streets
  for (let x = -HALF - 70; x <= HALF + 70; x += 15) {
    if (roadsAt.some((r) => Math.abs(x - r) < 7)) continue;
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, deckY - 0.5, 2.6), darkConcrete);
    col.position.set(x, (deckY - 0.5) / 2, mainZ);
    col.castShadow = shadows; col.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, deckW - 1), darkConcrete);
    cap.position.set(x, deckY - 0.75, mainZ);
    scene.add(col, cap);
    colliders.push({ x, z: mainZ, w: 1.4, d: 2.6, h: deckY });
  }
  // lamp posts along the deck
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.5, roughness: 0.5 });
  for (let x = -HALF - 40; x <= HALF + 40; x += 22) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6), lampMat);
    l.position.set(x, deckY + 3.5, mainZ);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 4), lampMat);
    arm.position.set(x, deckY + 6.4, mainZ);
    scene.add(l, arm);
  }
  // the green gantry sign: OJUELEGBA
  const signCv = document.createElement('canvas');
  signCv.width = 1024; signCv.height = 256;
  const sx = signCv.getContext('2d')!;
  sx.fillStyle = '#0f6a3a'; sx.fillRect(0, 0, 1024, 256);
  sx.strokeStyle = '#ffffff'; sx.lineWidth = 10; sx.strokeRect(14, 14, 996, 228);
  sx.fillStyle = '#ffffff'; sx.font = 'bold 110px Arial, sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
  sx.fillText('OJUELEGBA', 512, 105);
  sx.font = 'bold 44px Arial, sans-serif';
  sx.fillText('← SURULERE    ·    YABA / TEJUOSHO →', 512, 196);
  const signTex = new THREE.CanvasTexture(signCv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  for (const x of [-HALF + 20, HALF - 20]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, side: THREE.DoubleSide }));
    board.position.set(x, deckY + 5.2, mainZ);
    board.rotation.y = Math.PI / 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.5, 0.25), lampMat);
    post.position.set(x, deckY + 2.8, mainZ - 4.8);
    const post2 = post.clone();
    post2.position.z = mainZ + 4.8;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 10), lampMat);
    beam.position.set(x, deckY + 5, mainZ);
    scene.add(board, post, post2, beam);
  }
  // traffic up on the deck
  const deckTraffic: Ojuelegba['deckTraffic'] = [];
  for (let i = 0; i < (shadows ? 6 : 3); i++) {
    const v = makeDanfo(false);
    const dir = i % 2 ? 1 : -1;
    v.group.position.set(0, deckY + 0.55, mainZ + (dir > 0 ? -2.4 : 2.4));
    v.group.rotation.y = dir > 0 ? 0 : Math.PI;
    scene.add(v.group);
    deckTraffic.push({ mesh: v.group, wheels: v.wheels, t: -HALF + rnd() * HALF * 2, dir, speed: 9 + rnd() * 4 });
  }

  // ---- kerbs: yellow and black, round every block ----
  const kerbTex = striped('#f2c200', '#141414', 8);
  kerbTex.repeat.set(BLOCK / 2, 1);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.8 });
  for (let gx = 0; gx < roadsAt.length - 1; gx++) for (let gz = 0; gz < roadsAt.length - 1; gz++) {
    const cx = blockAt(gx), cz = blockAt(gz);
    for (const [dx, dz, rot] of [[0, -BLOCK / 2, 0], [0, BLOCK / 2, 0], [-BLOCK / 2, 0, Math.PI / 2], [BLOCK / 2, 0, Math.PI / 2]] as const) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.24, 0.22), kerbMat);
      k.position.set(cx + dx, 0.12, cz + dz);
      k.rotation.y = rot;
      scene.add(k);
    }
  }

  // ---- electric poles and their sagging wires, down both sides of every street ----
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.95 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 9, 8);
  const barGeo = new THREE.BoxGeometry(1.8, 0.12, 0.12);
  const wirePts: number[] = [];
  const poles: THREE.Vector3[][] = [];
  for (const r of roadsAt) {
    for (const horizontal of [true, false]) {
      if (horizontal && r === mainZ) continue; // the flyover road carries no poles
      const line: THREE.Vector3[] = [];
      for (let d = -HALF + 4; d <= HALF - 4; d += 17) {
        if (roadsAt.some((q) => Math.abs(d - q) < 6)) continue;
        const pos = horizontal ? new THREE.Vector3(d, 0, r + ROAD / 2 + 1.1) : new THREE.Vector3(r - ROAD / 2 - 1.1, 0, d);
        line.push(pos);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(pos.x, 4.5, pos.z);
        pole.castShadow = shadows;
        const bar = new THREE.Mesh(barGeo, poleMat);
        bar.position.set(pos.x, 8.4, pos.z);
        bar.rotation.y = horizontal ? Math.PI / 2 : 0;
        scene.add(pole, bar);
        colliders.push({ x: pos.x, z: pos.z, w: 0.4, d: 0.4, h: 9 });
      }
      poles.push(line);
    }
  }
  for (const line of poles) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      for (const off of [-0.7, 0, 0.7]) {
        const along = new THREE.Vector3().subVectors(b, a).normalize();
        const side = new THREE.Vector3(-along.z, 0, along.x).multiplyScalar(off);
        const sag = 1.1 + Math.abs(off) * 0.4;
        for (let k = 0; k < 10; k++) {
          const t0 = k / 10, t1 = (k + 1) / 10;
          const p0 = a.clone().lerp(b, t0).add(side), p1 = a.clone().lerp(b, t1).add(side);
          p0.y = 8.4 - Math.sin(Math.PI * t0) * sag; p1.y = 8.4 - Math.sin(Math.PI * t1) * sag;
          wirePts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));

  // ---- satellite dishes on the roofs ----
  const dish = new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6);
  const dishes = new THREE.InstancedMesh(dish, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, side: THREE.DoubleSide }), lowRise.length);
  const tmp = new THREE.Object3D();
  let nd = 0;
  for (const b of lowRise) {
    if (rnd() < 0.45) continue;
    tmp.position.set(b.x - b.w / 4, b.h + 0.8, b.z + b.d / 4);
    tmp.rotation.set(-1.0, rnd() * 6, 0);
    tmp.updateMatrix();
    dishes.setMatrixAt(nd++, tmp.matrix);
  }
  dishes.count = nd;
  scene.add(dishes);

  // ---- the motor park: danfos nose to tail, a shelter, conductors and the waiting crowd ----
  const parkZ = park.z + BLOCK / 2 - 4.5, parkX0 = park.x - BLOCK / 2 + 3;
  for (let i = 0; i < 4; i++) {
    const v = makeDanfo(shadows);
    v.group.position.set(parkX0 + i * 5.3, 0.18, parkZ);
    scene.add(v.group);
    colliders.push({ x: parkX0 + i * 5.3, z: parkZ, w: v.length, d: v.width, h: 3 });
  }
  // the bus-stop shelter and its sign
  const shelterX = park.x + BLOCK / 2 - 4, shelterZ = park.z + BLOCK / 2 - 1.6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 2), new THREE.MeshStandardMaterial({ color: 0x2a46ff, roughness: 0.5, metalness: 0.3 }));
  roof.position.set(shelterX, 2.8, shelterZ);
  roof.castShadow = shadows;
  scene.add(roof);
  for (const dx of [-2.3, 2.3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8), lampMat);
    leg.position.set(shelterX + dx, 1.4, shelterZ - 0.8);
    scene.add(leg);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.5), darkConcrete);
  bench.position.set(shelterX, 0.6, shelterZ - 0.6);
  scene.add(bench);
  const stopCv = document.createElement('canvas');
  stopCv.width = 512; stopCv.height = 128;
  const st = stopCv.getContext('2d')!;
  st.fillStyle = '#f2c200'; st.fillRect(0, 0, 512, 128);
  st.fillStyle = '#141414'; st.font = 'bold 54px Arial, sans-serif'; st.textAlign = 'center'; st.textBaseline = 'middle';
  st.fillText('OJUELEGBA B/STOP', 256, 66, 490);
  const stopTex = new THREE.CanvasTexture(stopCv);
  stopTex.colorSpace = THREE.SRGBColorSpace;
  const stopSign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshStandardMaterial({ map: stopTex, side: THREE.DoubleSide }));
  stopSign.position.set(shelterX, 3.3, shelterZ);
  scene.add(stopSign);
  colliders.push({ x: shelterX, z: shelterZ - 0.6, w: 4.6, d: 0.6, h: 1 });
  // people: waiting at the stop, standing about the park, conductors calling by the buses
  for (let i = 0; i < (shadows ? 16 : 8); i++) {
    const p = makePerson(randomBuild(rnd), { shadows });
    const atStop = i < 7;
    const x = atStop ? shelterX - 2 + rnd() * 4 : parkX0 - 1 + rnd() * 18;
    const z = atStop ? shelterZ + 0.3 + rnd() * 1.2 : parkZ + 2 + rnd() * 2.5;
    p.root.position.set(x, 0.18, z);
    p.root.rotation.y = atStop ? Math.PI * (rnd() < 0.7 ? 0 : 1) + (rnd() - 0.5) : rnd() * 6;
    if (!atStop && i % 3 === 0) { p.joints.rShoulder.rotation.x = -2.2; } // a conductor's arm up, calling
    scene.add(p.root);
    crowd.push({ person: p, sway: rnd() * 6 });
    colliders.push({ x, z, w: 0.5, d: 0.5, h: 1.8 });
  }

  // ---- roadside: container shops and traders under umbrellas ----
  const CONTAINER = ['#2a46ff', '#d9472b', '#2f8f5b', '#e07b1f', '#8c2f7a'];
  for (let i = 0; i < 3; i++) {
    const x = park.x - BLOCK / 2 + 3.6, z = park.z - BLOCK / 2 + 4 + i * 6.6;
    const tex = corrugated(CONTAINER[i % CONTAINER.length]);
    tex.repeat.set(3, 1);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3 }));
    box.position.set(x, 1.48, z);
    box.castShadow = shadows; box.receiveShadow = true;
    scene.add(box);
    colliders.push({ x, z, w: 2.4, d: 6, h: 2.6 });
  }
  const UMB = [0xd9472b, 0x2a46ff, 0xf2c200, 0x2f8f5b, 0xe7e2d6, 0x8c2f7a];
  const umbGeo = new THREE.ConeGeometry(1.5, 0.7, 10);
  for (let i = 0; i < 14; i++) {
    const r = roadsAt[Math.floor(rnd() * roadsAt.length)];
    if (r === mainZ) continue;
    const along = -HALF + 8 + rnd() * (HALF * 2 - 16);
    if (roadsAt.some((q) => Math.abs(along - q) < 7)) continue;
    const x = along, z = r + ROAD / 2 + 0.5;
    const u = new THREE.Mesh(umbGeo, new THREE.MeshStandardMaterial({ color: UMB[i % UMB.length], roughness: 0.8, side: THREE.DoubleSide }));
    u.position.set(x, 2.3, z);
    u.castShadow = shadows;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3), lampMat);
    pole.position.set(x, 1.15, z);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 0.9 }));
    tray.position.set(x + 0.4, 0.43, z);
    const trader = makePerson({ ...randomBuild(rnd), sex: 'f', outfit: 'wrapper' }, { shadows: false });
    trader.root.position.set(x - 0.5, -0.25, z + 0.3);
    trader.joints.lHip.rotation.x = trader.joints.rHip.rotation.x = -1.5; // sitting on a stool
    trader.joints.lKnee.rotation.x = trader.joints.rKnee.rotation.x = 1.5;
    scene.add(u, pole, tray, trader.root);
    colliders.push({ x: x + 0.1, z, w: 1.6, d: 1.0, h: 1 });
  }

  // hawkers: trays piled on their heads, walking the traffic (positions driven by the world loop)
  for (let i = 0; i < (shadows ? 6 : 3); i++) {
    const p = makePerson({ ...randomBuild(rnd), outfit: rnd() < 0.5 ? 'wrapper' : 'shirt' }, { shadows });
    const trayHead = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0xc7c2b8, metalness: 0.6, roughness: 0.4 }));
    trayHead.position.y = 0.42;
    p.joints.neck.add(trayHead);
    const goods = [0xe07b1f, 0x6ea33a, 0xd9472b, 0xf2c200];
    for (let k = 0; k < 7; k++) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshStandardMaterial({ color: goods[k % goods.length], roughness: 0.6 }));
      g.position.set(Math.cos(k) * 0.16, 0.5, Math.sin(k) * 0.16);
      p.joints.neck.add(g);
    }
    p.joints.lShoulder.rotation.x = -2.9; // one hand steadying the tray
    p.joints.lElbow.rotation.x = -0.6;
    scene.add(p.root);
    hawkers.push(p);
  }

  return { colliders, crowd, deckTraffic, deckY, hawkers };
}
