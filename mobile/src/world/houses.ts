import * as THREE from 'three';

type Box = { x: number; z: number; w: number; d: number; h: number };

// what a Lagos street front says
const SHOPS = ['MAMA PUT', 'BUKA & SUYA', 'POS · TRANSFER', 'PROVISIONS', 'PHARMACY', 'BARBING SALON', 'PHONE ACCESSORIES', 'FASHION HOUSE', 'PURE WATER', 'TAILOR', 'CHEMIST', 'GOD IS GOOD STORES'];
const SIGN_BG = ['#f2c200', '#d9472b', '#2a46ff', '#2f8f5b', '#ffffff', '#16171a'];
const AWNINGS = [0xd9472b, 0x2a46ff, 0x2f8f5b, 0xf2c200, 0x8c2f7a, 0xe07b1f];

/** All the sign boards on one canvas: each building samples its own strip. */
function signAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 64 * SHOPS.length;
  const x = cv.getContext('2d')!;
  SHOPS.forEach((name, i) => {
    const bg = SIGN_BG[i % SIGN_BG.length];
    x.fillStyle = bg; x.fillRect(0, i * 64, 512, 64);
    x.fillStyle = bg === '#16171a' || bg === '#2a46ff' || bg === '#d9472b' || bg === '#2f8f5b' ? '#ffffff' : '#16171a';
    x.font = 'bold 38px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, 256, i * 64 + 33, 480);
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 4; x.strokeRect(2, i * 64 + 2, 508, 60);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The things that make a Lagos street look lived in, added to every low/mid-rise building:
 * a shopfront on its street side (rolled-up shutter, coloured awning, hand-painted sign), balconies
 * with railings on the upper floors, air-conditioner units, and on the lower houses a pitched roof of
 * corrugated iron or painted roofing sheets. Each kind is one instanced mesh (one draw call).
 * [streetSide] gives the outward direction of a building (towards its nearest road).
 */
export function addHouseDetails(scene: THREE.Scene, houses: Box[], streetSide: (b: Box) => { nx: number; nz: number }, shadows: boolean) {
  const r = (() => { let s = 777; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  type Inst = { m: THREE.Matrix4; c?: number };
  const awn: Inst[] = [], shut: Inst[] = [], bal: Inst[] = [], rail: Inst[] = [], ac: Inst[] = [], signs: { m: THREE.Matrix4; row: number }[] = [];
  const roofs: { b: Box; color: number; ridgeAlongX: boolean }[] = [];

  const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0) => {
    // turn to face the street first, then tilt: YXZ order makes rx a tilt about the facade's own axis
    tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, 0, 'YXZ'); tmp.scale.set(sx, sy, sz); tmp.updateMatrix();
    return tmp.matrix.clone();
  };

  houses.forEach((b, i) => {
    const { nx, nz } = streetSide(b);
    // the street face: its centre, its width, and the direction along it
    const faceX = nx !== 0, half = faceX ? b.w / 2 : b.d / 2, width = faceX ? b.d : b.w;
    const fx = b.x + nx * half, fz = b.z + nz * half;
    const ry = faceX ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : (nz > 0 ? 0 : Math.PI);
    const out = (d: number) => [fx + nx * d, fz + nz * d] as const;

    // ground floor: a shop with its shutter rolled up, an awning, and a sign above
    const [sx, sz] = out(0.06);
    shut.push({ m: place(sx, 1.35, sz, width * 0.8, 2.6, 0.1, ry), c: 0x2a2c30 });
    const [ax, az] = out(0.9);
    awn.push({ m: place(ax, 3.0, az, width * 0.86, 0.08, 1.8, ry, 0.22), c: AWNINGS[i % AWNINGS.length] });
    const [gx, gz] = out(0.12);
    signs.push({ m: place(gx, 3.75, gz, Math.min(width * 0.8, 7), 0.9, 1, ry), row: i % SHOPS.length });

    // upper floors: a balcony with a railing on some floors, AC units on the walls
    for (let y = 6.4; y < b.h - 1; y += 3.2) {
      if (r() < 0.55) {
        const bw = Math.min(width * 0.5, 4), [bx, bz] = out(0.6);
        bal.push({ m: place(bx, y - 1.45, bz, faceX ? 1.2 : bw, 0.14, faceX ? bw : 1.2, 0) });
        const [rx, rz] = out(1.18);
        rail.push({ m: place(rx, y - 0.95, rz, faceX ? 0.05 : bw, 0.9, faceX ? bw : 0.05, 0) });
      }
      if (r() < 0.6) {
        const along = (r() - 0.5) * width * 0.7, [cx, cz] = out(0.3);
        ac.push({ m: place(cx + (faceX ? 0 : along), y - 0.6, cz + (faceX ? along : 0), faceX ? 0.55 : 0.85, 0.55, faceX ? 0.85 : 0.55, 0) });
      }
    }
    // low houses: a pitched roof
    if (b.h < 10 && r() < 0.55) roofs.push({ b, color: [0x8a8f96, 0x9a5b3c, 0x2b5d8a, 0x7a2a22][i % 4], ridgeAlongX: b.w > b.d });
  });

  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], cast = true) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); if (it.c != null) mesh.setColorAt(i, col.setHex(it.c)); });
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  inst(box, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), awn);
  // the shutter: corrugated, from a striped texture
  const stripes = document.createElement('canvas');
  stripes.width = 8; stripes.height = 64;
  const sx = stripes.getContext('2d')!;
  for (let y = 0; y < 64; y += 4) { sx.fillStyle = y % 8 ? '#9aa0a8' : '#6b7078'; sx.fillRect(0, y, 8, 4); }
  const stripeTex = new THREE.CanvasTexture(stripes);
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(1, 4);
  inst(box, new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, metalness: 0.4 }), shut.map((s) => ({ m: s.m })), false);
  inst(box, new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 }), bal);
  inst(box, new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.6 }), rail, false);
  inst(box, new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.5 }), ac);

  // signs: each instance picks its row of the atlas
  const atlas = signAtlas();
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const rows = new Float32Array(signs.length);
  signs.forEach((s, i) => { rows[i] = s.row; });
  signGeo.setAttribute('aRow', new THREE.InstancedBufferAttribute(rows, 1));
  const signMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.7, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.12 });
  signMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aRow;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vec2(uv.x, (aRow + 1.0 - uv.y) / ${SHOPS.length.toFixed(1)});\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = vMapUv;\n#endif`);
  };
  signMat.customProgramCacheKey = () => 'shop-signs';
  // the atlas is read top-down (row 0 at the top), matching the rows the shader picks
  atlas.flipY = false;
  const signMesh = new THREE.InstancedMesh(signGeo, signMat, signs.length);
  signs.forEach((s, i) => signMesh.setMatrixAt(i, s.m));
  scene.add(signMesh);

  // pitched roofs: a triangular prism per house, roofing sheet ridges from a striped normal of colour
  const tri = new THREE.Shape();
  tri.moveTo(-0.5, 0); tri.lineTo(0.5, 0); tri.lineTo(0, 0.45); tri.lineTo(-0.5, 0);
  const prism = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
  prism.translate(0, 0, -0.5);
  const roofItems: Inst[] = roofs.map(({ b, color, ridgeAlongX }) => {
    tmp.position.set(b.x, b.h + 0.05, b.z);
    tmp.rotation.set(0, ridgeAlongX ? 0 : Math.PI / 2, 0);
    const span = ridgeAlongX ? b.d : b.w, len = ridgeAlongX ? b.w : b.d;
    tmp.scale.set(span + 0.8, Math.min(span, 9) * 0.55, len + 0.8);
    tmp.rotation.y += Math.PI / 2;
    tmp.updateMatrix();
    return { m: tmp.matrix.clone(), c: color };
  });
  const sheet = document.createElement('canvas');
  sheet.width = 64; sheet.height = 8;
  const shx = sheet.getContext('2d')!;
  for (let x = 0; x < 64; x += 8) { shx.fillStyle = '#ffffff'; shx.fillRect(x, 0, 5, 8); shx.fillStyle = '#c9c9c9'; shx.fillRect(x + 5, 0, 3, 8); }
  const sheetTex = new THREE.CanvasTexture(sheet);
  sheetTex.wrapS = sheetTex.wrapT = THREE.RepeatWrapping;
  sheetTex.repeat.set(6, 1);
  inst(prism, new THREE.MeshStandardMaterial({ color: 0xffffff, map: sheetTex, roughness: 0.55, metalness: 0.45 }), roofItems);
}
