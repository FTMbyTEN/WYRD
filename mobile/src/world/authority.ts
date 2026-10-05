import * as THREE from 'three';

/**
 * WYRD's presence in the open world, as the Authority: its drone, the beacon over a mission it has
 * given you, the weather it sets, and the soft shadows people and vehicles cast (one draw call for
 * all of them). Kept cheap: the drone is a handful of meshes, rain and harmattan dust are one
 * points cloud that follows the camera.
 */
export type Weather = 'clear' | 'rain' | 'harmattan' | 'storm';

export function makeAuthority(scene: THREE.Scene) {
  const COBALT = 0x2a46ff;

  // ---- the drone: a dark body, four rotors, a cobalt eye and a searchlight cone ----
  const drone = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.7, roughness: 0.35 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: COBALT, toneMapped: false });
  drone.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), dark));
  const rotors: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.9), dark);
    arm.position.set(x / 2, 0, z / 2);
    arm.rotation.y = Math.atan2(x, z);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.35, depthWrite: false }));
    rotor.position.set(x, 0.14, z);
    rotors.push(rotor);
    drone.add(arm, rotor);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), eyeMat);
  eye.position.y = -0.15;
  drone.add(eye);
  const coneMat = new THREE.MeshBasicMaterial({ color: COBALT, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 1, 20, 1, true), coneMat);
  drone.add(cone);
  drone.visible = false;
  scene.add(drone);
  const droneState = { active: false, follow: true, target: new THREE.Vector3(), until: 0, pos: new THREE.Vector3(0, 40, 0) };

  // ---- the mission beacon: a column of cobalt light over the place, and a ring on the ground ----
  const beaconMat = new THREE.MeshBasicMaterial({ color: COBALT, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 120, 16, 1, true), beaconMat);
  beacon.position.y = 60;
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 6, 40), beaconMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  const beaconGroup = new THREE.Group();
  beaconGroup.add(beacon, ring);
  beaconGroup.visible = false;
  scene.add(beaconGroup);

  // ---- weather particles: one points cloud round the camera ----
  const N = 2200, BOX = 60;
  const ppos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { ppos[i * 3] = (Math.random() - 0.5) * BOX; ppos[i * 3 + 1] = Math.random() * 30; ppos[i * 3 + 2] = (Math.random() - 0.5) * BOX; }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  const pmat = new THREE.PointsMaterial({ color: 0xbfd0e0, size: 0.08, transparent: true, opacity: 0.7, depthWrite: false });
  const particles = new THREE.Points(pgeo, pmat);
  particles.frustumCulled = false;
  particles.visible = false;
  scene.add(particles);

  // ---- soft shadows under people and vehicles: one instanced, multiplied disc ----
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g2 = cv.getContext('2d')!;
  const grad = g2.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g2.fillStyle = grad; g2.fillRect(0, 0, 64, 64);
  const blobTex = new THREE.CanvasTexture(cv);
  const MAXB = 80;
  const blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    MAXB,
  );
  blobs.frustumCulled = false;
  scene.add(blobs);
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(), bp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let nb = 0;

  // underglow beneath hover vehicles: one instanced, additive, coloured disc
  const cv2 = document.createElement('canvas');
  cv2.width = cv2.height = 64;
  const g3 = cv2.getContext('2d')!;
  const gr2 = g3.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr2.addColorStop(0, 'rgba(255,255,255,1)'); gr2.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr2.addColorStop(1, 'rgba(255,255,255,0)');
  g3.fillStyle = gr2; g3.fillRect(0, 0, 64, 64);
  const MAXG = 48;
  const glows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    MAXG,
  );
  glows.frustumCulled = false;
  scene.add(glows);
  const gc = new THREE.Color();
  let ng = 0;

  let weather: Weather = 'clear';
  let flashAt = -1e9;

  return {
    drone, droneState,
    get weather() { return weather; },
    setWeather(w: Weather) {
      weather = w;
      particles.visible = w !== 'clear';
      if (w === 'harmattan') { pmat.color.setHex(0xd9b48a); pmat.size = 0.06; pmat.opacity = 0.45; }
      else { pmat.color.setHex(0xbfd0e0); pmat.size = w === 'storm' ? 0.1 : 0.08; pmat.opacity = 0.7; }
    },
    /** How the weather changes the light: fog distance factor, sky darkening, a lightning flash. */
    sky(now: number) {
      if (weather === 'storm' && Math.random() < 0.004) flashAt = now;
      const flash = Math.max(0, 1 - (now - flashAt) / 180);
      return {
        fog: weather === 'harmattan' ? 0.28 : weather === 'storm' ? 0.45 : weather === 'rain' ? 0.6 : 1,
        dim: weather === 'storm' ? 0.55 : weather === 'rain' ? 0.75 : weather === 'harmattan' ? 0.85 : 1,
        tint: weather === 'harmattan' ? 0xe0b98a : weather === 'clear' ? null : 0x8e98a4,
        flash,
      };
    },
    sendDrone(to: THREE.Vector3 | null, seconds = 40) {
      droneState.active = true;
      droneState.follow = !to;
      if (to) droneState.target.copy(to);
      droneState.until = performance.now() + seconds * 1000;
      if (!drone.visible) { drone.visible = true; droneState.pos.set((to ?? droneState.target).x + 80, 45, (to ?? droneState.target).z + 80); }
    },
    setBeacon(at: THREE.Vector3 | null) {
      beaconGroup.visible = !!at;
      if (at) beaconGroup.position.set(at.x, 0, at.z);
    },
    /** Soft shadows: call beginShadows, then shadow() for each person or vehicle, then endShadows. */
    beginShadows() { nb = 0; },
    shadow(x: number, y: number, z: number, w: number, l: number, heading: number) {
      if (nb >= MAXB) return;
      bq.setFromAxisAngle(up, heading);
      blobs.setMatrixAt(nb++, bm.compose(bp.set(x, y + 0.035, z), bq, bs.set(w, 1, l)));
    },
    endShadows() {
      blobs.count = nb; blobs.instanceMatrix.needsUpdate = true;
      glows.count = ng; glows.instanceMatrix.needsUpdate = true;
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
      ng = 0;
    },
    /** The light a hover vehicle throws on the road beneath it. */
    glow(x: number, y: number, z: number, w: number, l: number, heading: number, hex: number, k = 1) {
      if (ng >= MAXG) return;
      bq.setFromAxisAngle(up, heading);
      glows.setMatrixAt(ng, bm.compose(bp.set(x, y + 0.045, z), bq, bs.set(w, 1, l)));
      glows.setColorAt(ng, gc.setHex(hex).multiplyScalar(k));
      ng++;
    },
    update(dt: number, now: number, player: THREE.Vector3, camera: THREE.Camera) {
      // the drone: flies to its mark (you, or a place), hovers and circles; leaves when its time is up
      if (drone.visible) {
        const leaving = now > droneState.until;
        const mark = droneState.follow ? player : droneState.target;
        const want = leaving
          ? droneState.pos.clone().add(new THREE.Vector3(30, 25, 30))
          : new THREE.Vector3(mark.x + Math.cos(now / 2600) * 7, 14 + Math.sin(now / 900) * 0.6, mark.z + Math.sin(now / 2600) * 7);
        droneState.pos.lerp(want, 1 - Math.pow(0.35, dt));
        drone.position.copy(droneState.pos);
        drone.lookAt(mark.x, drone.position.y, mark.z);
        drone.rotation.z = Math.sin(now / 700) * 0.05;
        for (const r of rotors) r.rotation.y += dt * 60;
        cone.scale.set(1, drone.position.y, 1);
        cone.position.y = -drone.position.y / 2;
        coneMat.opacity = leaving ? 0 : 0.1 + Math.sin(now / 300) * 0.03;
        if (leaving && droneState.pos.y > 60) { drone.visible = false; droneState.active = false; }
      }
      beaconMat.opacity = 0.28 + Math.sin(now / 400) * 0.08;
      // rain falls, dust drifts; the cloud wraps round the camera
      if (particles.visible) {
        const fall = weather === 'harmattan' ? 0.4 : weather === 'storm' ? 26 : 18;
        const drift = weather === 'harmattan' ? 1.5 : weather === 'storm' ? 5 : 1;
        const c = camera.position;
        for (let i = 0; i < N; i++) {
          let y = ppos[i * 3 + 1] - fall * dt;
          if (y < 0) y += 30;
          ppos[i * 3 + 1] = y;
          ppos[i * 3] += drift * dt;
          if (ppos[i * 3] > BOX / 2) ppos[i * 3] -= BOX;
        }
        pgeo.attributes.position.needsUpdate = true;
        particles.position.set(Math.round(c.x), Math.max(0, c.y - 15), Math.round(c.z));
      }
    },
  };
}
export type Authority = ReturnType<typeof makeAuthority>;
