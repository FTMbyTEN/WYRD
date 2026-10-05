import * as THREE from 'three';

/** Shared uniforms for every facade: how dark it is (0 day .. 1 night) and time, for flickers. */
export const facadeUniforms = {
  uNight: { value: 0 }, uTime: { value: 0 },
  // the sky's colours, for the glass to reflect (set each frame by the world)
  uSkyTop: { value: new THREE.Color(0x6fa0d8) }, uSkyBottom: { value: new THREE.Color(0xf0d8c0) },
};

/**
 * A building material whose windows are drawn by the shader, from the wall's own world position:
 * floors 3.2 m apart, bays every [bay] m, each window framed and set into the wall, a band at each
 * floor, a parapet line at the top. Roofs (faces pointing up) stay plain. At night a hashed share of
 * windows light up warm, a few in cool office white, each switching at its own moment.
 *
 * [glass] turns it into a curtain-wall tower: mostly window, slim mullions, a stronger reflection.
 * Works on instanced meshes (the instance transform is included in the world position).
 */
export function facadeMaterial(opts: { glass?: boolean; bay?: number; tint?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.glass ? 0.12 : 0.85,
    metalness: opts.glass ? 0.6 : 0.0,
    envMapIntensity: opts.glass ? 1.4 : 0.5,
  });
  const bay = (opts.bay ?? 2.3).toFixed(2);
  const glass = opts.glass ? '1.0' : '0.0';
  const tint = new THREE.Color(opts.tint ?? 0x3a4a5c);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = facadeUniforms.uNight;
    shader.uniforms.uTime = facadeUniforms.uTime;
    shader.uniforms.uTint = { value: tint };
    shader.uniforms.uSkyTop = facadeUniforms.uSkyTop;
    shader.uniforms.uSkyBottom = facadeUniforms.uSkyBottom;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;\nvarying vec2 vStyle;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vec4 wpF = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           wpF = instanceMatrix * wpF;
         #endif
         vWp = (modelMatrix * wpF).xyz;
         vWn = normalize(mat3(modelMatrix) * objectNormal);
         vStyle = uv; // per building: x = its type (city tiles), y = a seed`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp; varying vec3 vWn; varying vec2 vStyle;
        uniform float uNight; uniform float uTime; uniform vec3 uTint; uniform vec3 uSkyTop; uniform vec3 uSkyBottom;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float isWall = 1.0 - step(0.6, abs(vWn.y));
         // where on the facade: along the wall, and up it
         // measured along the wall's own direction, so windows sit right on walls at any angle
         vec2 tdir = normalize(vec2(-vWn.z, vWn.x) + vec2(1e-5));
         float along = dot(vWp.xz, tdir);
         // the building's type and seed (city tiles set them; other meshes read as a painted house)
         // 0 painted shop-house, 1 bungalow, 2 unfinished block, 3 office, 4 tiled front
         // city tiles pack the type and the building's height: x = type + 10 * height (m)
         float styleId = mod(floor(vStyle.x + 0.5), 10.0);
         float Hb = floor((vStyle.x + 0.5) / 10.0);
         float seed = fract(vStyle.y);
         float isRaw = step(1.5, styleId) * step(styleId, 2.5);
         float isOffice = step(2.5, styleId) * step(styleId, 3.5);
         float isTiled = step(3.5, styleId) * step(styleId, 4.5);
         float isRes = step(4.5, styleId) * step(styleId, 5.5); // white residential towers, balconies on every floor
         float isTerra = step(5.5, styleId) * step(styleId, 6.5); // terracotta concrete (NECOM House)
         float floorH = mix(2.9, 3.45, seed);
         float bayW = mix(${bay} * 0.85, ${bay} * 1.35, fract(seed * 7.3));
         float fy = vWp.y / floorH, fx = along / bayW;
         vec2 cell = vec2(floor(fx), floor(fy));
         vec2 f = fract(vec2(fx, fy));
         float glass = ${glass};
         // the window opening (a curtain wall is nearly all window)
         vec2 lo = mix(vec2(0.18 + 0.1 * fract(seed * 3.1), 0.3), vec2(0.04, 0.06), glass);
         vec2 hi = mix(vec2(0.82 - 0.1 * fract(seed * 3.1), 0.84), vec2(0.96, 0.94), glass);
         lo = mix(lo, vec2(-0.01, 0.32), isOffice); hi = mix(hi, vec2(1.01, 0.82), isOffice); // ribbon windows
         // towers (over ~14 m) each take one of four architectures: a glass curtain wall with fins,
         // ribbon windows, a diagrid steel exoskeleton, or an LED media facade
         float isTower = step(14.0, Hb);
         float arch = floor(fract(seed * 23.1) * 4.0);
         float glassTower = isTower * (1.0 - isRes) * (1.0 - isTerra);
         float aCurtain = glassTower * (1.0 - step(0.5, arch));
         float aRibbon = glassTower * step(0.5, arch) * (1.0 - step(1.5, arch));
         float aDiagrid = glassTower * step(1.5, arch) * (1.0 - step(2.5, arch));
         float aMedia = glassTower * step(2.5, arch) * step(0.6, fract(seed * 7.7)); // media facades on some
         lo = mix(lo, vec2(0.04, 0.06), aCurtain + aDiagrid); hi = mix(hi, vec2(0.96, 0.95), aCurtain + aDiagrid);
         lo = mix(lo, vec2(-0.01, 0.4), aRibbon); hi = mix(hi, vec2(1.01, 0.88), aRibbon);
         // residential: wide windows to the balconies; terracotta: tall narrow slits
         lo = mix(lo, vec2(0.12, 0.3), isRes); hi = mix(hi, vec2(0.88, 0.92), isRes);
         lo = mix(lo, vec2(0.38, 0.18), isTerra); hi = mix(hi, vec2(0.62, 0.86), isTerra);
         float win = step(lo.x, f.x) * step(f.x, hi.x) * step(lo.y, f.y) * step(f.y, hi.y);
         // the ground floor of a painted building is shops, not windows (glass towers keep their lobby glass)
         float shopFloor = (1.0 - glass) * isWall * (1.0 - step(3.2, vWp.y));
         win *= step(1.0, vWp.y - 0.4) * isWall * (1.0 - shopFloor);
         // the frame round each window, a sill, and a band at every floor
         float frame = isWall * (1.0 - win) * step(lo.x - 0.05, f.x) * step(f.x, hi.x + 0.05) * step(lo.y - 0.05, f.y) * step(f.y, hi.y + 0.05);
         float band = isWall * (1.0 - glass) * step(0.96, f.y);
         float h = hash(cell + floor(vWp.x * 0.01) * 7.3 + floor(vWp.z * 0.01) * 3.1);
         // by day: dark glass with a hint of sky; some windows open (darker), some with curtains
         vec3 day = mix(uTint * 0.55, uTint, h) * mix(1.0, 1.15, glass);
         day = mix(day, vec3(0.2, 0.32, 0.36) * (0.8 + 0.4 * h), isOffice); // tinted office glass
         // tower glass, one tint per tower: teal, bronze, blue, near-black or green
         float gt = fract(seed * 3.9);
         vec3 tg = vec3(0.04, 0.13, 0.15);
         tg = mix(tg, vec3(0.16, 0.1, 0.05), step(0.2, gt));
         tg = mix(tg, vec3(0.04, 0.07, 0.17), step(0.4, gt));
         tg = mix(tg, vec3(0.03, 0.035, 0.04), step(0.6, gt));
         tg = mix(tg, vec3(0.05, 0.12, 0.08), step(0.8, gt));
         day = mix(day, tg * (0.85 + 0.3 * h), glassTower);
         // louvre blades (most Lagos houses) or a casement's cross, by building
         float louvre = step(0.5, fract(seed * 5.7)) * (1.0 - isOffice) * (1.0 - isRaw);
         day *= 1.0 - louvre * 0.35 * step(0.5, fract(f.y * 14.0));
         float cross = (1.0 - louvre) * (1.0 - isOffice) * (1.0 - isRaw) * max(step(abs(f.x - 0.5), 0.015), step(abs(f.y - 0.55), 0.015));
         day = mix(day, vec3(0.8), cross * 0.8);
         day = mix(day, vec3(0.03), isRaw * step(0.4, h)); // unfinished: empty dark openings
         // by night: a share of windows lit warm, a few cool white; each switches at its own moment
         // towers: scattered lit floors against dark glass, the way real towers look at night
         float lit = step(0.42 - 0.12 * glass + 0.26 * isTower, h) * step(0.5, fract(h * 13.7 + floor(uTime / 40.0 + h * 9.0) * 0.37));
         vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.85, 0.92, 1.0), step(0.85, fract(h * 7.1)));
         warm = mix(warm, vec3(0.3, 0.95, 1.0), step(0.72, fract(h * 3.3))); // and the cyan glow of screens
         vec3 night = mix(mix(uTint * 0.12, tg * 0.5, isTower), warm * mix(1.4, 0.8, isTower), lit);
         vec3 winCol = mix(day, night, uNight);
         // weathering (painted walls only): sun-faded paint varying wall to wall, grime rising from
         // the street, and rain streaks running down from under each window
         float wall = isWall * (1.0 - glass) * (1.0 - win);
         float panel = hash(floor(vec2(along * 0.25, vWp.y * 0.3)));
         float grime = (1.0 - smoothstep(0.0, 2.4, vWp.y)) * 0.32;
         float streak = step(lo.x + 0.08, f.x) * step(f.x, hi.x - 0.08) * step(f.y, lo.y) * (0.5 + 0.5 * hash(cell + 3.7)) * 0.22;
         float drips = smoothstep(0.85, 1.0, hash(vec2(floor(along * 3.0), floor(vWp.y * 0.15)))) * 0.12;
         diffuseColor.rgb *= 1.0 - wall * (grime + streak + drips + (panel - 0.5) * 0.08);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), wall * 0.12); // faded
         // unfinished block: courses of grey blockwork, no paint
         float course = step(0.92, fract(vWp.y * 5.0)) + step(0.96, fract(along * 2.2 + floor(vWp.y * 5.0) * 0.5));
         diffuseColor.rgb *= 1.0 - wall * isRaw * min(1.0, course) * 0.22;
         // tiled fronts: a grid of small glazed tiles
         float tile = step(0.9, fract(vWp.y * 3.3)) + step(0.9, fract(along * 3.3));
         diffuseColor.rgb *= 1.0 - wall * isTiled * min(1.0, tile) * 0.18;
         // balconies on some houses: a slab edge and a railing across each upper floor
         float balc = max(step(0.55, fract(seed * 9.1)) * (1.0 - isOffice) * (1.0 - isRaw) * (1.0 - isTower), isRes) * isWall * step(7.0 * isRes + 3.2 * (1.0 - isRes), vWp.y);
         float balcSlab = step(f.y, 0.06);
         float rail = step(0.06, f.y) * step(f.y, 0.3) * step(0.75, fract(along * 4.0));
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, balc * balcSlab);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12), balc * rail * (1.0 - win));
         diffuseColor.rgb = mix(diffuseColor.rgb, winCol, win);
         diffuseColor.rgb *= 1.0 - 0.28 * frame - 0.18 * band;
         gWin = win * isWall * (0.5 + 0.5 * max(isTower, glass));
         // a tower's spandrels and frame: dark metal, tinted like its glass
         diffuseColor.rgb = mix(diffuseColor.rgb, tg * 2.2 + 0.08, glassTower * isWall * (1.0 - win) * 0.35); // glass towers: the vertex colour (their glass tone) shows through
         // curtain walls: slim vertical fins catching the light
         float fin = aCurtain * isWall * step(3.2, vWp.y) * step(0.9, fract(along / 1.6));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.65, 0.7), fin);
         // diagrid: a steel lattice of diagonals across the whole facade
         float dg = aDiagrid * isWall * step(3.2, vWp.y) * max(step(fract((along + vWp.y) / 13.0), 0.03), step(fract((along - vWp.y) / 13.0), 0.03));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.21, 0.24), dg);
         gWin *= (1.0 - fin) * (1.0 - dg);
         // ---- Ojuelegba street level: every bay a shop -- a rolling shutter (half of them up, the shop
         // open and dark inside), a painted signboard above it, a darker painted skirting below ----
         float shopH = hash(vec2(floor(along / 3.1), floor(vWp.x * 0.02 + vWp.z * 0.013)));
         float bayF = fract(along / 3.1);
         float opening = step(0.06, bayF) * step(bayF, 0.94) * step(0.15, vWp.y) * step(vWp.y, 2.45);
         float open = step(0.55, shopH);
         vec3 shutter = mix(vec3(0.55, 0.58, 0.6), vec3(0.24, 0.36, 0.52), step(0.3, fract(shopH * 5.3))) * (0.82 + 0.18 * step(0.5, fract(vWp.y * 9.0)));
         vec3 inside = vec3(0.07, 0.06, 0.05) + vec3(0.9, 0.7, 0.4) * uNight * 0.6 * step(0.7, fract(shopH * 3.1));
         vec3 shopCol = mix(shutter, inside, open);
         // a tower's ground floor is its lobby: tall glass, lit warm inside
         vec3 lobby = mix(vec3(0.05, 0.08, 0.1), vec3(1.0, 0.84, 0.6), 0.25 + 0.6 * uNight) * (0.85 + 0.15 * step(0.08, fract(along / 2.0)));
         shopCol = mix(shopCol, lobby, isTower);
         vWinGlow += isTower * shopFloor * opening * (0.15 + 0.6 * uNight);
         // signboards: the bright red, blue, yellow and green of Lagos shop signs, with a pale lettering band
         float sign = step(2.55, vWp.y) * step(vWp.y, 3.15) * step(0.03, bayF) * step(bayF, 0.97) * (1.0 - isTower);
         vec3 signCol = vec3(0.82, 0.16, 0.12);
         float sh = fract(shopH * 11.7);
         signCol = mix(signCol, vec3(0.12, 0.27, 0.72), step(0.3, sh));
         signCol = mix(signCol, vec3(0.95, 0.78, 0.1), step(0.55, sh));
         signCol = mix(signCol, vec3(0.1, 0.52, 0.28), step(0.78, sh));
         signCol = mix(signCol, vec3(0.94, 0.92, 0.86), step(0.42, fract(vWp.y * 3.4)) * step(fract(vWp.y * 3.4), 0.62) * step(0.2, bayF) * step(bayF, 0.8));
         diffuseColor.rgb = mix(diffuseColor.rgb, shopCol, shopFloor * opening);
         diffuseColor.rgb = mix(diffuseColor.rgb, signCol, shopFloor * sign);
         vWinGlow += shopFloor * sign * uNight * step(0.6, fract(shopH * 17.0)) * 0.6; // a few lit signs at night
         float skirting = wall * (1.0 - step(0.55, vWp.y)) * (1.0 - opening * shopFloor);
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.5, 0.48), skirting);
         // ---- roofs: rusted corrugated zinc on low buildings, a grey concrete slab on taller ones ----
         float roof = (1.0 - isWall) * step(0.6, vWn.y);
         float low = 1.0 - step(7.5, vWp.y);
         float ridge = 1.0 - 0.2 * (0.5 + 0.5 * sin(vWp.x * 14.0)) * clamp(1.0 - fwidth(vWp.x * 14.0) * 0.5, 0.0, 1.0); // fades out where it would shimmer
         float rust = hash(floor(vWp.xz * 0.12)); // ~8 m patches: one roof, one colour, mostly
         vec3 zinc = mix(vec3(0.11, 0.055, 0.03), vec3(0.16, 0.16, 0.155), step(0.75, rust)) * ridge * (0.9 + 0.2 * hash(floor(vWp.xz * 1.2)));
         vec3 slab = vec3(0.15, 0.145, 0.14) * (0.85 + 0.3 * hash(floor(vWp.xz * 0.3))); // weathered concrete
         diffuseColor.rgb = mix(diffuseColor.rgb, mix(slab, zinc, low), roof);
         // burglar-proof bars across the lower windows of painted buildings
         float bars = win * (1.0 - glass) * step(vWp.y, 7.0) * step(0.86, fract(f.x * 6.0));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12), bars);
         vWinGlow += win * lit * uNight * mix(1.0, 0.45, isTower);

         // ---- NAIJA 2099: neon over the real city ----
         // each building wears one neon colour: danfo yellow, cyan, magenta, Lagos green or cobalt
         float nc = fract(seed * 17.3);
         vec3 neonC = vec3(1.0, 0.75, 0.0);
         neonC = mix(neonC, vec3(0.0, 0.9, 1.0), step(0.3, nc));
         neonC = mix(neonC, vec3(1.0, 0.15, 0.8), step(0.52, nc));
         neonC = mix(neonC, vec3(0.1, 1.0, 0.55), step(0.72, nc));
         neonC = mix(neonC, vec3(0.25, 0.4, 1.0), step(0.88, nc));
         float glowK = 0.55 + 1.7 * uNight;
         float hasNeon = step(1.0, Hb) * step(0.22, fract(seed * 3.7));
         // a strip under the roofline; on towers, a band every third floor and vertical light lines
         float parapet = isWall * step(Hb - 0.5, vWp.y) * step(vWp.y, Hb - 0.22);
         float tall = step(14.0, Hb);
         float floorLine = isWall * tall * step(0.965, fract(vWp.y / (floorH * 3.0)));
         float vline = isWall * tall * step(0.986, fract(along / 7.0)) * step(4.0, vWp.y);
         float neon = hasNeon * max(parapet, max(floorLine, vline));
         diffuseColor.rgb = mix(diffuseColor.rgb, neonC, neon);
         gNeon += neonC * neon * glowK;
         // LED media facades: an Adinkra-like pattern of light that drifts up the tower
         float mediaZone = aMedia * isWall * step(9.0, vWp.y) * step(vWp.y, Hb - 5.0) * step(0.6, fract(along / 40.0 + seed));
         vec2 px = floor(vec2(along, vWp.y) * 1.6);
         float motifL = step(0.55, sin(px.x * 0.45 + sin(px.y * 0.31 - uTime * 0.8) * 2.0) * cos(px.y * 0.27 - uTime * 0.6));
         float ring2 = step(abs(length(fract(vec2(along, vWp.y - uTime * 1.5) / 6.0) - 0.5) - 0.32), 0.04);
         float led = mediaZone * max(motifL, ring2) * step(0.25, fract((px.x + px.y) * 0.5));
         diffuseColor.rgb = mix(diffuseColor.rgb, neonC * 0.5, led);
         gNeon += neonC * led * (0.6 + 1.4 * uNight);
         gWin *= 1.0 - mediaZone;

         // shop signs are neon
         gNeon += signCol * shopFloor * sign * (0.3 + 1.2 * uNight);
         // tiled fronts become Adire panels: indigo cloth, its pattern glowing
         float adire = isTiled * wall;
         vec2 ap = fract(vec2(along, vWp.y) * 0.7) - 0.5;
         float motif = min(1.0, step(abs(length(ap) - 0.3), 0.025) + step(abs(ap.x), 0.018) * step(abs(ap.y), 0.38) + step(abs(ap.y), 0.018) * step(abs(ap.x), 0.38));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.12, 0.3), adire * 0.85);
         gNeon += vec3(0.25, 0.6, 1.0) * adire * motif * (0.35 + 1.0 * uNight);
         // the grade: walls a little darker and cooler, so the light reads
         diffuseColor.rgb *= mix(1.0, 0.8, isWall * (1.0 - win) * (1.0 - neon));`,
      )
      .replace('#include <common>', '#include <common>\nfloat vWinGlow = 0.0;\nvec3 gNeon = vec3(0.0);\nfloat gWin = 0.0;')
      // windows are glossy
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, gWin);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * vWinGlow * 1.1 + gNeon;
         // glass reflects the sky: stronger at grazing angles (Fresnel), faint at night
         {
           vec3 nV = normalize(normal), vV = normalize(vViewPosition);
           vec3 rV = reflect(-vV, nV);
           vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
           float sky = clamp(dot(rV, upV) * 0.6 + 0.45, 0.0, 1.0);
           float fres = pow(1.0 - clamp(dot(nV, vV), 0.0, 1.0), 3.0);
           totalEmissiveRadiance += mix(uSkyBottom, uSkyTop, sky) * gWin * (0.07 + 0.4 * fres) * (1.0 - uNight * 0.8);
         }`,
      );
  };
  m.customProgramCacheKey = () => `facade-${glass}-${bay}-${tint.getHexString()}`;
  return m;
}
