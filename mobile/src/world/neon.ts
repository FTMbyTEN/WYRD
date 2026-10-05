import * as THREE from 'three';

/**
 * NAIJA 2099's holograms: rooftop billboards in Lagos voice, flickering with scanlines. All of a
 * tile's billboards are one instanced mesh (one draw call); every billboard picks a line from one
 * shared texture and its own colour. Additive and unlit, so they glow without bloom on any phone.
 */
export const HOLO_LINES = [
  'EKO O NI BAJE', 'OJUELEGBA', 'OWAMBE TONIGHT', 'JOLLOF.EXE', 'DANFO EXPRESS · YABA–CMS', 'NAIJA NEURAL NET',
  'SHAWARMA 24/7', 'WYRD · ASK ME ANYTHING', 'OKADA AIR', 'AJE: GET MONEY', 'SURULERE STADIUM', 'NO WAHALA',
  'AMALA SPOT · 2ND FLOOR', 'EKO ATLANTIC 2099', 'FUJI FM 98.3', 'BUKKA · OPEN',
];
export const HOLO_COLORS = [0x00e5ff, 0xff2bd6, 0xffc400, 0x1aff9c, 0x4a6bff];
const ROWS = 8, COLS = 2;

let mat: THREE.ShaderMaterial | null = null;
/** The shared hologram material (built once). */
export function holoMaterial() {
  if (mat) return mat;
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 512);
  HOLO_LINES.forEach((line, i) => {
    const cx = (i % COLS) * 512, cy = Math.floor(i / COLS) * 64;
    x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(cx + 6, cy + 6, 500, 52);
    x.fillStyle = '#fff'; x.font = 'bold 34px "Share Tech Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(line, cx + 256, cy + 33, 470);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { atlas: { value: tex }, uTime: { value: 0 } },
    vertexShader: `
      attribute float aSlot; attribute vec3 aColor;
      varying vec2 vUv; varying vec3 vCol; varying float vSlot;
      void main() {
        vUv = uv; vCol = aColor; vSlot = aSlot;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D atlas; uniform float uTime;
      varying vec2 vUv; varying vec3 vCol; varying float vSlot;
      void main() {
        float col = mod(vSlot, ${COLS}.0), row = floor(vSlot / ${COLS}.0);
        vec2 a = vec2((vUv.x + col) / ${COLS}.0, 1.0 - (row + 1.0 - vUv.y) / ${ROWS}.0);
        float t = texture2D(atlas, a).r;
        float scan = 0.75 + 0.25 * sin(vUv.y * 90.0 - uTime * 6.0);
        float flick = 0.85 + 0.15 * step(0.5, fract(sin(floor(uTime * 12.0) + vSlot) * 43758.5));
        float edge = 0.12 * (1.0 - smoothstep(0.0, 0.5, abs(vUv.y - 0.5)));
        gl_FragColor = vec4(vCol * (t * 1.6 + edge) * scan * flick, 1.0);
      }`,
  });
  return mat;
}

/** An instanced set of billboards: [spots] are {x, y, z, angle, w}. */
export function holoBoards(spots: { x: number; y: number; z: number; angle: number; w: number }[], seed: (i: number) => number) {
  const geo = new THREE.PlaneGeometry(1, 0.22);
  const slots = new Float32Array(spots.length), colors = new Float32Array(spots.length * 3);
  const c = new THREE.Color();
  spots.forEach((_, i) => {
    slots[i] = Math.floor(seed(i) * HOLO_LINES.length);
    c.setHex(HOLO_COLORS[Math.floor(seed(i + 99) * HOLO_COLORS.length)]);
    colors.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slots, 1));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
  const im = new THREE.InstancedMesh(geo, holoMaterial(), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((b, i) => im.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q.setFromAxisAngle(up, b.angle), s.set(b.w, b.w, 1))));
  im.computeBoundingSphere();
  im.renderOrder = 2;
  return im;
}
