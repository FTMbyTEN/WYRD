import * as THREE from 'three';

/**
 * People of the city, built the way game characters are: one continuous skin over a skeleton.
 *
 * The body is a set of smooth surfaces lofted through cross-sections -- the torso runs unbroken from
 * the hips through waist, chest and shoulders into the neck and the head (jaw, cheekbones, the back
 * of the skull); each leg from the hip through thigh, knee, calf and ankle; each arm from the
 * shoulder through elbow and forearm to the wrist. Near a joint the skin is weighted to both bones,
 * so knees and elbows bend smoothly instead of hinging at a seam. Clothes are painted onto the body
 * (sleeves, collars, hems, trousers) with clean edges, and skirts, wrappers and agbadas drape over it.
 * Faces have eyes, brows, a nose and lips; hands a thumb; shoes a sole.
 *
 * NAIJA 2099: many wear light -- LED trims on belts, cuffs and soles, and some a glowing visor.
 *
 * Lightweight: everything is baked into ONE skinned mesh per person (one draw call), with one
 * shared material for everybody -- skin gets a softer sheen than cloth, and trims glow, through
 * per-vertex flags.
 */
export type Person = {
  root: THREE.Group;
  body: THREE.Object3D; // everything above the ground: bobs while walking
  joints: { lShoulder: THREE.Object3D; rShoulder: THREE.Object3D; lElbow: THREE.Object3D; rElbow: THREE.Object3D; lHip: THREE.Object3D; rHip: THREE.Object3D; lKnee: THREE.Object3D; rKnee: THREE.Object3D; neck: THREE.Object3D };
  phase: number;
  squash: number; // landing squash, eases back to 0
  sex: 'm' | 'f';
  /** for a modelled character (cast.ts): turns its real bones to match the joints above */
  rig?: () => void;
  /** the walk's lean into acceleration and bank into turns (eased) */
  lean?: number; bank?: number;
  /** for a modelled character (cast.ts): change its look live (proportions, skin, outfit, neon) */
  setLook?: (look: import('../api/types').CharacterLook) => void;
  /** raise a hand (0..1), eased; set by the game when the player speaks to WYRD */
  raise?: number;
  /** for a character animated by clips (cast.ts): plays them for this speed instead of the built walk */
  drive?: (speed: number, dt: number, airborne: boolean, turn: number, accel: number) => void;
};

export const SKIN = [0x4a2c1d, 0x5b3726, 0x6e4430, 0x3d2418, 0x7a4c35, 0x553220, 0x8a5a3c];
export const CLOTH = [0xd9472b, 0x2a46ff, 0xf2c200, 0x2f8f5b, 0x8c2f7a, 0xe07b1f, 0x1f6f8b, 0xefe6d6, 0x16171a, 0xb23a48, 0x5a3e8c, 0x0f7a6c, 0xf4f1ea, 0x6b8f71];
export const HAIR = [0x111111, 0x1b1410, 0x2a1d16];
const TROUSERS = [0x1b1d22, 0x2b3442, 0x4a4036, 0x22324a, 0x6b6153, 0x16171a, 0x3b4a5c];

export type Build = {
  sex: 'm' | 'f';
  height: number; // ~0.9 .. 1.1
  weight: number; // 0 slim .. 1 heavy
  skin: number; hair: number; shoes?: number;
  outfit: 'shirt' | 'dress' | 'wrapper' | 'agbada';
  top: number; bottom: number;
  hairStyle: 'short' | 'braids' | 'cap' | 'gele' | 'bald';
  /** extras: a bag on the back (the player), a tray on the head (a hawker) */
  bag?: number; tray?: boolean;
  /** NAIJA 2099: an LED trim colour, and a visor over the eyes */
  neon?: number; visor?: boolean;
};
const NEON = [0x00e5ff, 0xff2bd6, 0xffc400, 0x1aff9c, 0x4a6bff];

/** A random Lagos local. */
export function randomBuild(r: () => number): Build {
  const sex = r() < 0.5 ? 'm' : 'f';
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const outfit = sex === 'f' ? pick(['dress', 'wrapper', 'shirt', 'dress'] as const) : pick(['shirt', 'shirt', 'agbada', 'shirt'] as const);
  const hairStyle = sex === 'f' ? pick(['braids', 'gele', 'short', 'braids'] as const) : pick(['short', 'cap', 'bald', 'short'] as const);
  return {
    sex, outfit, hairStyle,
    height: 0.92 + r() * 0.16 + (sex === 'm' ? 0.04 : 0),
    weight: Math.pow(r(), 1.7),
    skin: pick(SKIN), hair: pick(HAIR), top: pick(CLOTH),
    bottom: outfit === 'shirt' ? pick(TROUSERS) : pick(CLOTH),
    shoes: pick([0x1a1a1a, 0x5a3a26, 0xefefef, 0x8b2c1c, 0x2a46ff, 0x3a2a1f]),
    neon: r() < 0.55 ? pick(NEON) : undefined,
    visor: r() < 0.2,
  };
}

// ---- the mesh builder: lofted surfaces and small rigid parts, each vertex bound to its bones ----
type Ring = {
  y: number; // along the chain (its frame's local y)
  rx: number; rz: number; // half-width and half-depth
  z?: number; // forward offset of the section's centre
  color: number; skin?: boolean;
  bones: [number, number, number]; // bone a, bone b, weight of b (0..1)
};

class Mesh {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; uv: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = [];
  private c = new THREE.Color();
  private push(g: THREE.BufferGeometry, m: THREE.Matrix4, color: (i: number) => number, skin: (i: number) => boolean, bones: (i: number) => [number, number, number], glow = false) {
    const o = this.pos.length / 3, p = g.attributes.position, n = g.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nrm.push(v.x, v.y, v.z);
      this.c.setHex(color(i)); this.col.push(this.c.r, this.c.g, this.c.b);
      this.uv.push(skin(i) ? 1 : 0, glow ? 1 : 0);
      const [a, b, t] = bones(i); this.si.push(a, b, 0, 0); this.sw.push(1 - t, t, 0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(g.index.getX(i) + o);
    else for (let i = 0; i < p.count; i++) this.idx.push(o + i);
  }
  /** A smooth surface lofted through rings (in [frame]'s space), capped at both ends. */
  loft(rings: Ring[], frame: THREE.Matrix4, seg = 12) {
    const pos: number[] = [], idx: number[] = [], ringOf: number[] = [];
    rings.forEach((r, k) => {
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        pos.push(Math.sin(a) * r.rx, r.y, Math.cos(a) * r.rz + (r.z ?? 0));
        ringOf.push(k);
      }
    });
    for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) {
      const a = k * seg + s, b = k * seg + ((s + 1) % seg), c = a + seg, d = b + seg;
      // rings run from top to bottom: wind so faces point outwards
      if (rings[k + 1].y < rings[k].y) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    // caps: a centre point at each end
    const down = rings[rings.length - 1].y < rings[0].y;
    for (const [k, top] of [[0, true], [rings.length - 1, false]] as const) {
      const r = rings[k], ci = pos.length / 3;
      pos.push(0, r.y + (top === down ? 0.004 : -0.004), r.z ?? 0);
      ringOf.push(k);
      for (let s = 0; s < seg; s++) {
        const a = k * seg + s, b = k * seg + ((s + 1) % seg);
        if (top === down) idx.push(ci, a, b); else idx.push(ci, b, a); // the upper cap faces up, the lower down
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.push(g, frame, (i) => rings[ringOf[i]].color, (i) => !!rings[ringOf[i]].skin, (i) => rings[ringOf[i]].bones);
  }
  /** A rigid part bound to one bone: [g] placed by [local] inside [frame]. */
  part(g: THREE.BufferGeometry, frame: THREE.Matrix4, local: { p?: [number, number, number]; s?: [number, number, number]; r?: [number, number, number] }, color: number, bone: number, skin = false, glow = false) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(local.p ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(local.r ?? [0, 0, 0]))),
      new THREE.Vector3(...(local.s ?? [1, 1, 1])),
    );
    this.push(g, new THREE.Matrix4().multiplyMatrices(frame, m), () => color, () => skin, () => [bone, bone, 0], glow);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    return g;
  }
}

// everybody shares one material: colour in the vertices; skin (uv.x = 1) gets a softer sheen than cloth
let sharedMat: THREE.MeshStandardMaterial | null = null;
const personMat = () => {
  if (sharedMat) return sharedMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSkin;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = uv.x;\nvGlow = uv.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkin;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 2.2;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.5, vSkin);')
      // a little warmth where light wraps round skin (cheap stand-in for light passing through it)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), vec3(1.06, 0.98, 0.95), vSkin);');
  };
  m.customProgramCacheKey = () => 'person-skin-glow';
  return (sharedMat = m);
};

const shade = (hex: number, k: number) => { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c.getHex(); };
const SPH = new THREE.SphereGeometry(1, 10, 8), SPH_S = new THREE.SphereGeometry(1, 7, 5);

export function makePerson(b: Build, opts: { shadows?: boolean } = {}): Person {
  const shadows = opts.shadows ?? true;
  const w = b.weight, f = b.sex === 'f';
  const shoulderHalf = (f ? 0.175 : 0.215) + w * 0.03;
  const chest = (f ? 0.15 : 0.175) + w * 0.05, waist = (f ? 0.12 : 0.15) + w * 0.085, hips = (f ? 0.185 : 0.16) + w * 0.055;
  const trousers = b.outfit === 'shirt' || b.outfit === 'agbada';
  const longSleeve = b.outfit === 'agbada';
  const top = b.top, skin = b.skin;

  // ---- skeleton (bind pose) ----
  const root = new THREE.Group();
  const body = new THREE.Bone();
  root.add(body);
  const bone = (parent: THREE.Object3D, x: number, y: number) => { const j = new THREE.Bone(); j.position.set(x, y, 0); parent.add(j); return j; };
  const neck = bone(body, 0, 1.53);
  const hipX = hips - 0.075;
  const lHip = bone(body, -hipX, 0.92), rHip = bone(body, hipX, 0.92);
  const lKnee = bone(lHip, 0, -0.44), rKnee = bone(rHip, 0, -0.44);
  const lSh = bone(body, -shoulderHalf, 1.44), rSh = bone(body, shoulderHalf, 1.44);
  lSh.rotation.z = 0.07; rSh.rotation.z = -0.07;
  const lEl = bone(lSh, 0, -0.29), rEl = bone(rSh, 0, -0.29);
  const bones = [body, neck, lHip, lKnee, rHip, rKnee, lSh, lEl, rSh, rEl];
  const B = (o: THREE.Object3D) => bones.indexOf(o as THREE.Bone);
  root.updateMatrixWorld(true);
  const M = new Mesh();
  const I = new THREE.Matrix4();

  // ---- the torso, neck and head: one unbroken surface ----
  const bust = f ? 0.035 + w * 0.02 : 0;
  const cloth = (y: number) => (y < 0.97 && trousers ? b.bottom : top);
  const torso = (y: number, rx: number, rz: number, z = 0): Ring => {
    const isSkin = y > 1.5;
    const t = THREE.MathUtils.clamp((y - 1.49) / 0.07, 0, 1); // the neck carries the head; the body the rest
    return { y, rx, rz, z, color: isSkin ? skin : cloth(y), skin: isSkin, bones: [B(body), B(neck), t] };
  };
  M.loft([
    torso(1.905, 0.02, 0.022, -0.005),
    torso(1.89, 0.06, 0.07, -0.006),
    torso(1.855, 0.088, 0.1, -0.006), // crown
    torso(1.80, 0.1, 0.112, -0.004), // temples
    torso(1.75, 0.101, 0.113, 0.0), // cheekbones
    torso(1.70, 0.093, 0.104, 0.012), // jaw
    torso(1.655, 0.07, 0.085, 0.024), // chin
    torso(1.63, 0.05, 0.055, 0.004), // under the jaw
    torso(1.58, 0.054, 0.056, -0.004), // neck
    torso(1.535, 0.06 + w * 0.01, 0.062, -0.006), // the base of the neck
    torso(1.5005, 0.12, 0.085, -0.004), // the collar line (cloth below)
    torso(1.4995, 0.12, 0.085, -0.004),
    torso(1.47, shoulderHalf * 0.86, chest * 0.56, -0.004), // across the shoulders
    torso(1.40, chest * 1.02, chest * 0.62 + bust * 0.4, bust * 0.4),
    torso(1.32, chest, chest * 0.64 + bust, bust * 0.8), // chest / bust
    torso(1.22, (chest + waist) / 2, waist * 0.74 + bust * 0.3, 0.006 + bust * 0.2),
    torso(1.11, waist, waist * 0.74, 0.01 + w * 0.02), // waist (and belly)
    torso(1.02, hips * 0.97, hips * 0.68, 0.004),
    ...(trousers ? [torso(0.9705, hips * 0.99, hips * 0.69), torso(0.9695, hips * 0.99, hips * 0.69)] : []), // the waistband
    torso(0.92, hips, hips * 0.7, -0.006), // hips and seat
    torso(0.85, hips * 0.82, hips * 0.58, -0.004),
  ], I, 14);
  if (trousers) M.loft([
    { y: 0.975, rx: hips * 1.0, rz: hips * 0.7, color: shade(b.bottom, 0.55), bones: [B(body), B(body), 0] },
    { y: 0.95, rx: hips * 1.0, rz: hips * 0.7, color: shade(b.bottom, 0.55), bones: [B(body), B(body), 0] },
  ], I, 14); // a belt

  // ---- the face ----
  const nF = neck.matrixWorld; // the head's frame: its y is measured from the neck joint (1.53)
  const fy = (y: number) => y - 1.53;
  for (const side of [-1, 1]) {
    M.part(SPH, nF, { p: [0.036 * side, fy(1.765), 0.098], s: [0.019, 0.012, 0.01] }, 0xf3eee6, B(neck)); // eye white
    M.part(SPH_S, nF, { p: [0.036 * side, fy(1.765), 0.106], s: [0.009, 0.009, 0.005] }, 0x140c07, B(neck)); // iris
    M.part(SPH_S, nF, { p: [0.037 * side, fy(1.785), 0.1], s: [0.024, 0.006, 0.01], r: [0, 0, -0.15 * side] }, b.hair, B(neck)); // brow
    M.part(SPH, nF, { p: [0.101 * side, fy(1.755), -0.004], s: [0.014, 0.03, 0.02] }, skin, B(neck), true); // ear
  }
  M.part(SPH, nF, { p: [0, fy(1.735), 0.11], s: [0.021, 0.03, 0.022], r: [0.25, 0, 0] }, shade(skin, 1.04), B(neck), true); // nose
  M.part(SPH, nF, { p: [0, fy(1.69), 0.104], s: [0.033, 0.009, 0.012] }, shade(skin, 0.6), B(neck), true); // upper lip
  M.part(SPH, nF, { p: [0, fy(1.682), 0.1], s: [0.03, 0.009, 0.012] }, shade(skin, 0.68), B(neck), true); // lower lip

  // ---- hair and headwear ----
  if (b.hairStyle === 'short' || b.hairStyle === 'braids') {
    M.part(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), nF, { p: [0, fy(1.79), -0.008], s: [0.106, 0.118, 0.12] }, b.hair, B(neck));
    if (b.hairStyle === 'braids') for (let i = 0; i < 10; i++) {
      const a = Math.PI * (0.55 + (i / 9) * 0.9);
      M.part(new THREE.CylinderGeometry(0.011, 0.008, 0.3, 4), nF, { p: [Math.cos(a) * 0.095, fy(1.66), -Math.sin(a) * 0.1 - 0.01], r: [0.12, 0, 0] }, b.hair, B(neck));
    }
  } else if (b.hairStyle === 'cap') {
    M.part(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), nF, { p: [0, fy(1.8), -0.006], s: [0.11, 0.1, 0.122] }, top, B(neck));
    M.part(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 12, 1, false, -Math.PI / 2, Math.PI), nF, { p: [0, fy(1.805), 0.1], s: [1, 1, 0.9] }, shade(top, 0.8), B(neck));
  } else if (b.hairStyle === 'gele') {
    M.part(new THREE.TorusKnotGeometry(0.075, 0.035, 40, 6, 2, 3), nF, { p: [0, fy(1.9), -0.01], s: [1.3, 0.85, 1.15] }, top, B(neck));
    M.part(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), nF, { p: [0, fy(1.79), -0.008], s: [0.108, 0.12, 0.122] }, top, B(neck));
  } else {
    M.part(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), nF, { p: [0, fy(1.8), -0.008], s: [0.101, 0.105, 0.113] }, shade(skin, 0.9), B(neck), true);
  }

  // ---- legs: one surface from hip to ankle, smooth at the knee ----
  for (const [hip, knee] of [[lHip, lKnee], [rHip, rKnee]] as const) {
    const leg = (y: number, r: number, z = 0, rzk = 0.94): Ring => {
      const t = THREE.MathUtils.clamp((-y - 0.38) / 0.12, 0, 1);
      const covered = trousers || (b.outfit === 'wrapper' && y > -0.75);
      return { y, rx: r, rz: r * rzk, z, color: covered ? b.bottom : skin, skin: !covered, bones: [B(hip), B(knee), t] };
    };
    const tw = w * 0.03;
    M.loft([
      leg(0.07, 0.096 + tw), leg(0, 0.1 + tw), leg(-0.12, 0.094 + tw, 0.006), leg(-0.26, 0.08 + tw * 0.8, 0.004),
      leg(-0.38, 0.062 + tw * 0.5), leg(-0.44, 0.056 + tw * 0.4, 0.006), // the knee
      leg(-0.52, 0.06 + tw * 0.4, -0.006), leg(-0.6, 0.066 + tw * 0.4, -0.012), // the calf, at the back
      leg(-0.72, 0.05 + tw * 0.2, -0.004), leg(-0.82, 0.04), leg(-0.86, 0.038),
      ...(trousers ? [leg(-0.8605, 0.05), leg(-0.87, 0.05)] : []), // the hem
    ], hip.matrixWorld, 11);
    // shoe: a shaped upper and a sole, on the knee bone
    const kF = knee.matrixWorld;
    const shoe = b.shoes ?? 0x1a1a1a;
    M.part(SPH, kF, { p: [0, -0.43, 0.04], s: [0.055, 0.045, 0.125] }, shoe, B(knee));
    M.part(new THREE.BoxGeometry(1, 1, 1), kF, { p: [0, -0.468, 0.04], s: [0.1, 0.018, 0.26] }, shade(shoe, 0.5), B(knee));
  }

  // ---- arms: shoulder to wrist in one surface, smooth at the elbow; a hand with a thumb ----
  for (const [sh, el, side] of [[lSh, lEl, -1], [rSh, rEl, 1]] as const) {
    const sleeveEnd = longSleeve ? -0.6 : b.outfit === 'dress' && f ? -0.06 : -0.15;
    const arm = (y: number, r: number, z = 0): Ring => {
      const t = THREE.MathUtils.clamp((-y - 0.24) / 0.1, 0, 1);
      const covered = y > sleeveEnd;
      return { y, rx: r * 0.94, rz: r, z, color: covered ? top : skin, skin: !covered, bones: [B(sh), B(el), t] };
    };
    const aw = w * 0.018;
    const rings = [
      arm(0.015, 0.058 + aw), arm(0, 0.066 + aw), arm(-0.07, 0.064 + aw), arm(sleeveEnd + 0.0005, longSleeve ? 0.06 : 0.063 + aw), arm(sleeveEnd - 0.0005, 0.058 + aw * 0.8),
      arm(-0.2, 0.054 + aw * 0.7), arm(-0.27, 0.044 + aw * 0.4), // the elbow
      arm(-0.33, 0.048 + aw * 0.5), arm(-0.42, 0.042 + aw * 0.3), arm(-0.52, 0.032), arm(-0.56, 0.029),
    ].sort((a, b2) => b2.y - a.y);
    M.loft(rings, sh.matrixWorld, 10);
    const eF = el.matrixWorld; // the hand, in the elbow's frame (elbow at -0.29 from the shoulder)
    M.part(SPH, eF, { p: [0, -0.33, 0.004], s: [0.034, 0.06, 0.02] }, skin, B(el), true);
    M.part(SPH, eF, { p: [-0.026 * side, -0.31, 0.02], s: [0.012, 0.03, 0.012], r: [0.3, 0, 0.5 * side] }, skin, B(el), true);
  }

  // ---- draped clothes over the body ----
  if (b.outfit === 'dress' || b.outfit === 'wrapper') {
    const long = b.outfit === 'wrapper';
    const hem = long ? 0.13 : 0.47;
    const skirt = (y: number, r: number, c: number): Ring => ({ y, rx: r, rz: r * 0.82, color: c, bones: [B(body), B(body), 0] });
    const c = long ? b.bottom : top;
    M.loft([
      skirt(1.0, waist * 1.04, c), skirt(0.9, hips * 1.08, c), skirt(hem + 0.06, hips + (long ? 0.06 : 0.12), c),
      skirt(hem + 0.0405, hips + (long ? 0.065 : 0.125), shade(c, 0.6)), skirt(hem, hips + (long ? 0.068 : 0.13), shade(c, 0.6)), // patterned hem band
    ], I, 16);
    if (long) M.part(new THREE.BoxGeometry(1, 1, 1), I, { p: [hips * 0.45, 0.6, (hips + 0.04) * 0.82], s: [0.06, 0.55, 0.015] }, shade(c, 0.8), B(body)); // the wrapper's tuck
  }
  if (b.outfit === 'agbada') {
    const robe = (y: number, rx: number, rz: number, c = top): Ring => ({ y, rx, rz, color: c, bones: [B(body), B(body), 0] });
    M.loft([
      robe(1.49, 0.13, 0.1), robe(1.44, shoulderHalf + 0.12, chest * 0.8), robe(1.1, shoulderHalf + 0.17, chest * 0.9),
      robe(0.42, shoulderHalf + 0.22, chest * 0.95), robe(0.40, shoulderHalf + 0.22, chest * 0.95, shade(top, 0.6)),
    ], I, 16);
    M.part(new THREE.TorusGeometry(0.11, 0.02, 5, 16), I, { p: [0, 1.46, 0.035], s: [1, 1.5, 0.7], r: [Math.PI / 2 - 0.2, 0, 0] }, shade(top, 0.6), B(body)); // embroidery
  }
  if (b.outfit === 'shirt') {
    M.part(new THREE.TorusGeometry(0.068, 0.016, 5, 14), I, { p: [0, 1.51, 0.002], s: [1, 1, 0.92], r: [Math.PI / 2, 0, 0] }, shade(top, 1.1), B(body)); // collar
    M.part(new THREE.BoxGeometry(1, 1, 1), I, { p: [0, 1.25, chest * 0.64 + bust * 0.6 + 0.004], s: [0.022, 0.4, 0.006] }, shade(top, 0.86), B(body)); // the button placket
  }
  if (b.bag) {
    M.part(new THREE.BoxGeometry(1, 1, 1), I, { p: [0, 1.22, -chest * 0.66 - 0.065], s: [0.26, 0.34, 0.12] }, b.bag, B(body));
    for (const side of [-1, 1]) M.part(new THREE.BoxGeometry(1, 1, 1), I, { p: [0.085 * side, 1.3, chest * 0.4], s: [0.03, 0.36, 0.012], r: [0.2, 0, 0] }, shade(b.bag, 0.6), B(body));
  }
  if (b.tray) {
    M.part(new THREE.CylinderGeometry(0.26, 0.22, 0.05, 16), nF, { p: [0, fy(1.95), 0] }, 0xb8b4ac, B(neck));
    for (let i = 0; i < 6; i++) M.part(SPH, nF, { p: [Math.cos(i * 1.1) * 0.13, fy(2.0), Math.sin(i * 1.1) * 0.13], s: [0.06, 0.05, 0.06] }, [0xe07b1f, 0xd9472b, 0x6ea33a, 0xf2c200, 0xe8d9a8, 0xd9472b][i], B(neck));
  }

  // ---- NAIJA 2099: LED trims and a visor ----
  if (b.neon) {
    const n = b.neon;
    M.part(new THREE.TorusGeometry(1, 0.012, 4, 20), I, { p: [0, 0.965, 0.002], s: [hips * 1.02, hips * 0.72, 1], r: [Math.PI / 2, 0, 0] }, n, B(body), false, true); // a lit belt
    for (const [sh, el] of [[lSh, lEl], [rSh, rEl]] as const) {
      void sh;
      M.part(new THREE.TorusGeometry(0.031, 0.006, 4, 12), el.matrixWorld, { p: [0, -0.255, 0], r: [Math.PI / 2, 0, 0] }, n, B(el), false, true); // a cuff band
    }
    for (const knee of [lKnee, rKnee]) M.part(new THREE.BoxGeometry(1, 1, 1), knee.matrixWorld, { p: [0, -0.476, 0.04], s: [0.104, 0.006, 0.264] }, n, B(knee), false, true); // lit soles
  }
  if (b.visor) {
    M.part(new THREE.CylinderGeometry(0.108, 0.108, 0.032, 16, 1, true, -0.95, 1.9), nF, { p: [0, fy(1.766), 0.004] }, b.neon ?? 0x00e5ff, B(neck), false, true);
  }

  // ---- bind it all to the skeleton: one skinned mesh ----
  const mesh = new THREE.SkinnedMesh(M.geometry(), personMat());
  mesh.castShadow = shadows;
  mesh.frustumCulled = false; // the bind-pose bounds don't follow the swinging limbs
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones));

  root.scale.set(b.height * (1 + w * 0.05), b.height, b.height * (1 + w * 0.05));
  return {
    root, body, sex: b.sex,
    joints: { lShoulder: lSh, rShoulder: rSh, lElbow: lEl, rElbow: rEl, lHip, rHip, lKnee, rKnee, neck },
    phase: Math.random() * Math.PI * 2,
    squash: 0,
  };
}

/** A walk or run cycle. [speed] in m/s (0 = standing); [turn]: how fast the body is turning (rad/s);
 *  [accel]: change of speed (m/s²).
 *
 *  The step rate is locked to the ground: one full stride cycle covers a stride length that grows
 *  with speed (about 1.4 m walking, 2.6 m sprinting), so the feet don't skate. Legs and arms swing
 *  in opposition with the knee folding on the back swing and straightening at heel strike; the body
 *  drops a little as weight lands and rises over the planted foot, shifts sideways foot to foot,
 *  leans into acceleration and banks into turns; the hips sway (more in a woman's walk) while the
 *  head stays level and looks where it's going. Standing, the body breathes and the head looks
 *  round; landing from a jump squashes the knees. */
export function animatePerson(p: Person, speed: number, dt: number, airborne = false, turn = 0, accel = 0) {
  if (p.drive) { p.drive(speed, dt, airborne, turn, accel); return; }
  const j = p.joints;
  const running = speed > 4.2;
  const stride = Math.min(1, speed / 6);
  const strideLen = 1.25 + Math.min(speed, 9) * 0.16; // metres per full cycle (two steps)
  p.phase += speed > 0.15 ? (speed * dt * Math.PI * 2) / strideLen : dt * 0.6;
  p.squash = Math.max(0, p.squash - dt * 3.5);
  p.lean = (p.lean ?? 0) + (THREE.MathUtils.clamp(accel * 0.025, -0.12, 0.12) - (p.lean ?? 0)) * Math.min(1, dt * 6);
  p.bank = (p.bank ?? 0) + (THREE.MathUtils.clamp(-turn * speed * 0.018, -0.16, 0.16) - (p.bank ?? 0)) * Math.min(1, dt * 6);
  if (airborne) {
    // tucked in the air: one knee up, arms out for balance
    j.lHip.rotation.x = -0.75; j.rHip.rotation.x = -0.2; j.lKnee.rotation.x = 1.2; j.rKnee.rotation.x = 0.5;
    j.lShoulder.rotation.x = -0.6; j.rShoulder.rotation.x = 0.35; j.lElbow.rotation.x = -0.5; j.rElbow.rotation.x = -0.5;
    p.body.rotation.set(0.06 + p.lean, 0, p.bank);
    p.body.position.y = 0;
    p.rig?.();
    return;
  }
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  const s2 = Math.sin(p.phase * 2);
  if (stride > 0.03) {
    const swing = running ? 0.85 : 0.5;
    // the leg reaches forward (negative x) and pushes back; the knee folds mostly on the back swing
    j.lHip.rotation.x = s * swing * stride;
    j.rHip.rotation.x = -s * swing * stride;
    j.lKnee.rotation.x = (Math.max(0, -c) * (running ? 1.55 : 0.95) + Math.max(0, s) * 0.12) * stride + 0.05;
    j.rKnee.rotation.x = (Math.max(0, c) * (running ? 1.55 : 0.95) + Math.max(0, -s) * 0.12) * stride + 0.05;
    // arms counter-swing; in a run they pump bent
    j.lShoulder.rotation.x = -s * (running ? 0.75 : 0.38) * stride;
    j.rShoulder.rotation.x = s * (running ? 0.75 : 0.38) * stride;
    j.lElbow.rotation.x = -(0.18 + (running ? 1.05 : 0.18) * stride + Math.max(0, s) * 0.25 * stride);
    j.rElbow.rotation.x = -(0.18 + (running ? 1.05 : 0.18) * stride + Math.max(0, -s) * 0.25 * stride);
    // weight: down as the heel strikes, up over the planted foot; sideways onto the standing leg
    p.body.position.y = (-0.5 + 0.5 * Math.abs(s2)) * (running ? 0.06 : 0.035) * stride - p.squash * 0.12;
    p.body.rotation.x = (running ? 0.14 : 0.04) * stride + p.lean;
    p.body.rotation.z = c * 0.03 * stride + p.bank;
    p.body.rotation.y = s * (p.sex === 'f' ? 0.1 : 0.06) * stride * (running ? 0.6 : 1); // hips turn with the stride
    j.neck.rotation.y = -p.body.rotation.y; // the head stays facing ahead
    j.neck.rotation.x = -p.body.rotation.x * 0.6; // and level
  } else {
    // standing: breathe, settle, look round now and then
    const breath = Math.sin(p.phase * 1.4);
    for (const k of ['lHip', 'rHip', 'lShoulder', 'rShoulder'] as const) j[k].rotation.x *= 0.85;
    j.lKnee.rotation.x = j.rKnee.rotation.x = 0.04 + p.squash * 0.6;
    j.lElbow.rotation.x = j.rElbow.rotation.x = -0.15 - breath * 0.02;
    p.body.position.y = breath * 0.004 - p.squash * 0.12;
    p.body.rotation.set(0.02 + p.lean, Math.sin(p.phase * 0.3) * 0.03, p.bank * 0.5);
    j.neck.rotation.y = Math.sin(p.phase * 0.21) * 0.35;
    j.neck.rotation.x = 0;
  }
  p.rig?.();
}
