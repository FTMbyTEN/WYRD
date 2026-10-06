import * as THREE from 'three';
import { DISTRICTS } from './landmarks';

/**
 * The Eko Maglev: an elevated neon loop that links every district of the map -- Ikeja down through
 * Maryland, over the lagoon on the Third Mainland line, round the island (Lagos Island, Ikoyi, VI,
 * Eko Atlantic), back over to Apapa and up through Ebute-Metta, Yaba, Ojuelegba, Surulere and
 * Mushin. A station in each district: a lift of light from the street to the deck, and a sign.
 * Six trains run the loop and stop at every station; walk up to a station's lift and board the next.
 *
 * Light on purpose: the whole track (deck, rails, pylons) is three meshes, the trains two instanced
 * meshes, the stations a dozen sprites.
 */
const ORDER = ['Ikeja', 'Maryland', 'Oworonshoki', 'Third Mainland Bridge', 'Lagos Island', 'Ikoyi', 'Victoria Island', 'Eko Atlantic', 'Apapa', 'Ebute-Metta', 'Yaba', 'Ojuelegba', 'Surulere', 'Mushin'];
const STATION_NAMES: Record<string, string> = { 'Third Mainland Bridge': 'Lagoon (3MB)' };
export const DECK = 26; // metres above the street
const TRAINS = 6, CARS = 3, CAR_LEN = 17, GAP = 1.2, SPEED = 75, DWELL = 6;

export type Maglev = ReturnType<typeof makeMaglev>;

export function makeMaglev(scene: THREE.Scene, toWorld: (at: [number, number]) => THREE.Vector2) {
  const stops = ORDER.map((n) => DISTRICTS.find((d) => d.name === n)!).filter(Boolean)
    .map((d) => { const p = toWorld(d.at); return { name: STATION_NAMES[d.name] ?? d.name, p: new THREE.Vector3(p.x, DECK, p.y) }; });
  const curve = new THREE.CatmullRomCurve3(stops.map((s) => s.p), true, 'centripetal');
  const L = curve.getLength();
  // where each station sits along the loop (metres)
  const lens = curve.getLengths(stops.length * 200);
  const at = stops.map((_, i) => lens[i * 200]);

  // ---- the track: a dark deck, two cyan rails, pylons ----
  const N = Math.ceil(L / 14);
  const pts = curve.getSpacedPoints(N);
  const deckPos: number[] = [], railPos: number[] = [], idx: number[] = [], ridx: number[] = [];
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    tan.copy(pts[(i + 1) % (N + 1)]).sub(pts[i === N ? N - 1 : i]).setY(0).normalize();
    if (i === N) tan.negate();
    side.crossVectors(up, tan).normalize();
    const p = pts[i];
    for (const k of [-2.4, 2.4]) deckPos.push(p.x + side.x * k, p.y - 0.4, p.z + side.z * k);
    for (const k of [-1.3, -1.1, 1.1, 1.3]) railPos.push(p.x + side.x * k, p.y + 0.05, p.z + side.z * k);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      const r = i * 4;
      for (const o of [0, 2]) ridx.push(r + o, r + o + 4, r + o + 1, r + o + 1, r + o + 4, r + o + 5);
    }
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.setIndex(idx); deckGeo.computeVertexNormals();
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));
  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
  railGeo.setIndex(ridx);
  const rails = new THREE.Mesh(railGeo, new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false, side: THREE.DoubleSide }));
  const pylonGeo = new THREE.BoxGeometry(1.2, DECK, 1.2).translate(0, DECK / 2 - 0.4, 0);
  const pylonCount = Math.floor(N / 4);
  const pylons = new THREE.InstancedMesh(pylonGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.8 }), pylonCount);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < pylonCount; i++) pylons.setMatrixAt(i, m4.makeTranslation(pts[i * 4].x, 0, pts[i * 4].z));
  for (const o of [deck, rails, pylons]) { o.frustumCulled = false; o.matrixAutoUpdate = false; scene.add(o); }

  // ---- stations: a lift of light from the street and a sign ----
  const liftMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const liftGeo = new THREE.CylinderGeometry(2.2, 2.2, DECK, 10, 1, true).translate(0, DECK / 2, 0);
  const platGeo = new THREE.BoxGeometry(8, 0.6, 26);
  const platMat = new THREE.MeshStandardMaterial({ color: 0x1a1d26, emissive: 0xff2bd6, emissiveIntensity: 0.25 });
  const stations = stops.map((s, i) => {
    const t = curve.getTangentAt(at[i] / L);
    const base = s.p.clone().setY(0).add(new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(6)); // the lift stands beside the track
    const lift = new THREE.Mesh(liftGeo, liftMat); lift.position.copy(base); scene.add(lift);
    const plat = new THREE.Mesh(platGeo, platMat); plat.position.copy(s.p).setY(DECK - 0.6).add(new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(4));
    plat.rotation.y = Math.atan2(t.x, t.z); scene.add(plat);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(4, 4, 504, 120);
    g.strokeStyle = '#ff2bd6'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 120);
    g.fillStyle = '#ff2bd6'; g.font = 'bold 26px "Share Tech Mono", monospace'; g.textBaseline = 'top'; g.fillText('◉ EKO MAGLEV', 20, 14);
    g.fillStyle = '#ffffff'; g.font = 'bold 40px "Share Tech Mono", monospace'; g.fillText(s.name.toUpperCase(), 20, 56, 472);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sign.scale.set(20, 5, 1); sign.position.copy(base).setY(DECK + 9); scene.add(sign);
    return { name: s.name, base, along: at[i] };
  });

  // ---- the trains: white capsules with a magenta band ----
  const carGeo = new THREE.CapsuleGeometry(1.5, CAR_LEN - 3, 4, 10).rotateX(Math.PI / 2).translate(0, 1.6, 0);
  const bandGeo = new THREE.BoxGeometry(3.12, 0.22, CAR_LEN - 2).translate(0, 1.9, 0);
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xe8ecf4, roughness: 0.25, metalness: 0.5 }), TRAINS * CARS);
  const bands = new THREE.InstancedMesh(bandGeo, new THREE.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false }), TRAINS * CARS);
  for (const o of [cars, bands]) { o.frustumCulled = false; scene.add(o); }
  // each train: where it is along the loop, and how long it's been standing at a station
  const trains = Array.from({ length: TRAINS }, (_, k) => ({ s: (k / TRAINS) * L, wait: 0, at: -1 as number }));
  const nextStop = (s: number) => { for (let i = 0; i < at.length; i++) if (at[i] > s + 1) return i; return 0; };
  const q = new THREE.Quaternion(), fwd = new THREE.Vector3(0, 0, 1), p = new THREE.Vector3();
  const place = (s: number) => {
    const u = (((s % L) + L) % L) / L;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tan);
    q.setFromUnitVectors(fwd, tan);
    return { p: p.clone(), q: q.clone(), yaw: Math.atan2(tan.x, tan.z) };
  };

  // the corridor: 10 m cells the track passes over, and their neighbours -- buildings stay out
  const corridor = new Set<string>();
  for (const q of curve.getSpacedPoints(Math.ceil(L / 5))) {
    const cx = Math.floor(q.x / 10), cz = Math.floor(q.z / 10);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) corridor.add(`${cx + dx}_${cz + dz}`);
  }
  return {
    stations,
    /** true if any of these points lies under the track */
    inCorridor: (pts: THREE.Vector2[]) => pts.some((q) => corridor.has(`${Math.floor(q.x / 10)}_${Math.floor(q.y / 10)}`)),
    length: L,
    update(dt: number) {
      trains.forEach((t, k) => {
        if (t.wait > 0) { t.wait -= dt; if (t.wait <= 0) t.at = -1; }
        else {
          const ns = nextStop(t.s), target = at[ns] + (ns === 0 && t.s > at[ns] ? L : 0);
          const step = Math.min(SPEED * dt, Math.max(0.5, target - t.s) * 1.2);
          t.s += step;
          if (target - t.s < 0.6) { t.s = target; t.wait = DWELL; t.at = ns; }
          if (t.s >= L) t.s -= L;
        }
        for (let c = 0; c < CARS; c++) {
          const o = place(t.s - c * (CAR_LEN + GAP));
          m4.compose(o.p, o.q, new THREE.Vector3(1, 1, 1));
          cars.setMatrixAt(k * CARS + c, m4);
          bands.setMatrixAt(k * CARS + c, m4);
        }
      });
      cars.instanceMatrix.needsUpdate = true;
      bands.instanceMatrix.needsUpdate = true;
    },
    /** The station whose lift you're standing at (within 9 m), or null. */
    stationAt(x: number, z: number) {
      let best = -1, bd = 9;
      stations.forEach((s, i) => { const d = Math.hypot(s.base.x - x, s.base.z - z); if (d < bd) { bd = d; best = i; } });
      return best;
    },
    /** Metres from (x, y, z) to the nearest train (for the sound of one passing). */
    nearestTrain(x: number, y: number, z: number) {
      let best = Infinity;
      for (const t of trains) { const o = place(t.s - CAR_LEN); best = Math.min(best, Math.hypot(o.p.x - x, o.p.y - y, o.p.z - z)); }
      return best;
    },
    /** A train standing at station i right now, or -1. */
    trainAt(i: number) { return trains.findIndex((t) => t.at === i); },
    /** Seconds until the next train reaches station i. */
    eta(i: number) {
      let best = Infinity;
      for (const t of trains) {
        if (t.at === i) return 0;
        let d = stations[i].along - t.s; if (d < 0) d += L;
        best = Math.min(best, d / SPEED + (t.wait > 0 ? t.wait : 0) + 3);
      }
      return Math.round(best);
    },
    /** Riding train k: where you sit, which way it's going, and the station it's standing at (or -1) and the next one. */
    ride(k: number) {
      const t = trains[k], o = place(t.s - CAR_LEN - GAP);
      return { pos: o.p.setY(o.p.y + 1.2), yaw: o.yaw, at: t.at, next: stations[nextStop(t.s)].name };
    },
    dispose() {
      for (const o of [deck, rails, pylons, cars, bands]) scene.remove(o);
    },
  };
}
