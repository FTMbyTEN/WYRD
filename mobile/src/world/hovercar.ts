import * as THREE from 'three';

/**
 * TEN's hover-car: called down from the sky (F), boarded (E), flown anywhere -- up the towers,
 * along the skybridges, over the lagoon -- and landed on any rooftop or street. Light: a handful of
 * meshes, no extra lights (its glow is the shared underglow).
 *
 * Flight: forward thrust along the nose with drag, yaw turns that bank the body, climb and descend;
 * it can't sink into the street, a roof or a skybridge deck (it settles onto them), and it's pushed
 * out of tower walls. It nose-dips as it brakes and lifts as it accelerates.
 */
export type HoverInput = { forward: number; turn: number; lift: number };
type World = {
  floorAt: (x: number, z: number, maxY?: number) => number;
  collide: (p: THREE.Vector3, r: number) => THREE.Vector3;
};

export function makeHoverCar(scene: THREE.Scene) {
  const group = new THREE.Group();
  const body = new THREE.Group(); // banks and pitches; the group yaws
  group.add(body);
  const shell = new THREE.MeshStandardMaterial({ color: 0x1b2440, metalness: 0.85, roughness: 0.28 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd9dde4, metalness: 0.9, roughness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1a24, metalness: 0.4, roughness: 0.05, envMapIntensity: 1.6 });
  const neon = new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false });
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2a48, toneMapped: false });
  // the hull: a long capsule, flattened, nose forward (+z)
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.9, 6, 16).rotateX(Math.PI / 2), shell);
  hull.scale.set(1.15, 0.62, 1);
  hull.position.y = 0.7;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.82, 0.55, 1.5);
  canopy.position.set(0, 1.0, -0.15);
  body.add(hull, canopy);
  // thruster pods either side, and a neon line down each flank
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 12).rotateX(Math.PI / 2), trim);
    pod.position.set(1.25 * side, 0.55, -0.6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 16), neon);
    ring.position.set(1.25 * side, 0.55, -1.36);
    const flank = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 3.6), neon);
    flank.position.set(0.99 * side, 0.62, 0.05);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.05), side < 0 ? neon : neon);
    light.position.set(0.5 * side, 0.68, 2.25);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), tail);
    rear.position.set(0.5 * side, 0.72, -2.2);
    body.add(pod, ring, flank, light, rear);
  }
  group.visible = false;
  scene.add(group);

  const s = {
    mode: 'away' as 'away' | 'arriving' | 'parked' | 'flying',
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, yaw: 0, yawRate: 0,
    from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0,
    /** the speed of the last hit against a wall (m/s), for the game to turn into damage; 0 once read */
    impact: 0,
  };

  return {
    group,
    state: s,
    /** Call it down beside [near], onto whatever floor is there (street or roof). */
    call(near: THREE.Vector3, facing: number, world: World) {
      const x = near.x + Math.sin(facing + Math.PI / 2) * 3.2, z = near.z + Math.cos(facing + Math.PI / 2) * 3.2;
      const floor = world.floorAt(x, z, near.y + 1);
      s.to.set(x, floor + 0.5, z);
      s.from.set(x + 40, floor + 70, z - 40);
      s.t = 0;
      s.yaw = facing;
      s.mode = 'arriving';
      group.visible = true;
    },
    board() { s.mode = 'flying'; s.vel.set(0, 0, 0); s.vy = 0; },
    /** Can you step out here? Only when it's sitting on a floor. */
    canLeave(world: World) { return s.pos.y - world.floorAt(s.pos.x, s.pos.z, s.pos.y + 0.5) < 1.4; },
    leave() { s.mode = 'parked'; s.vel.set(0, 0, 0); s.vy = 0; },
    update(dt: number, now: number, input: HoverInput, world: World) {
      if (s.mode === 'away') return;
      if (s.mode === 'arriving') {
        // down out of the sky in a long curve, slowing to settle
        s.t = Math.min(1, s.t + dt / 4);
        const e = 1 - Math.pow(1 - s.t, 3);
        s.pos.lerpVectors(s.from, s.to, e);
        if (s.t >= 1) s.mode = 'parked';
      } else if (s.mode === 'flying') {
        // yaw, thrust along the nose, drag; climb and descend
        s.yawRate += (-input.turn * 1.7 - s.yawRate) * Math.min(1, dt * 5);
        s.yaw += s.yawRate * dt;
        const fwd = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
        const speed = s.vel.dot(fwd);
        const thrust = input.forward * (input.forward > 0 ? 18 : 10);
        s.vel.addScaledVector(fwd, thrust * dt);
        s.vel.multiplyScalar(Math.exp(-dt * (input.forward === 0 ? 1.2 : 0.45))); // drag; heavier when coasting
        const side = s.vel.clone().sub(fwd.clone().multiplyScalar(s.vel.dot(fwd)));
        s.vel.addScaledVector(side, -Math.min(1, dt * 4)); // it grips the air: little sideways drift
        if (s.vel.length() > 38) s.vel.setLength(38);
        s.vy += (input.lift * 11 - s.vy) * Math.min(1, dt * 3);
        s.pos.addScaledVector(s.vel, dt);
        s.pos.y += s.vy * dt;
        // pushed out of tower walls; settles onto any floor below
        const probe = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
        world.collide(probe, 2.3);
        const pushed = Math.hypot(probe.x - s.pos.x, probe.z - s.pos.z);
        if (pushed > 0.05) {
          // hit a wall: the faster, the harder; most of the speed is lost
          const hit = s.vel.length();
          if (hit > 12) s.impact = Math.max(s.impact, hit);
          s.vel.multiplyScalar(0.35);
        }
        s.pos.x = probe.x; s.pos.z = probe.z;
        const floor = world.floorAt(s.pos.x, s.pos.z, s.pos.y + 0.5);
        if (s.pos.y < floor + 0.5) { s.pos.y = floor + 0.5; if (s.vy < 0) s.vy = 0; }
        if (s.pos.y > 900) { s.pos.y = 900; s.vy = Math.min(0, s.vy); }
        // the body banks into turns and pitches with acceleration
        body.rotation.z += (s.yawRate * Math.min(1, speed / 20) * 0.5 - body.rotation.z) * Math.min(1, dt * 4);
        body.rotation.x += (-input.forward * 0.08 + s.vy * -0.01 - body.rotation.x) * Math.min(1, dt * 3);
      }
      // hovering: a slow bob
      const bob = s.mode === 'flying' ? Math.sin(now / 420) * 0.06 : Math.sin(now / 600) * 0.05;
      group.position.set(s.pos.x, s.pos.y + bob, s.pos.z);
      group.rotation.y = s.yaw;
      neon.color.setRGB(0, 0.75 + 0.25 * Math.sin(now / 300), 1);
    },
  };
}
export type HoverCar = ReturnType<typeof makeHoverCar>;
