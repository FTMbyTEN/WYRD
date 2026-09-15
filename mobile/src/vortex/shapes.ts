// Direct port of the gate-vortex particle shapes from `WYRD Mobile.dc.html` (itself a
// phone-scale port of the real `public/gate-vortex.js`, VN=900 there vs 720 here for perf).
// Every shape emits exactly VN points so any two are lerp-compatible vertex-for-vertex.
import { FACE_VERTS } from '../face/faceMeshData';

export const VN = 720;

function faceVerts(): number[][] | null {
  return FACE_VERTS && FACE_VERTS.length ? FACE_VERTS : null;
}

function vSphere(): Float32Array {
  const a = new Float32Array(VN * 3);
  const R = 2.1;
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < VN; i++) {
    const y = 1 - (i / (VN - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = g * i;
    a[i * 3] = Math.cos(t) * r * R;
    a[i * 3 + 1] = y * R;
    a[i * 3 + 2] = Math.sin(t) * r * R;
  }
  return a;
}
function vMandala(): Float32Array {
  const rings = 10, per = VN / rings, a = new Float32Array(VN * 3);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    const rad = 0.3 + r * 0.22;
    for (let p = 0; p < per; p++) {
      const t = (p / per) * Math.PI * 2 + r * 0.3;
      a[k++] = Math.cos(t) * rad; a[k++] = Math.sin(t) * rad; a[k++] = 0;
    }
  }
  return a;
}
function vFace(): Float32Array {
  const V = faceVerts(); if (!V) return vSphere();
  const a = new Float32Array(VN * 3), s = 2.7, T = V.length;
  for (let i = 0; i < VN; i++) {
    const v = V[i % T], pass = Math.floor(i / T);
    a[i * 3] = v[0] * s + pass * 0.02; a[i * 3 + 1] = v[1] * s; a[i * 3 + 2] = v[2] * s;
  }
  return a;
}
function vFaceDream(): Float32Array {
  const V = faceVerts(); if (!V) return vSphere();
  const a = new Float32Array(VN * 3), s = 2.7, T = V.length;
  for (let i = 0; i < VN; i++) {
    const v = V[i % T], pass = Math.floor(i / T);
    a[i * 3] = v[0] * s + Math.sin(v[1] * 4 + pass * 0.6) * 0.18;
    a[i * 3 + 1] = v[1] * s + Math.cos(v[0] * 5 + pass * 0.4) * 0.12;
    a[i * 3 + 2] = v[2] * s;
  }
  return a;
}
function vInfinity(): Float32Array {
  const a = new Float32Array(VN * 3), A = 2.1;
  for (let i = 0; i < VN; i++) {
    const t = (i / VN) * Math.PI * 2, d = 1 + Math.sin(t) * Math.sin(t);
    a[i * 3] = (A * Math.cos(t)) / d;
    a[i * 3 + 1] = (A * Math.sin(t) * Math.cos(t)) / d;
    a[i * 3 + 2] = Math.sin(t * 3) * 0.35;
  }
  return a;
}
function vHelix(): Float32Array {
  const a = new Float32Array(VN * 3), h = VN / 2;
  for (let i = 0; i < VN; i++) {
    const st = i < h ? 0 : 1, id = st ? i - h : i, t = id / (h - 1), ang = t * Math.PI * 10 + (st ? Math.PI : 0);
    a[i * 3] = Math.cos(ang) * 1.3; a[i * 3 + 1] = -2.8 + t * 5.6; a[i * 3 + 2] = Math.sin(ang) * 1.3;
  }
  return a;
}
function vKnot(): Float32Array {
  const a = new Float32Array(VN * 3), p = 2, q = 3, R = 1.6, r = 0.6;
  for (let i = 0; i < VN; i++) {
    const t = (i / VN) * Math.PI * 2;
    a[i * 3] = (R + r * Math.cos(q * t)) * Math.cos(p * t) * 1.3;
    a[i * 3 + 1] = (R + r * Math.cos(q * t)) * Math.sin(p * t) * 0.9 * 1.3;
    a[i * 3 + 2] = r * Math.sin(q * t) * 1.3;
  }
  return a;
}
function vLattice(corners: number[][], edges: number[][], fillY = 0): Float32Array {
  const a = new Float32Array(VN * 3), per = Math.floor(VN / edges.length);
  let k = 0;
  for (const [x, y] of edges) {
    const A = corners[x], B = corners[y];
    for (let p = 0; p < per; p++) {
      const t = p / per;
      a[k * 3] = A[0] + (B[0] - A[0]) * t;
      a[k * 3 + 1] = A[1] + (B[1] - A[1]) * t;
      a[k * 3 + 2] = A[2] + (B[2] - A[2]) * t;
      k++;
    }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = fillY; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vCube(): Float32Array {
  const S = 1.8;
  const c = [[-S, -S, -S], [S, -S, -S], [S, S, -S], [-S, S, -S], [-S, -S, S], [S, -S, S], [S, S, S], [-S, S, S]];
  return vLattice(c, [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]);
}
function vPyramid(): Float32Array {
  const S = 1.9;
  const c = [[0, 2.2, 0], [-S, -1.4, -S], [S, -1.4, -S], [S, -1.4, S], [-S, -1.4, S]];
  return vLattice(c, [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]], -1.4);
}
function vGalaxy(): Float32Array {
  const a = new Float32Array(VN * 3), arms = 3;
  for (let i = 0; i < VN; i++) {
    const t = i / VN, arm = i % arms, rad = 0.3 + t * 2.6, ang = t * Math.PI * 6 + arm * (Math.PI * 2 / arms);
    const sp = Math.sin(i * 12.9898) * 0.5 * 0.25;
    a[i * 3] = Math.cos(ang) * rad + sp; a[i * 3 + 1] = Math.sin(i * 78.233) * 0.15; a[i * 3 + 2] = Math.sin(ang) * rad + sp;
  }
  return a;
}
function vWaveGrid(): Float32Array {
  const a = new Float32Array(VN * 3), g = Math.round(Math.sqrt(VN));
  let k = 0;
  for (let gx = 0; gx < g; gx++) for (let gz = 0; gz < g; gz++) {
    if (k >= VN) break;
    const x = (gx / (g - 1) - 0.5) * 4.5, z = (gz / (g - 1) - 0.5) * 4.5;
    a[k * 3] = x; a[k * 3 + 1] = Math.sin(x * 1.3) * Math.cos(z * 1.3) * 0.8; a[k * 3 + 2] = z; k++;
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = 0; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vStarBurst(): Float32Array {
  const a = new Float32Array(VN * 3), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < VN; i++) {
    const y = 1 - (i / (VN - 1)) * 2, rY = Math.sqrt(Math.max(0, 1 - y * y)), t = g * i;
    const sp = 1 + 0.9 * Math.pow(Math.abs(Math.sin(t * 5) * Math.cos(y * 8)), 3), R = 1.7 * sp;
    a[i * 3] = Math.cos(t) * rY * R; a[i * 3 + 1] = y * R; a[i * 3 + 2] = Math.sin(t) * rY * R;
  }
  return a;
}
function vAtom(): Float32Array {
  const a = new Float32Array(VN * 3), nuc = Math.round(VN * 0.08), g = Math.PI * (3 - Math.sqrt(5));
  let k = 0;
  for (let i = 0; i < nuc; i++) {
    const y = 1 - (i / (nuc - 1)) * 2, rY = Math.sqrt(Math.max(0, 1 - y * y)), t = g * i;
    a[k * 3] = Math.cos(t) * rY * 0.35; a[k * 3 + 1] = y * 0.35; a[k * 3 + 2] = Math.sin(t) * rY * 0.35; k++;
  }
  const per = Math.floor((VN - nuc) / 3), tilts = [0, Math.PI / 3, -Math.PI / 3];
  for (let r = 0; r < 3; r++) {
    const R = 2, tl = tilts[r], ry = r * (Math.PI / 3);
    for (let p = 0; p < per; p++) {
      const ang = (p / per) * Math.PI * 2, x = Math.cos(ang) * R, y = Math.sin(ang) * R * 0.4;
      const y2 = y * Math.cos(tl), z2 = y * Math.sin(tl);
      a[k * 3] = x * Math.cos(ry) + z2 * Math.sin(ry); a[k * 3 + 1] = y2; a[k * 3 + 2] = -x * Math.sin(ry) + z2 * Math.cos(ry); k++;
    }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = 0; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vOrbital(): Float32Array {
  const a = new Float32Array(VN * 3), g = Math.PI * (3 - Math.sqrt(5)), per = VN / 2;
  for (let i = 0; i < VN; i++) {
    const lobe = i % 2 === 0 ? 1 : -1, u = Math.floor(i / 2), y = u / (per - 1), t = g * i, lr = Math.sin(y * Math.PI) * 1.3;
    a[i * 3] = Math.cos(t) * lr; a[i * 3 + 1] = lobe * y * 2.6; a[i * 3 + 2] = Math.sin(t) * lr;
  }
  return a;
}
function vSaturn(): Float32Array {
  const a = new Float32Array(VN * 3), pc = Math.round(VN * 0.45), g = Math.PI * (3 - Math.sqrt(5));
  let k = 0;
  for (let i = 0; i < pc; i++) {
    const y = 1 - (i / (pc - 1)) * 2, rY = Math.sqrt(Math.max(0, 1 - y * y)), t = g * i;
    a[k * 3] = Math.cos(t) * rY * 1.1; a[k * 3 + 1] = y * 1.1; a[k * 3 + 2] = Math.sin(t) * rY * 1.1; k++;
  }
  const tilt = 0.4, rem = VN - pc;
  for (let i = 0; i < rem; i++) {
    const ang = (i / rem) * Math.PI * 6, r = 1.7 + ((i % 60) / 60) * 0.8, x = Math.cos(ang) * r, zf = Math.sin(ang) * r, yf = Math.sin(i * 12.9898) * 0.015;
    a[k * 3] = x; a[k * 3 + 1] = yf * Math.cos(tilt) - zf * Math.sin(tilt); a[k * 3 + 2] = yf * Math.sin(tilt) + zf * Math.cos(tilt); k++;
  }
  return a;
}
function vBlackHole(): Float32Array {
  const a = new Float32Array(VN * 3);
  for (let i = 0; i < VN; i++) {
    const t = i / VN, r = 0.35 + Math.pow(t, 1.8) * 2.7, ang = t * Math.PI * 16 + r * 0.6;
    const lens = Math.exp(-r * 1.3) * 0.85 * (i % 2 ? -1 : 1);
    a[i * 3] = Math.cos(ang) * r; a[i * 3 + 1] = Math.sin(i * 53.123) * 0.03 * r + lens; a[i * 3 + 2] = Math.sin(ang) * r;
  }
  return a;
}
function vCity(): Float32Array {
  const a = new Float32Array(VN * 3), gx = 10, gz = 6, per = Math.floor(VN / (gx * gz));
  let k = 0;
  for (let bx = 0; bx < gx; bx++) for (let bz = 0; bz < gz; bz++) {
    const seed = bx * 31 + bz * 17, h = 0.6 + (Math.sin(seed * 12.9898) * 0.5 + 0.5) * 3.2;
    const x = (bx / (gx - 1) - 0.5) * 5.5, z = (bz / (gz - 1) - 0.5) * 3.5;
    for (let p = 0; p < per; p++) { a[k * 3] = x; a[k * 3 + 1] = -2.2 + h * (p / per); a[k * 3 + 2] = z; k++; }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = -2.2; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vMobius(): Float32Array {
  const a = new Float32Array(VN * 3), R = 1.7;
  for (let i = 0; i < VN; i++) {
    const u = (i / VN) * Math.PI * 2, v = ((i % 7) / 6 - 0.5) * 0.9, ht = u / 2;
    a[i * 3] = (R + v * Math.cos(ht)) * Math.cos(u); a[i * 3 + 1] = (R + v * Math.cos(ht)) * Math.sin(u); a[i * 3 + 2] = v * Math.sin(ht);
  }
  return a;
}
function vTesseract(): Float32Array {
  const v4: number[][] = [];
  for (let i = 0; i < 16; i++) v4.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
  const a1 = 0.6, a2 = 0.4;
  const proj = v4.map(([x, y, z, w]) => {
    const x1 = x * Math.cos(a1) - w * Math.sin(a1), w1 = x * Math.sin(a1) + w * Math.cos(a1);
    const y1 = y * Math.cos(a2) - z * Math.sin(a2), z1 = y * Math.sin(a2) + z * Math.cos(a2);
    const sc = 3 / (3 - w1);
    return [x1 * sc * 1.5, y1 * sc * 1.5, z1 * sc * 1.5];
  });
  const edges: number[][] = [];
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) edges.push([i, j]); }
  return vLattice(proj, edges);
}
function vNeural(): Float32Array {
  const a = new Float32Array(VN * 3), layers = [4, 6, 6, 4, 2];
  const lx = layers.map((_, i) => -2.2 + i * (4.4 / (layers.length - 1)));
  const nodes: number[][] = [];
  layers.forEach((c, li) => { for (let n = 0; n < c; n++) nodes.push([lx[li], (n - (c - 1) / 2) * 0.55, 0]); });
  const edges: number[][] = [];
  let off = 0;
  for (let li = 0; li < layers.length - 1; li++) {
    for (let x = 0; x < layers[li]; x++) for (let y = 0; y < layers[li + 1]; y++) edges.push([off + x, off + layers[li] + y]);
    off += layers[li];
  }
  const g = Math.PI * (3 - Math.sqrt(5));
  let k = 0;
  for (const p of nodes) for (let i = 0; i < 6; i++) {
    const y = 1 - (i / 5) * 2, rY = Math.sqrt(Math.max(0, 1 - y * y)), t = g * i;
    a[k * 3] = p[0] + Math.cos(t) * rY * 0.13; a[k * 3 + 1] = p[1] + y * 0.13; a[k * 3 + 2] = Math.sin(t) * rY * 0.13; k++;
  }
  const per = Math.max(2, Math.floor((VN - k) / edges.length));
  for (const [x, y] of edges) {
    const A = nodes[x], B = nodes[y];
    for (let p = 0; p < per && k < VN; p++) {
      const t = p / per;
      a[k * 3] = A[0] + (B[0] - A[0]) * t; a[k * 3 + 1] = A[1] + (B[1] - A[1]) * t; a[k * 3 + 2] = 0; k++;
    }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = 0; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vTree(): Float32Array {
  const a = new Float32Array(VN * 3);
  const segs: { f: number[]; t: number[]; l: number }[] = [];
  (function br(x: number, y: number, z: number, ang: number, len: number, d: number) {
    if (!d || len < 0.05) return;
    const x2 = x + Math.sin(ang) * len, y2 = y + Math.cos(ang) * len, z2 = z + Math.sin(d * 1.7) * 0.15;
    segs.push({ f: [x, y, z], t: [x2, y2, z2], l: len });
    br(x2, y2, z2, ang - 0.45 + Math.sin(d) * 0.1, len * 0.72, d - 1);
    br(x2, y2, z2, ang + 0.45 - Math.sin(d) * 0.1, len * 0.72, d - 1);
  })(0, -2.6, 0, 0, 1.6, 7);
  const tot = segs.reduce((s, x) => s + x.l, 0);
  let k = 0;
  for (const s of segs) {
    const b = Math.max(2, Math.round((s.l / tot) * VN));
    for (let p = 0; p < b && k < VN; p++) {
      const t = p / b;
      a[k * 3] = s.f[0] + (s.t[0] - s.f[0]) * t; a[k * 3 + 1] = s.f[1] + (s.t[1] - s.f[1]) * t; a[k * 3 + 2] = s.f[2] + (s.t[2] - s.f[2]) * t; k++;
    }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = -2.6; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vExplosion(): Float32Array {
  const a = new Float32Array(VN * 3), g = Math.PI * (3 - Math.sqrt(5)), core = Math.round(VN * 0.1);
  let k = 0;
  for (let i = 0; i < core; i++) {
    const y = 1 - (i / (core - 1)) * 2, rY = Math.sqrt(Math.max(0, 1 - y * y)), t = g * i;
    a[k * 3] = Math.cos(t) * rY * 0.25; a[k * 3 + 1] = y * 0.25; a[k * 3 + 2] = Math.sin(t) * rY * 0.25; k++;
  }
  const rays = VN - core;
  for (let i = 0; i < rays; i++) {
    const y = 1 - (i / (rays - 1)) * 2, rY = Math.sqrt(Math.max(0, 1 - y * y)), t = g * i;
    const jag = 0.6 + 0.4 * Math.abs(Math.sin(t * 7 + y * 5)), R = 2.6 * jag;
    a[k * 3] = Math.cos(t) * rY * R; a[k * 3 + 1] = y * R; a[k * 3 + 2] = Math.sin(t) * rY * R; k++;
  }
  return a;
}
function vFire(): Float32Array {
  const a = new Float32Array(VN * 3), tg = 8, per = Math.floor(VN / tg);
  let k = 0;
  for (let f = 0; f < tg; f++) {
    const ba = (f / tg) * Math.PI * 2;
    for (let p = 0; p < per; p++) {
      const t = p / per, sway = Math.sin(t * Math.PI * 2.2 + f * 1.3) * 0.35 * t, r = 0.9 * (1 - t * 0.7), ang = ba + sway * 0.4;
      a[k * 3] = Math.cos(ang) * r + sway; a[k * 3 + 1] = -2.2 + t * 4.6; a[k * 3 + 2] = Math.sin(ang) * r; k++;
    }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = -2.2; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vDrop(): Float32Array {
  const a = new Float32Array(VN * 3), rings = 24, per = Math.floor(VN / rings);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1), y = -1.6 + t * 3.4, rad = 1.5 * Math.sin(Math.PI * t * 0.85) * (1 - t * 0.3);
    for (let p = 0; p < per; p++) {
      const ang = (p / per) * Math.PI * 2;
      a[k * 3] = Math.cos(ang) * rad; a[k * 3 + 1] = y; a[k * 3 + 2] = Math.sin(ang) * rad; k++;
    }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = 1.8; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vWind(): Float32Array {
  const a = new Float32Array(VN * 3), st = 9, per = Math.floor(VN / st);
  let k = 0;
  for (let s = 0; s < st; s++) {
    const yb = -2 + (s / (st - 1)) * 4, ph = s * 0.9;
    for (let p = 0; p < per; p++) {
      const t = p / per;
      a[k * 3] = (t - 0.5) * 5.2; a[k * 3 + 1] = yb + Math.sin(t * Math.PI * 3 + ph) * 0.35; a[k * 3 + 2] = Math.cos(t * Math.PI * 2 + ph) * 0.4; k++;
    }
  }
  while (k < VN) { a[k * 3] = 0; a[k * 3 + 1] = 0; a[k * 3 + 2] = 0; k++; }
  return a;
}
function vCircuit(): Float32Array {
  const S = 2;
  const segs = [[[-S, -S, 0], [S, -S, 0]], [[S, -S, 0], [S, S, 0]], [[S, S, 0], [-S, S, 0]], [[-S, S, 0], [-S, -S, 0]]];
  for (let i = 1; i < 5; i++) {
    const p = -S + (i / 5) * 2 * S;
    if (i % 2 === 0) segs.push([[p, -S * 0.6, 0], [p, S * 0.6, 0]]);
    else segs.push([[-S * 0.6, p, 0], [S * 0.6, p, 0]]);
  }
  const pts: number[][] = [], edges: number[][] = [];
  segs.forEach((s, i) => { pts.push(s[0], s[1]); edges.push([i * 2, i * 2 + 1]); });
  return vLattice(pts, edges);
}

export const VORTEX_SHAPES: [string, () => Float32Array][] = [
  ['SPHERE', vSphere], ['MANDALA', vMandala], ['WYRD / FACE', vFace], ['WYRD / DREAMING', vFaceDream],
  ['INFINITY', vInfinity], ['DNA HELIX', vHelix], ['TORUS KNOT', vKnot], ['CUBE LATTICE', vCube],
  ['GALAXY', vGalaxy], ['WAVE GRID', vWaveGrid], ['STARBURST', vStarBurst], ['BOHR ATOM', vAtom],
  ['P-ORBITAL', vOrbital], ['SATURN', vSaturn], ['BLACK HOLE', vBlackHole], ['CITYSCAPE', vCity],
  ['PYRAMID', vPyramid], ['MOBIUS STRIP', vMobius], ['TESSERACT', vTesseract], ['NEURAL NET', vNeural],
  ['FRACTAL TREE', vTree], ['EXPLOSION', vExplosion], ['FIRE', vFire], ['WATER DROP', vDrop],
  ['WIND STREAMS', vWind], ['CIRCUIT', vCircuit],
];

export interface VortexShape {
  name: string;
  pts: Float32Array;
}

let builtShapes: VortexShape[] | null = null;
export function buildShapes(): VortexShape[] {
  if (!builtShapes) builtShapes = VORTEX_SHAPES.map(([name, f]) => ({ name, pts: f() }));
  return builtShapes;
}
