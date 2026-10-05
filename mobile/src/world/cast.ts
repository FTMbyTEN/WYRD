import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Person } from './people';
import type { CharacterLook } from '../api/types';

/**
 * The cast: characters modelled from generated concept art (public/world/people/*.glb), each a
 * textured, rigged humanoid of ~8k triangles. They're driven by the same walk cycle as everyone else
 * (animatePerson): the cycle writes to stand-in joints, and rig() turns each real bone by that much
 * about the character's own axes, from its rest pose -- so hips, knees, shoulders, elbows, the neck
 * and the body's lean and bob all move the model.
 *
 * Parts of the texture that are glowing neon in the art (saturated cyan, magenta, yellow) glow in the
 * game too, without bloom.
 */
const BONES = {
  body: 'Hips', neck: 'neck',
  lHip: 'LeftUpLeg', rHip: 'RightUpLeg', lKnee: 'LeftLeg', rKnee: 'RightLeg',
  lShoulder: 'LeftArm', rShoulder: 'RightArm', lElbow: 'LeftForeArm', rElbow: 'RightForeArm',
} as const;

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const outfitCache = new Map<string, Promise<THREE.Texture>>();
/** An outfit's texture (outfits are the same mesh repainted, so only the texture changes). */
function outfitTexture(base: string, n: number) {
  const url = `world/people/outfits/${base}-${n}.jpg`;
  let p = outfitCache.get(url);
  if (!p) {
    p = texLoader.loadAsync(url).then((t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
    outfitCache.set(url, p);
  }
  return p;
}
const cache = new Map<string, Promise<GLTF>>();
export function loadCharacter(url: string) {
  let p = cache.get(url);
  if (!p) { p = loader.loadAsync(url); cache.set(url, p); }
  return p;
}

/**
 * The character's look, in the material: skin (recognised by its hue and saturation) made lighter
 * or darker; saturated fabric turned to another hue; bright neon trim recoloured. And the neon glows:
 * a saturated, bright texel adds itself as light.
 */
function patchGlow(mat: THREE.MeshStandardMaterial, u: { uSkin: { value: number }; uHue: { value: number }; uNeon: { value: THREE.Color } }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSkin = u.uSkin; sh.uniforms.uHue = u.uHue; sh.uniforms.uNeon = u.uNeon;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uSkin; uniform float uHue; uniform vec3 uNeon;
        vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
        vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 hsv = rgb2hsv(diffuseColor.rgb);
          float neonT = step(0.8, hsv.z) * step(0.45, hsv.y) * step(0.42, hsv.x) * step(hsv.x, 0.6);
          float skinT = (1.0 - neonT) * step(hsv.x, 0.11) * step(0.18, hsv.y) * step(hsv.y, 0.72) * step(0.08, hsv.z) * step(hsv.z, 0.72);
          float clothT = (1.0 - neonT) * (1.0 - skinT) * step(0.42, hsv.y) * step(0.12, hsv.z);
          vec3 skin = hsv; skin.z = clamp(skin.z * (1.0 + uSkin * (uSkin > 0.0 ? 0.9 : 0.5)), 0.0, 1.0); skin.y *= 1.0 - max(uSkin, 0.0) * 0.25;
          vec3 cloth = hsv; cloth.x = fract(cloth.x + uHue / 360.0);
          vec3 neonC = rgb2hsv(uNeon); vec3 nn = vec3(neonC.x, max(hsv.y, neonC.y), hsv.z);
          diffuseColor.rgb = mix(diffuseColor.rgb, hsv2rgb(skin), skinT);
          diffuseColor.rgb = mix(diffuseColor.rgb, hsv2rgb(cloth), clothT * step(0.5, abs(uHue)));
          diffuseColor.rgb = mix(diffuseColor.rgb, hsv2rgb(nn), neonT);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 tc = diffuseColor.rgb;
        float mx = max(tc.r, max(tc.g, tc.b)), mn = min(tc.r, min(tc.g, tc.b));
        float neon = smoothstep(0.45, 0.75, mx) * smoothstep(0.35, 0.6, (mx - mn) / max(mx, 1e-3));
        totalEmissiveRadiance += tc * neon * 1.6;
      }`);
  };
  mat.customProgramCacheKey = () => 'cast-look';
}

/** A character from the cast, as a Person the walk cycle can drive. [height]: ~0.9 .. 1.1. */
export function makeCastPerson(gltf: GLTF, opts: { height?: number; shadows?: boolean; look?: CharacterLook } = {}): Person {
  const model = cloneSkinned(gltf.scene) as THREE.Object3D;
  const uniforms = { uSkin: { value: 0 }, uHue: { value: 0 }, uNeon: { value: new THREE.Color(0x00e5ff) } };
  const mats: THREE.MeshStandardMaterial[] = [];
  let originalMap: THREE.Texture | null = null, wearing = 0;
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = opts.shadows ?? false;
    m.frustumCulled = false;
    const mat = (m.material as THREE.MeshStandardMaterial).clone(); // each character wears its own look
    mat.roughness = 0.75; mat.metalness = 0;
    patchGlow(mat, uniforms);
    m.material = mat;
    mats.push(mat);
    originalMap ??= mat.map;
  });

  const root = new THREE.Group();
  root.add(model);
  const bone = (name: string) => { let b: THREE.Object3D | undefined; model.traverse((o) => { if (!b && o.name === name) b = o; }); return b; };
  const rest = new Map<THREE.Object3D, { p: THREE.Vector3; s: THREE.Vector3 }>();
  for (const n of ['LeftShoulder', 'RightShoulder', 'LeftUpLeg', 'RightUpLeg', 'Spine01', 'neck', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']) {
    const b = bone(n);
    if (b && !rest.has(b)) rest.set(b, { p: b.position.clone(), s: b.scale.clone() });
  }
  const applyLook = (look?: CharacterLook) => {
    const L = look ?? { height: 0, build: 0, shoulders: 0, hips: 0, skin: 0, outfitHue: 0, neon: 0x00e5ff };
    for (const [b, r] of rest) { b.position.copy(r.p); b.scale.copy(r.s); }
    const sh = 1 + L.shoulders * 0.22, hp = 1 + L.hips * 0.28, build = 1 + L.build * 0.09;
    for (const n of ['LeftShoulder', 'RightShoulder']) bone(n)?.position.multiplyScalar(sh);
    for (const n of ['LeftUpLeg', 'RightUpLeg']) { const b = bone(n); if (b) { b.position.multiplyScalar(hp); b.scale.multiplyScalar(1 + L.build * 0.05); } }
    const spine = bone('Spine01'), neck = bone('neck');
    if (spine) spine.scale.multiplyScalar(build);
    if (neck) neck.scale.multiplyScalar(1 / build); // the head keeps its size
    for (const n of ['LeftArm', 'RightArm']) bone(n)?.scale.multiplyScalar(1 + L.build * 0.06);
    // the outfit: the original texture, or one of the wardrobe's
    const want = (L as CharacterLook).outfit ?? 0, base = (L as CharacterLook).base ?? 'ten';
    if (want !== wearing) {
      wearing = want;
      if (!want) for (const m of mats) { m.map = originalMap; m.needsUpdate = true; }
      else outfitTexture(base, want).then((t) => { if (wearing === want) for (const m of mats) { m.map = t; m.needsUpdate = true; } }).catch(() => {});
    }
    uniforms.uSkin.value = L.skin;
    uniforms.uHue.value = L.outfitHue;
    uniforms.uNeon.value.setHex(L.neon);
  };
  applyLook(opts.look);
  // stand on the ground, ~1.75 m tall (times the build's height)
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const k = (1.75 * (opts.height ?? 1)) / Math.max(0.1, box.max.y - box.min.y);
  model.scale.multiplyScalar(k);
  model.position.y -= box.min.y * k;
  root.updateMatrixWorld(true);

  // the real bones, their rest poses, and the character's axes in each bone's parent space
  const find = (name: string) => { let b: THREE.Object3D | undefined; model.traverse((o) => { if (!b && o.name === name) b = o; }); return b; };
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const rig = Object.fromEntries(Object.entries(BONES).map(([key, name]) => {
    const bone = find(name);
    if (!bone || !bone.parent) return [key, null];
    const parentQ = rootQ.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
    return [key, {
      bone, rest: bone.quaternion.clone(), restPos: bone.position.clone(),
      ax: new THREE.Vector3(1, 0, 0).applyQuaternion(parentQ), ay: new THREE.Vector3(0, 1, 0).applyQuaternion(parentQ), az: new THREE.Vector3(0, 0, 1).applyQuaternion(parentQ),
      unit: 1 / Math.max(1e-6, bone.parent.getWorldScale(new THREE.Vector3()).y),
    }];
  })) as Record<keyof typeof BONES, { bone: THREE.Object3D; rest: THREE.Quaternion; restPos: THREE.Vector3; ax: THREE.Vector3; ay: THREE.Vector3; az: THREE.Vector3; unit: number } | null>;

  // the model stands in an A-pose; arms at rest should hang near the sides: measure how far out
  // each upper arm points, and lower it to ~12° from the body
  const armDrop = (arm: string, fore: string, side: number) => {
    const a = find(arm), f = find(fore);
    if (!a || !f) return 0;
    const pa = a.getWorldPosition(new THREE.Vector3()), pf = f.getWorldPosition(new THREE.Vector3());
    const dir = pf.sub(pa).normalize();
    const out = Math.atan2(Math.abs(dir.x), -dir.y); // 0 = straight down
    return -side * Math.max(0, out - 0.21);
  };
  const dropL = armDrop('LeftArm', 'LeftForeArm', 1), dropR = armDrop('RightArm', 'RightForeArm', -1);

  // stand-in joints for the walk cycle to write to
  const proxy = () => new THREE.Object3D();
  const joints = { lShoulder: proxy(), rShoulder: proxy(), lElbow: proxy(), rElbow: proxy(), lHip: proxy(), rHip: proxy(), lKnee: proxy(), rKnee: proxy(), neck: proxy() };
  const body = proxy();
  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
  const turn = (r: (typeof rig)[keyof typeof rig], from: THREE.Object3D, extraZ = 0) => {
    if (!r) return;
    qx.setFromAxisAngle(r.ax, from.rotation.x);
    qy.setFromAxisAngle(r.ay, from.rotation.y);
    qz.setFromAxisAngle(r.az, from.rotation.z + extraZ);
    r.bone.quaternion.copy(qx).multiply(qy).multiply(qz).multiply(r.rest);
  };
  const apply = () => {
    turn(rig.body, body);
    if (rig.body) rig.body.bone.position.y = rig.body.restPos.y + body.position.y * rig.body.unit; // the bob and the landing squash, in the bone's own units
    for (const key of ['lHip', 'rHip', 'lKnee', 'rKnee', 'lElbow', 'rElbow', 'neck'] as const) turn(rig[key], joints[key]);
    turn(rig.lShoulder, joints.lShoulder, dropL);
    turn(rig.rShoulder, joints.rShoulder, dropR);
  };
  return { root, body, joints, phase: Math.random() * Math.PI * 2, squash: 0, sex: 'm', rig: apply, setLook: (l: CharacterLook) => {
    applyLook(l);
    // height: the whole figure, standing on the same ground
    const s = 1 + l.height * 0.08;
    root.scale.setScalar(s);
  } };
}

/**
 * TEN, animated by motion capture: idle, walk, run and jump clips (rigged onto his model) blended by
 * how fast he's moving. Each clip's natural speed is measured from its own root motion, and played
 * faster or slower to match his real speed -- so the feet plant on the ground instead of skating.
 * The clips play in place (their forward travel is removed; the game moves him). He banks a little
 * into turns.
 */
export function makeCastHero(gltf: GLTF, extra: { walk?: GLTF; run?: GLTF; idle?: GLTF; jump?: GLTF }, opts: { height?: number; shadows?: boolean; look?: CharacterLook } = {}): Person {
  const p = makeCastPerson(gltf, opts);
  if (opts.look) p.setLook?.(opts.look);
  const model = p.root.children[0];
  const hips = (() => { let h: THREE.Object3D | undefined; model.traverse((o) => { if (!h && o.name === 'Hips') h = o; }); return h; })();
  const unit = hips?.parent ? hips.parent.getWorldScale(new THREE.Vector3()).x : 0.01;
  const mixer = new THREE.AnimationMixer(model);

  // in place: drop scale tracks and every translation but the hips' height; measure the travel first
  const prep = (source: THREE.AnimationClip | undefined, fallback: number) => {
    if (!source) return null;
    const clip = source.clone(); // the loaded clip is shared (cached): trim a copy
    let speed = fallback;
    clip.tracks = clip.tracks.filter((t) => {
      if (t.name.endsWith('.scale')) return false;
      if (t.name.endsWith('.position')) {
        if (!t.name.startsWith('Hips.')) return false;
        const v = t.values, n = v.length / 3;
        const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
        const travelled = Math.hypot(dx, dz) * unit;
        if (travelled > 0.3) speed = travelled / clip.duration;
        for (let i = 0; i < n; i++) { v[i * 3] = v[0]; v[i * 3 + 2] = v[2]; }
      }
      return true;
    });
    return { action: mixer.clipAction(clip), speed };
  };
  const walk = prep(extra.walk?.animations[0] ?? gltf.animations[0], 1.4);
  const run = prep(extra.run?.animations[0], 4.2);
  const idle = prep(extra.idle?.animations[0], 0);
  const jump = prep(extra.jump?.animations[0], 0);
  for (const a of [walk, run, idle]) if (a) { a.action.play(); a.action.setEffectiveWeight(0); }
  if (jump) { jump.action.setLoop(THREE.LoopOnce, 1); jump.action.clampWhenFinished = true; }

  let wasAir = false, raised = 0;
  const findBone = (n: string) => { let b: THREE.Object3D | undefined; model.traverse((o) => { if (!b && o.name === n) b = o; }); return b; };
  const rArm = findBone('RightArm'), rFore = findBone('RightForeArm');
  const axis = new THREE.Vector3(), rq = new THREE.Quaternion();
  const ease = (from: number, to: number, k: number) => from + (to - from) * k;
  const weights = { idle: 1, walk: 0, run: 0, jump: 0 };
  p.rig = undefined;
  p.drive = (speed, dt, airborne, turn) => {
    // the blend: idle below a stroll, walk, then run above ~3.2 m/s
    const moving = THREE.MathUtils.smoothstep(speed, 0.15, 0.7);
    const running = THREE.MathUtils.smoothstep(speed, 2.6, 4.2);
    const k = Math.min(1, dt * 8);
    weights.idle = ease(weights.idle, airborne ? 0 : 1 - moving, k);
    weights.walk = ease(weights.walk, airborne ? 0 : moving * (1 - running), k);
    weights.run = ease(weights.run, airborne ? 0 : moving * running, k);
    weights.jump = ease(weights.jump, airborne ? 1 : 0, Math.min(1, dt * 10));
    if (airborne && !wasAir && jump) jump.action.reset().play();
    wasAir = airborne;
    idle?.action.setEffectiveWeight(weights.idle);
    walk?.action.setEffectiveWeight(weights.walk);
    run?.action.setEffectiveWeight(weights.run);
    jump?.action.setEffectiveWeight(weights.jump);
    // feet locked to the ground: play each gait at the rate that matches his speed
    if (walk) walk.action.timeScale = THREE.MathUtils.clamp(speed / walk.speed, 0.6, 1.8);
    if (run) run.action.timeScale = THREE.MathUtils.clamp(speed / run.speed, 0.7, 1.6);
    mixer.update(dt);
    // the raised hand, over the clip: the right arm lifts forward and up, the forearm bends
    raised += ((p.raise ?? 0) - raised) * Math.min(1, dt * 7);
    if (raised > 0.01 && rArm && rFore) {
      p.root.getWorldQuaternion(rq);
      axis.set(1, 0, 0).applyQuaternion(rq); // the character's own sideways axis, in the world
      rArm.rotateOnWorldAxis(axis, -2.3 * raised);
      rFore.rotateOnWorldAxis(axis, -0.7 * raised);
    }
    p.bank = ease(p.bank ?? 0, THREE.MathUtils.clamp(-turn * speed * 0.012, -0.12, 0.12), Math.min(1, dt * 6));
    model.rotation.z = p.bank;
  };
  return p;
}
