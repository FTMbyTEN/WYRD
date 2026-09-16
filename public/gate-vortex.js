// The gate/login screen's cinematic backdrop — a generative particle structure that morphs
// between 29 curated wireframe-ish forms spanning geometry, physics, the quantum realm, the
// cosmos, nature, the classical elements (fire/water/air), technology, architecture, three real
// mountains (Kilimanjaro/Everest/Fuji), and two takes on WYRD's own likeness (clean and
// dreaming) — plus new shapes WYRD itself authors on a
// live timer via /api/gate-vortex/shape (see fetchShapeFromMind below), all in WYRD's own
// terminal green, plus a dim starfield for depth. Deliberately kept light on pure spirals (one
// galaxy, one black hole, one knot) so the set doesn't read as "everything is a spiral wound
// differently." Same particle-count-preserving morph technique across every shape (curated or
// generated) so a plain per-vertex lerp animates smoothly between any two of them — no
// shape-specific transition logic needed.
(function initGateVortex() {
  const canvas = document.getElementById('gateVortex');
  const gate = document.getElementById('gate');
  if (!canvas || !gate || typeof THREE === 'undefined') return;

  const N = 900; // must be evenly divisible by every ringsCount below
  const GREEN = 0x00ff41;

  function shapeSphere() {
    const arr = new Float32Array(N * 3);
    const R = 2.1;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const yv = 1 - (i / (N - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      arr[i * 3] = Math.cos(theta) * radiusAtY * R;
      arr[i * 3 + 1] = yv * R;
      arr[i * 3 + 2] = Math.sin(theta) * radiusAtY * R;
    }
    return arr;
  }

  function shapeMandala() {
    const ringsCount = 10, perRing = N / ringsCount;
    const arr = new Float32Array(N * 3);
    let idx = 0;
    for (let r = 0; r < ringsCount; r++) {
      const radius = 0.3 + r * 0.22;
      for (let p = 0; p < perRing; p++) {
        const a = (p / perRing) * Math.PI * 2 + r * 0.3;
        arr[idx++] = Math.cos(a) * radius;
        arr[idx++] = Math.sin(a) * radius;
        arr[idx++] = 0;
      }
    }
    return arr;
  }

  // WYRD's own face — reuses the exact 468-point MediaPipe mesh already loaded for the FACE
  // visual (face-mesh-data.js, loaded before this script). N=900 doesn't divide evenly into 468
  // vertices, so points beyond the first pass repeat with a tiny deterministic offset rather than
  // stacking exactly on top of their source point — reads as a slightly denser face, not a glitch.
  function shapeFace() {
    const arr = new Float32Array(N * 3);
    if (typeof FACE_VERTS === 'undefined' || !FACE_VERTS.length) return shapeSphere();
    const total = FACE_VERTS.length;
    const scale = 1.8; // was 2.7 — noticeably larger than every other shape's ~1.5-2.1 footprint
    for (let i = 0; i < N; i++) {
      const v = FACE_VERTS[i % total];
      const pass = Math.floor(i / total);
      const jitter = pass * 0.02;
      arr[i * 3] = v[0] * scale + jitter;
      arr[i * 3 + 1] = v[1] * scale;
      arr[i * 3 + 2] = v[2] * scale;
    }
    return arr;
  }

  // Figure-eight / infinity curve (lemniscate of Bernoulli), with a gentle sinusoidal wobble on
  // the z-axis so it doesn't read as a flat, lifeless ring from every camera angle.
  function shapeInfinity() {
    const arr = new Float32Array(N * 3);
    const a = 2.1;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const denom = 1 + Math.sin(t) * Math.sin(t);
      arr[i * 3] = (a * Math.cos(t)) / denom;
      arr[i * 3 + 1] = (a * Math.sin(t) * Math.cos(t)) / denom;
      arr[i * 3 + 2] = Math.sin(t * 3) * 0.35;
    }
    return arr;
  }

  // ---- A solid heavy-metal chain — real interlocking links, alternating orientation the way an
  // actual chain does (each link a full torus surface, not a thin outline), stacked vertically.
  // Replaces the old coiled "spring"-reading double helix. ----
  function shapeChain() {
    const arr = new Float32Array(N * 3);
    const linkCount = 9;
    const perLink = Math.floor(N / linkCount);
    const majorR = 0.5, minorR = 0.17;
    const majorSteps = Math.max(6, Math.round(Math.sqrt(perLink * 2)));
    const minorSteps = Math.max(4, Math.floor(perLink / majorSteps));
    let idx = 0;
    for (let l = 0; l < linkCount; l++) {
      const t = l / (linkCount - 1);
      const y = -2.3 + t * 4.6;
      const vertical = l % 2 === 0; // alternating plane is what makes it read as interlocked
      let written = 0;
      for (let mi = 0; mi < majorSteps && written < perLink; mi++) {
        const majorAngle = (mi / majorSteps) * Math.PI * 2;
        for (let ni = 0; ni < minorSteps && written < perLink; ni++) {
          const minorAngle = (ni / minorSteps) * Math.PI * 2;
          const ringX = (majorR + minorR * Math.cos(minorAngle)) * Math.cos(majorAngle);
          const ringOffset = minorR * Math.sin(minorAngle);
          const ringZ = (majorR + minorR * Math.cos(minorAngle)) * Math.sin(majorAngle);
          let x, yy, z;
          if (vertical) { x = ringX; yy = y + ringOffset; z = ringZ; }
          else { x = ringOffset; yy = y + ringX; z = ringZ * 0.4; }
          arr[idx * 3] = x; arr[idx * 3 + 1] = yy; arr[idx * 3 + 2] = z;
          idx++; written++;
        }
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = -2.3; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  function shapeTorusKnot() {
    const arr = new Float32Array(N * 3);
    const p = 2, q = 3, R = 1.6, r = 0.6;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      arr[i * 3] = (R + r * Math.cos(q * t)) * Math.cos(p * t) * 1.3;
      arr[i * 3 + 1] = (R + r * Math.cos(q * t)) * Math.sin(p * t) * 0.9 * 1.3;
      arr[i * 3 + 2] = r * Math.sin(q * t) * 1.3;
    }
    return arr;
  }

  function shapeCubeGrid() {
    const arr = new Float32Array(N * 3);
    const S = 1.8;
    const corners = [
      [-S, -S, -S], [S, -S, -S], [S, S, -S], [-S, S, -S],
      [-S, -S, S], [S, -S, S], [S, S, S], [-S, S, S],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const perEdge = Math.floor(N / edges.length);
    let idx = 0;
    for (const [a, b] of edges) {
      for (let p = 0; p < perEdge; p++) {
        const t = p / perEdge;
        arr[idx * 3] = corners[a][0] + (corners[b][0] - corners[a][0]) * t;
        arr[idx * 3 + 1] = corners[a][1] + (corners[b][1] - corners[a][1]) * t;
        arr[idx * 3 + 2] = corners[a][2] + (corners[b][2] - corners[a][2]) * t;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  function shapeGalaxy() {
    const arr = new Float32Array(N * 3);
    const arms = 3;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const arm = i % arms;
      const radius = 0.3 + t * 2.6;
      const angle = t * Math.PI * 6 + arm * (Math.PI * 2 / arms);
      const spread = (Math.sin(i * 12.9898) * 0.5) * 0.25; // deterministic "jitter", no Math.random drift
      arr[i * 3] = Math.cos(angle) * radius + spread;
      arr[i * 3 + 1] = Math.sin(i * 78.233) * 0.15;
      arr[i * 3 + 2] = Math.sin(angle) * radius + spread;
    }
    return arr;
  }

  function shapeWaveGrid() {
    const arr = new Float32Array(N * 3);
    const gridSize = Math.round(Math.sqrt(N));
    let idx = 0;
    for (let gx = 0; gx < gridSize; gx++) {
      for (let gz = 0; gz < gridSize; gz++) {
        if (idx >= N) break;
        const x = (gx / (gridSize - 1) - 0.5) * 4.5;
        const z = (gz / (gridSize - 1) - 0.5) * 4.5;
        const y = Math.sin(x * 1.3) * Math.cos(z * 1.3) * 0.8;
        arr[idx * 3] = x; arr[idx * 3 + 1] = y; arr[idx * 3 + 2] = z;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  function shapeStarBurst() {
    const arr = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const yv = 1 - (i / (N - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const spike = 1 + 0.9 * Math.pow(Math.abs(Math.sin(theta * 5) * Math.cos(yv * 8)), 3);
      const R = 1.7 * spike;
      arr[i * 3] = Math.cos(theta) * radiusAtY * R;
      arr[i * 3 + 1] = yv * R;
      arr[i * 3 + 2] = Math.sin(theta) * radiusAtY * R;
    }
    return arr;
  }

  // ---- Physics: a Bohr-model atom — a tight nucleus cluster plus three electron orbits tilted
  // at different angles around it, the classic textbook icon. ----
  function shapeAtom() {
    const arr = new Float32Array(N * 3);
    const nucleusCount = Math.round(N * 0.08);
    const golden = Math.PI * (3 - Math.sqrt(5));
    let idx = 0;
    for (let i = 0; i < nucleusCount; i++) {
      const yv = 1 - (i / (nucleusCount - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const R = 0.35;
      arr[idx * 3] = Math.cos(theta) * rY * R;
      arr[idx * 3 + 1] = yv * R;
      arr[idx * 3 + 2] = Math.sin(theta) * rY * R;
      idx++;
    }
    const ringsCount = 3, perRing = Math.floor((N - nucleusCount) / ringsCount);
    const tilts = [0, Math.PI / 3, -Math.PI / 3];
    for (let r = 0; r < ringsCount; r++) {
      const R = 2.0, tilt = tilts[r], rotY = r * (Math.PI / 3);
      for (let p = 0; p < perRing; p++) {
        const a = (p / perRing) * Math.PI * 2;
        const x = Math.cos(a) * R, y = Math.sin(a) * R * 0.4, z = 0;
        const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
        const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
        const x3 = x * Math.cos(rotY) + z2 * Math.sin(rotY);
        const z3 = -x * Math.sin(rotY) + z2 * Math.cos(rotY);
        arr[idx * 3] = x3; arr[idx * 3 + 1] = y2; arr[idx * 3 + 2] = z3;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Quantum realm: a p-orbital — two teardrop lobes on opposite sides of the origin, the
  // shape an electron's probability density actually traces, not a cartoon ball-on-a-wire. ----
  function shapeOrbital() {
    const arr = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const perLobe = N / 2;
    for (let i = 0; i < N; i++) {
      const lobe = i % 2 === 0 ? 1 : -1;
      const u = Math.floor(i / 2);
      const yv = u / (perLobe - 1);
      const theta = golden * i;
      const lobeRadius = Math.sin(yv * Math.PI) * 1.3;
      arr[i * 3] = Math.cos(theta) * lobeRadius;
      arr[i * 3 + 1] = lobe * yv * 2.6;
      arr[i * 3 + 2] = Math.sin(theta) * lobeRadius;
    }
    return arr;
  }

  // ---- Cosmos: Saturn — a planet sphere plus a separately tilted ring disc, the tilt applied
  // as a real rotation (not a squashed ellipse) so it reads correctly from any camera angle. ----
  function shapeSaturn() {
    const arr = new Float32Array(N * 3);
    const planetCount = Math.round(N * 0.45);
    const golden = Math.PI * (3 - Math.sqrt(5));
    let idx = 0;
    for (let i = 0; i < planetCount; i++) {
      const yv = 1 - (i / (planetCount - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const R = 1.1;
      arr[idx * 3] = Math.cos(theta) * rY * R;
      arr[idx * 3 + 1] = yv * R;
      arr[idx * 3 + 2] = Math.sin(theta) * rY * R;
      idx++;
    }
    const tiltAngle = 0.4;
    const ringRemaining = N - planetCount;
    for (let i = 0; i < ringRemaining; i++) {
      const a = (i / ringRemaining) * Math.PI * 2 * 3;
      const r = 1.7 + (i % 60) / 60 * 0.8;
      const x = Math.cos(a) * r;
      const zFlat = Math.sin(a) * r;
      const yFlat = Math.sin(i * 12.9898) * 0.015;
      arr[idx * 3] = x;
      arr[idx * 3 + 1] = yFlat * Math.cos(tiltAngle) - zFlat * Math.sin(tiltAngle);
      arr[idx * 3 + 2] = yFlat * Math.sin(tiltAngle) + zFlat * Math.cos(tiltAngle);
      idx++;
    }
    return arr;
  }

  // ---- Cosmos/physics: a black hole's accretion disk — points thin out with distance and wind
  // into a tight multi-wrap spiral near the center, with a small vertical flare simulating
  // gravitational lensing bending light around the event horizon. ----
  function shapeBlackHole() {
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const r = 0.35 + Math.pow(t, 1.8) * 2.7;
      const a = t * Math.PI * 2 * 8 + r * 0.6;
      const lensing = Math.exp(-r * 1.3) * 0.85 * (i % 2 === 0 ? 1 : -1);
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = Math.sin(i * 53.123) * 0.03 * r + lensing;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    return arr;
  }

  // ---- WYRD's face, dreaming — the same real 468-point mesh as shapeFace() above, but warped
  // by a standing wave across the surface instead of rendered clean. Reads as the face mid-morph,
  // unsettled/glitching, which fits a login gate that's meant to feel alive rather than static —
  // a second, genuinely different take on the same identity rather than a duplicate of shapeFace.
  function shapeFaceDream() {
    const arr = new Float32Array(N * 3);
    if (typeof FACE_VERTS === 'undefined' || !FACE_VERTS.length) return shapeSphere();
    const total = FACE_VERTS.length;
    const scale = 1.8; // matches shapeFace()'s corrected scale
    for (let i = 0; i < N; i++) {
      const v = FACE_VERTS[i % total];
      const pass = Math.floor(i / total);
      const wobbleX = Math.sin(v[1] * 4 + pass * 0.6) * 0.18;
      const wobbleY = Math.cos(v[0] * 5 + pass * 0.4) * 0.12;
      arr[i * 3] = v[0] * scale + wobbleX;
      arr[i * 3 + 1] = v[1] * scale + wobbleY;
      arr[i * 3 + 2] = v[2] * scale;
    }
    return arr;
  }

  // ---- Buildings: a city skyline — a grid of vertical columns with deterministic pseudo-random
  // heights (seeded off each column's grid position, not Math.random, so it's identical every
  // time this shape is generated rather than reshuffling on every page load). ----
  function shapeCityscape() {
    const arr = new Float32Array(N * 3);
    const gridX = 10, gridZ = 6;
    const perBuilding = Math.floor(N / (gridX * gridZ));
    let idx = 0;
    for (let bx = 0; bx < gridX; bx++) {
      for (let bz = 0; bz < gridZ; bz++) {
        const seed = bx * 31 + bz * 17;
        const height = 0.6 + (Math.sin(seed * 12.9898) * 0.5 + 0.5) * 3.2;
        const x = (bx / (gridX - 1) - 0.5) * 5.5;
        const z = (bz / (gridZ - 1) - 0.5) * 3.5;
        for (let p = 0; p < perBuilding; p++) {
          const t = p / perBuilding;
          arr[idx * 3] = x; arr[idx * 3 + 1] = -2.2 + height * t; arr[idx * 3 + 2] = z;
          idx++;
        }
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = -2.2; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Buildings/architecture: a pyramid — four apex-to-base edges plus the square base,
  // walked the same way as the cube lattice above. ----
  function shapePyramid() {
    const arr = new Float32Array(N * 3);
    const apex = [0, 2.2, 0], S = 1.9;
    const base = [[-S, -1.4, -S], [S, -1.4, -S], [S, -1.4, S], [-S, -1.4, S]];
    const edges = [
      [apex, base[0]], [apex, base[1]], [apex, base[2]], [apex, base[3]],
      [base[0], base[1]], [base[1], base[2]], [base[2], base[3]], [base[3], base[0]],
    ];
    const perEdge = Math.floor(N / edges.length);
    let idx = 0;
    for (const [a, b] of edges) {
      for (let p = 0; p < perEdge; p++) {
        const t = p / perEdge;
        arr[idx * 3] = a[0] + (b[0] - a[0]) * t;
        arr[idx * 3 + 1] = a[1] + (b[1] - a[1]) * t;
        arr[idx * 3 + 2] = a[2] + (b[2] - a[2]) * t;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = -1.4; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Real mountains — one shared ridge-generator (ring-stacking, same idea as the vortex/
  // funnel shapes, with the radius per ring perturbed by layered sine "noise" for rock ridges)
  // reused for three actual peaks, each tuned to its real silhouette rather than being the same
  // cone three times: Kilimanjaro's wide, gently domed volcanic plateau; Everest's sharp, jagged,
  // asymmetric summit; Fuji's smooth, famously symmetric cone. ----
  function buildMountain({ ringsCount, baseRadius, height, ruggedness, peakFlatten, asymmetry }) {
    const arr = new Float32Array(N * 3);
    const perRing = Math.floor(N / ringsCount);
    let idx = 0;
    for (let r = 0; r < ringsCount; r++) {
      const t = r / (ringsCount - 1);
      const y = -1.8 + t * height;
      const taper = Math.pow(1 - t, 0.7 + peakFlatten);
      const baseR = baseRadius * taper;
      for (let p = 0; p < perRing; p++) {
        const angle = (p / perRing) * Math.PI * 2;
        const ridgeNoise = 1 + ruggedness * (Math.sin(angle * 5 + t * 7) * 0.5 + Math.sin(angle * 11 + t * 3) * 0.3) * (1 - t * 0.4);
        const asym = 1 + asymmetry * Math.sin(angle + t * 2);
        const radius = Math.max(0.02, baseR * ridgeNoise * asym);
        arr[idx * 3] = Math.cos(angle) * radius;
        arr[idx * 3 + 1] = y;
        arr[idx * 3 + 2] = Math.sin(angle) * radius;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = -1.8; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }
  function shapeKilimanjaro() {
    return buildMountain({ ringsCount: 22, baseRadius: 2.1, height: 4.0, ruggedness: 0.22, peakFlatten: 0.6, asymmetry: 0.15 });
  }
  function shapeEverest() {
    return buildMountain({ ringsCount: 24, baseRadius: 1.7, height: 4.6, ruggedness: 0.45, peakFlatten: -0.3, asymmetry: 0.35 });
  }
  function shapeFuji() {
    return buildMountain({ ringsCount: 22, baseRadius: 2.0, height: 3.6, ruggedness: 0.08, peakFlatten: 0.15, asymmetry: 0.03 });
  }

  // ---- Möbius strip: a one-sided surface — the classic topology demo. ----
  function shapeMobius() {
    const arr = new Float32Array(N * 3);
    const R = 1.7;
    for (let i = 0; i < N; i++) {
      const u = (i / N) * Math.PI * 2;
      const vBand = i % 7;
      const v = (vBand / 6 - 0.5) * 0.9;
      const halfTwist = u / 2;
      arr[i * 3] = (R + v * Math.cos(halfTwist)) * Math.cos(u);
      arr[i * 3 + 1] = (R + v * Math.cos(halfTwist)) * Math.sin(u);
      arr[i * 3 + 2] = v * Math.sin(halfTwist);
    }
    return arr;
  }

  // ---- Tesseract: a 4D hypercube's 16 vertices and 32 edges, rotated in two 4D planes (fixed
  // angles, baked in at generation time) before being perspective-projected down to 3D — the
  // rotation is what keeps it from looking like a boring symmetric double-cube outline. ----
  function shapeTesseract() {
    const arr = new Float32Array(N * 3);
    const verts4 = [];
    for (let i = 0; i < 16; i++) verts4.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
    const a1 = 0.6, a2 = 0.4;
    const proj = verts4.map(([x, y, z, w]) => {
      const x1 = x * Math.cos(a1) - w * Math.sin(a1);
      const w1 = x * Math.sin(a1) + w * Math.cos(a1);
      const y1 = y * Math.cos(a2) - z * Math.sin(a2);
      const z1 = y * Math.sin(a2) + z * Math.cos(a2);
      const dist = 3, scale = dist / (dist - w1);
      return [x1 * scale, y1 * scale, z1 * scale];
    });
    const edges = [];
    for (let i = 0; i < 16; i++) for (let bit = 0; bit < 4; bit++) { const j = i ^ (1 << bit); if (j > i) edges.push([i, j]); }
    const perEdge = Math.floor(N / edges.length);
    let idx = 0;
    for (const [a, b] of edges) {
      const pa = proj[a], pb = proj[b];
      for (let p = 0; p < perEdge; p++) {
        const t = p / perEdge;
        arr[idx * 3] = (pa[0] + (pb[0] - pa[0]) * t) * 1.5;
        arr[idx * 3 + 1] = (pa[1] + (pb[1] - pa[1]) * t) * 1.5;
        arr[idx * 3 + 2] = (pa[2] + (pb[2] - pa[2]) * t) * 1.5;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- A feedforward neural network diagram — small node clusters at each layer, fully
  // connected to the next layer by point-traced edges. Deliberately on-theme: this is what WYRD
  // itself is loosely modeled on. ----
  function shapeNeuralNetwork() {
    const arr = new Float32Array(N * 3);
    const layers = [4, 6, 6, 4, 2];
    const layerX = layers.map((_, li) => -2.2 + li * (4.4 / (layers.length - 1)));
    const nodePositions = [];
    layers.forEach((count, li) => {
      for (let n = 0; n < count; n++) nodePositions.push([layerX[li], (n - (count - 1) / 2) * 0.55, 0]);
    });
    const edges = [];
    let offset = 0;
    for (let li = 0; li < layers.length - 1; li++) {
      for (let a = 0; a < layers[li]; a++) for (let b = 0; b < layers[li + 1]; b++) edges.push([offset + a, offset + layers[li] + b]);
      offset += layers[li];
    }
    const golden = Math.PI * (3 - Math.sqrt(5));
    const nodeClusterSize = 6;
    let idx = 0;
    for (const pos of nodePositions) {
      for (let i = 0; i < nodeClusterSize; i++) {
        const yv = 1 - (i / (nodeClusterSize - 1)) * 2;
        const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
        const theta = golden * i;
        const R = 0.13;
        arr[idx * 3] = pos[0] + Math.cos(theta) * rY * R;
        arr[idx * 3 + 1] = pos[1] + yv * R;
        arr[idx * 3 + 2] = pos[2] + Math.sin(theta) * rY * R;
        idx++;
      }
    }
    const perEdge = Math.max(2, Math.floor((N - idx) / edges.length));
    for (const [a, b] of edges) {
      const pa = nodePositions[a], pb = nodePositions[b];
      for (let p = 0; p < perEdge && idx < N; p++) {
        const t = p / perEdge;
        arr[idx * 3] = pa[0] + (pb[0] - pa[0]) * t;
        arr[idx * 3 + 1] = pa[1] + (pb[1] - pa[1]) * t;
        arr[idx * 3 + 2] = pa[2] + (pb[2] - pa[2]) * t;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Nature: a recursive binary branching tree, point-budget per segment weighted by its
  // length so the trunk reads solid and the twigs read thin. ----
  function shapeFractalTree() {
    const arr = new Float32Array(N * 3);
    const segments = [];
    function branch(x, y, z, angle, length, depth) {
      if (depth === 0 || length < 0.05) return;
      const x2 = x + Math.sin(angle) * length;
      const y2 = y + Math.cos(angle) * length;
      const z2 = z + Math.sin(depth * 1.7) * 0.15;
      segments.push({ from: [x, y, z], to: [x2, y2, z2], length });
      branch(x2, y2, z2, angle - 0.45 + Math.sin(depth) * 0.1, length * 0.72, depth - 1);
      branch(x2, y2, z2, angle + 0.45 - Math.sin(depth) * 0.1, length * 0.72, depth - 1);
    }
    branch(0, -2.6, 0, 0, 1.6, 7);
    const totalLength = segments.reduce((s, seg) => s + seg.length, 0);
    let idx = 0;
    for (const seg of segments) {
      const budget = Math.max(2, Math.round((seg.length / totalLength) * N));
      for (let p = 0; p < budget && idx < N; p++) {
        const t = p / budget;
        arr[idx * 3] = seg.from[0] + (seg.to[0] - seg.from[0]) * t;
        arr[idx * 3 + 1] = seg.from[1] + (seg.to[1] - seg.from[1]) * t;
        arr[idx * 3 + 2] = seg.from[2] + (seg.to[2] - seg.from[2]) * t;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = -2.6; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Nature/math: a nautilus shell — a logarithmic (golden) spiral winding outward with a
  // slight vertical rise so it reads as a real 3D coil instead of a flat spiral. ----
  // ---- An atomic explosion — a dense core plus a jagged, uneven shockwave of debris flung
  // outward at varying distances (not a clean sphere), so it reads as a blast, not a starburst. ----
  function shapeExplosion() {
    const arr = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const coreCount = Math.round(N * 0.1);
    let idx = 0;
    for (let i = 0; i < coreCount; i++) {
      const yv = 1 - (i / (coreCount - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const R = 0.25;
      arr[idx * 3] = Math.cos(theta) * rY * R; arr[idx * 3 + 1] = yv * R; arr[idx * 3 + 2] = Math.sin(theta) * rY * R;
      idx++;
    }
    const rayCount = N - coreCount;
    for (let i = 0; i < rayCount; i++) {
      const yv = 1 - (i / (rayCount - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const jag = 0.6 + 0.4 * Math.abs(Math.sin(theta * 7 + yv * 5));
      const R = 2.6 * jag;
      arr[idx * 3] = Math.cos(theta) * rY * R; arr[idx * 3 + 1] = yv * R; arr[idx * 3 + 2] = Math.sin(theta) * rY * R;
      idx++;
    }
    return arr;
  }

  // ---- Fire — several tapering flame tongues arranged around a base ring, each swaying more
  // as it rises, narrowing to nothing near the tip. ----
  function shapeFire() {
    const arr = new Float32Array(N * 3);
    const tongues = 7;
    const perTongue = Math.floor(N / tongues);
    let idx = 0;
    for (let f = 0; f < tongues; f++) {
      const baseAngle = (f / tongues) * Math.PI * 2;
      for (let p = 0; p < perTongue; p++) {
        const t = p / perTongue;
        const height = -2.2 + t * 4.6;
        const sway = Math.sin(t * Math.PI * 2.2 + f * 1.3) * 0.35 * t;
        const r = 0.9 * (1 - t * 0.7);
        const angle = baseAngle + sway * 0.4;
        arr[idx * 3] = Math.cos(angle) * r + sway;
        arr[idx * 3 + 1] = height;
        arr[idx * 3 + 2] = Math.sin(angle) * r;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = -2.2; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Water — a single droplet: a surface of revolution with a rounded belly tapering to a
  // point, not a spiral or a lobe pair. ----
  function shapeWaterDrop() {
    const arr = new Float32Array(N * 3);
    const ringsCount = 24, perRing = Math.floor(N / ringsCount);
    let idx = 0;
    for (let r = 0; r < ringsCount; r++) {
      const t = r / (ringsCount - 1);
      const y = -1.6 + t * 3.4;
      const radius = 1.5 * Math.sin(Math.PI * t * 0.85) * (1 - t * 0.3);
      for (let p = 0; p < perRing; p++) {
        const a = (p / perRing) * Math.PI * 2;
        arr[idx * 3] = Math.cos(a) * radius; arr[idx * 3 + 1] = y; arr[idx * 3 + 2] = Math.sin(a) * radius;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 1.8; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Air — parallel wavy streamlines sweeping across at different heights, like visualized
  // wind gusts, not a wound curve. ----
  function shapeWindStreams() {
    const arr = new Float32Array(N * 3);
    const streams = 9;
    const perStream = Math.floor(N / streams);
    let idx = 0;
    for (let s = 0; s < streams; s++) {
      const yBase = -2 + (s / (streams - 1)) * 4;
      const phase = s * 0.9;
      for (let p = 0; p < perStream; p++) {
        const t = p / perStream;
        arr[idx * 3] = (t - 0.5) * 5.2;
        arr[idx * 3 + 1] = yBase + Math.sin(t * Math.PI * 3 + phase) * 0.35;
        arr[idx * 3 + 2] = Math.cos(t * Math.PI * 2 + phase) * 0.4;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // ---- Technology — a CPU/circuit board: a square outline plus Manhattan-routed (right-angle)
  // internal traces, deliberately blocky and geometric, the opposite of every curved shape here. ----
  function shapeCircuit() {
    const arr = new Float32Array(N * 3);
    const S = 2.0;
    const segments = [
      [[-S, -S, 0], [S, -S, 0]], [[S, -S, 0], [S, S, 0]], [[S, S, 0], [-S, S, 0]], [[-S, S, 0], [-S, -S, 0]],
    ];
    const lines = 5;
    for (let i = 1; i < lines; i++) {
      const p = -S + (i / lines) * 2 * S;
      if (i % 2 === 0) segments.push([[p, -S * 0.6, 0], [p, S * 0.6, 0]]);
      else segments.push([[-S * 0.6, p, 0], [S * 0.6, p, 0]]);
    }
    const perSeg = Math.floor(N / segments.length);
    let idx = 0;
    for (const [a, b] of segments) {
      for (let p = 0; p < perSeg; p++) {
        const t = p / perSeg;
        arr[idx * 3] = a[0] + (b[0] - a[0]) * t;
        arr[idx * 3 + 1] = a[1] + (b[1] - a[1]) * t;
        arr[idx * 3 + 2] = a[2] + (b[2] - a[2]) * t;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  const faceArr = shapeFace();
  const faceDreamArr = shapeFaceDream();
  const shapes = [
    shapeSphere(), shapeMandala(), faceArr, shapeInfinity(),
    shapeChain(), shapeTorusKnot(), shapeCubeGrid(), shapeGalaxy(), shapeWaveGrid(), shapeStarBurst(),
    shapeAtom(), shapeOrbital(), shapeSaturn(), shapeBlackHole(), faceDreamArr, shapeCityscape(), shapePyramid(),
    shapeMobius(), shapeTesseract(), shapeNeuralNetwork(), shapeFractalTree(),
    shapeExplosion(), shapeFire(), shapeWaterDrop(), shapeWindStreams(), shapeCircuit(),
    shapeKilimanjaro(), shapeEverest(), shapeFuji(),
  ];
  // WYRD's two face variants get a distinctly more "alive" tracking behavior in animate() below —
  // by reference, not by index, so this stays correct no matter how the array above is reordered.
  const faceShapeIndices = new Set([shapes.indexOf(faceArr), shapes.indexOf(faceDreamArr)]);
  const curatedShapeCount = shapes.length; // generative shapes (added later, from WYRD's mind) get
                                            // appended after this point and capped separately

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 7.5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const group = new THREE.Group();
  scene.add(group);

  const positions = new Float32Array(shapes[0]); // the live, mutated buffer
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: GREEN, size: 0.05, sizeAttenuation: true,
    transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  group.add(new THREE.Points(geo, mat));

  // sparse, dim, static starfield for cosmic depth — never morphs, barely moves
  const STAR_COUNT = 300;
  const starPositions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 6 + Math.random() * 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: GREEN, size: 0.025, sizeAttenuation: true, transparent: true, opacity: 0.35, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));

  let running = false;
  let shapeIndex = 0;
  let fromArr = shapes[0], toArr = shapes[0];
  let morphStart = 0;
  const MORPH_MS = 1500;
  const HOLD_MS = 4200; // time fully settled on a shape before starting the next morph
  let nextSwitchAt = performance.now() + HOLD_MS;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);

  // ---- Interactivity: mouse parallax (the whole scene tilts toward the cursor, like it's
  // aware of you), a hover-intensify while the ENTER button is moused over, and a one-shot
  // "burst" punch when it's actually clicked. All three are just extra terms added into the
  // same per-frame rotation/scale/opacity math below — no separate render path needed. ----
  let mouseX = 0, mouseY = 0; // normalized -1..1
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  });

  let intensity = 0; // 0..1, eased toward a target — set via setIntensity() on button hover
  let faceFactor = 0; // eases toward 1 whenever a face variant is the current shape — see animate()
  let intensityTarget = 0;

  // Random-next instead of sequential — with 10+ shapes, always going 0→1→2→3→... in the same
  // order reads as mechanical after the first lap. A different shape each time (never repeating
  // the current one back-to-back) keeps it feeling alive instead of on a predictable loop.
  function pickNextShapeIndex() {
    if (shapes.length < 2) return 0;
    let next;
    do { next = Math.floor(Math.random() * shapes.length); } while (next === shapeIndex);
    return next;
  }

  let burstStart = -Infinity;
  const BURST_MS = 900;
  function burst() {
    burstStart = performance.now();
    // an immediate shape change on click makes the "unlock" feel causal, not coincidental
    fromArr = positions.slice();
    shapeIndex = pickNextShapeIndex();
    toArr = shapes[shapeIndex];
    morphStart = performance.now();
    nextSwitchAt = morphStart + HOLD_MS + MORPH_MS;
  }

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }

  function animate(now) {
    if (!running) return;
    requestAnimationFrame(animate);

    if (now >= nextSwitchAt) {
      fromArr = positions.slice();
      shapeIndex = pickNextShapeIndex();
      toArr = shapes[shapeIndex];
      morphStart = now;
      nextSwitchAt = now + HOLD_MS + MORPH_MS;
    }

    if (now - morphStart < MORPH_MS) {
      const t = easeInOutCubic(Math.min(1, (now - morphStart) / MORPH_MS));
      for (let i = 0; i < positions.length; i++) positions[i] = fromArr[i] + (toArr[i] - fromArr[i]) * t;
      geo.attributes.position.needsUpdate = true;
    }

    intensity += (intensityTarget - intensity) * 0.08;
    const breathe = Math.sin(now * 0.0016) * 0.06; // constant slow "alive" brightness pulse

    // WYRD's face (either variant) tracks the cursor far more directly than every other shape —
    // stronger parallax AND a faster follow speed, so it reads as actually looking at you rather
    // than the same ambient drift every other shape gets. Eased, not switched, so it doesn't snap
    // the instant a morph starts/ends.
    faceFactor += ((faceShapeIndices.has(shapeIndex) ? 1 : 0) - faceFactor) * 0.05;
    const faceBoost = 1 + faceFactor * 1.8;
    const followSpeed = 0.04 + faceFactor * 0.1;

    // camera parallax: looks toward the cursor rather than just spinning blindly
    camera.position.x += (mouseX * 1.1 * faceBoost - camera.position.x) * followSpeed;
    camera.position.y += (-mouseY * 0.8 * faceBoost - camera.position.y) * followSpeed;
    camera.lookAt(0, 0, 0);

    const baseSpeed = 0.0022 + intensity * 0.006;
    group.rotation.y += baseSpeed * (1 - faceFactor * 0.5); // a tracking face spins less on its own
    group.rotation.x = Math.sin(now * 0.00015) * 0.15 * (1 - faceFactor * 0.6) + mouseY * 0.12 * faceBoost;
    group.rotation.z = mouseX * 0.05 * faceBoost;

    let burstScale = 1;
    const bt = (now - burstStart) / BURST_MS;
    if (bt >= 0 && bt < 1) burstScale = 1 + easeOutElastic(bt) * 0.22 * (1 - bt);
    group.scale.setScalar(burstScale);

    mat.opacity = 0.8 + breathe + intensity * 0.15;
    mat.size = 0.05 + intensity * 0.02;

    renderer.render(scene, camera);
  }

  // ---- Connected to WYRD's own mind: periodically asks the server for a brand-new shape,
  // authored by WYRD itself (an LLM call framed as WYRD, informed by its real current
  // mood/curiosity/confidence — see /api/gate-vortex/shape in server.js) rather than picked from
  // this fixed list. The response is a small set of numeric knobs, never code — shapeGenerative()
  // plugs them into one fixed, safe parametric formula, so there's real novelty without ever
  // evaluating anything WYRD sends. Falls back to a deterministic, mind-state-derived shape
  // if the LLM is unavailable, so this still feels "alive" even with no API key configured.
  // Five genuinely different geometric families WYRD can choose between (via params.type) —
  // not just different numbers fed through one fixed curve. All take the same knob set so the
  // server-side schema stays simple, but each interprets those knobs completely differently.
  function genLissajous(p) {
    const arr = new Float32Array(N * 3);
    const totalT = p.turns * Math.PI * 2;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * totalT;
      const r = p.radiusScale * (0.4 + 0.6 * Math.abs(Math.sin((p.a * t) / p.turns + p.twist)));
      arr[i * 3] = r * Math.cos((p.freqX * t) / p.turns);
      arr[i * 3 + 1] = p.heightScale * Math.sin((p.b * t) / p.turns + p.freqZ * 0.5) * 0.6;
      arr[i * 3 + 2] = r * Math.sin((p.freqY * t) / p.turns);
    }
    return arr;
  }

  // Rhodonea (rose) curve — petals, not a spiral: radius oscillates with angle instead of
  // growing/shrinking monotonically, so it reads as a flower/gear shape.
  function genRose(p) {
    const arr = new Float32Array(N * 3);
    const k = Math.max(1, p.freqX) / Math.max(1, p.freqY);
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * p.turns * Math.PI * 2;
      const r = p.radiusScale * Math.cos(k * theta + p.twist);
      arr[i * 3] = r * Math.cos(theta);
      arr[i * 3 + 1] = p.heightScale * Math.sin(p.freqZ * theta * 0.3) * 0.4;
      arr[i * 3 + 2] = r * Math.sin(theta);
    }
    return arr;
  }

  // Braid — 2-5 separate strands winding around a shared vertical axis, like rope or a friendship
  // bracelet, not one single curve.
  function genBraid(p) {
    const arr = new Float32Array(N * 3);
    const strands = Math.max(2, Math.min(5, Math.round(p.freqZ / 2) + 2));
    const perStrand = Math.floor(N / strands);
    let idx = 0;
    for (let s = 0; s < strands; s++) {
      const phase = (s / strands) * Math.PI * 2;
      for (let i = 0; i < perStrand; i++) {
        const t = i / perStrand;
        const angle = t * p.turns * Math.PI * 2 * Math.max(1, p.freqX * 0.4) + phase + p.twist;
        const r = p.radiusScale * (0.6 + 0.4 * Math.sin(t * Math.PI * p.freqY * 0.5));
        arr[idx * 3] = Math.cos(angle) * r;
        arr[idx * 3 + 1] = p.heightScale * (t - 0.5) * 2;
        arr[idx * 3 + 2] = Math.sin(angle) * r;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // Rippling lattice — a flat grid distorted by a 2D standing wave, like fabric or water, not
  // a curve at all.
  function genLatticeWave(p) {
    const arr = new Float32Array(N * 3);
    const gridSize = Math.round(Math.sqrt(N));
    let idx = 0;
    for (let gx = 0; gx < gridSize; gx++) {
      for (let gz = 0; gz < gridSize; gz++) {
        if (idx >= N) break;
        const x = (gx / (gridSize - 1) - 0.5) * p.radiusScale * 2.4;
        const z = (gz / (gridSize - 1) - 0.5) * p.radiusScale * 2.4;
        const y = Math.sin(x * p.freqX * 0.5 + p.twist) * Math.cos(z * p.freqY * 0.5) * p.heightScale * 0.5;
        arr[idx * 3] = x; arr[idx * 3 + 1] = y; arr[idx * 3 + 2] = z;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  // Spiky shell — a sphere whose surface radius oscillates in two directions at once, like a
  // sea urchin or virus model, not a wound line.
  function genBurstShell(p) {
    const arr = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const yv = 1 - (i / (N - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const spike = 1 + 0.6 * Math.abs(Math.sin(theta * p.freqX) * Math.cos(yv * p.freqY + p.twist));
      const R = p.radiusScale * spike;
      arr[i * 3] = Math.cos(theta) * rY * R;
      arr[i * 3 + 1] = yv * R * (p.heightScale / 2);
      arr[i * 3 + 2] = Math.sin(theta) * rY * R;
    }
    return arr;
  }

  // Radial burst — points flung outward from a small core at jagged, uneven distances (echoes
  // shapeExplosion above), not wound around an axis at all.
  function genExplosionBurst(p) {
    const arr = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const yv = 1 - (i / (N - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const jag = 0.5 + 0.5 * Math.abs(Math.sin(theta * p.freqX + p.twist) * Math.cos(yv * p.freqY));
      const R = p.radiusScale * (1 + jag * p.b);
      arr[i * 3] = Math.cos(theta) * rY * R;
      arr[i * 3 + 1] = yv * R * (p.heightScale / 2);
      arr[i * 3 + 2] = Math.sin(theta) * rY * R;
    }
    return arr;
  }

  // Circuit grid — a blocky, right-angle Manhattan-routed lattice (echoes shapeCircuit above),
  // deliberately geometric rather than curved.
  function genCircuitGrid(p) {
    const arr = new Float32Array(N * 3);
    const S = p.radiusScale;
    const lines = Math.max(3, Math.min(9, p.freqX));
    const segments = [[[-S, -S, 0], [S, -S, 0]], [[S, -S, 0], [S, S, 0]], [[S, S, 0], [-S, S, 0]], [[-S, S, 0], [-S, -S, 0]]];
    for (let i = 1; i < lines; i++) {
      const pos = -S + (i / lines) * 2 * S;
      if (i % 2 === 0) segments.push([[pos, -S * 0.6, 0], [pos, S * 0.6, 0]]);
      else segments.push([[-S * 0.6, pos, 0], [S * 0.6, pos, 0]]);
    }
    const perSeg = Math.floor(N / segments.length);
    let idx = 0;
    for (const [a, b] of segments) {
      for (let i = 0; i < perSeg; i++) {
        const t = i / perSeg;
        arr[idx * 3] = a[0] + (b[0] - a[0]) * t;
        arr[idx * 3 + 1] = a[1] + (b[1] - a[1]) * t + Math.sin(t * p.freqY + p.twist) * p.heightScale * 0.05;
        arr[idx * 3 + 2] = a[2] + (b[2] - a[2]) * t;
        idx++;
      }
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = 0; arr[idx * 3 + 2] = 0; idx++; }
    return arr;
  }

  function shapeGenerative(p) {
    switch (p.type) {
      case 'rose': return genRose(p);
      case 'braid': return genBraid(p);
      case 'latticeWave': return genLatticeWave(p);
      case 'burstShell': return genBurstShell(p);
      case 'explosionBurst': return genExplosionBurst(p);
      case 'circuitGrid': return genCircuitGrid(p);
      case 'lissajous': default: return genLissajous(p);
    }
  }

  const MAX_GENERATED_SHAPES = 8; // keeps the rotation from growing forever over a long session
  function addGeneratedShape(params) {
    shapes.push(shapeGenerative(params));
    if (shapes.length > curatedShapeCount + MAX_GENERATED_SHAPES) shapes.splice(curatedShapeCount, 1);
  }

  const caption = document.getElementById('gateVortexCaption');
  let captionHideTimer = null;
  function showCaption(text) {
    if (!caption) return;
    caption.textContent = `WYRD is imagining: ${text}`;
    caption.classList.add('show');
    clearTimeout(captionHideTimer);
    captionHideTimer = setTimeout(() => caption.classList.remove('show'), 5000);
  }

  let mindPollTimer = null;
  const MIND_POLL_MS = 42000;
  async function fetchShapeFromMind() {
    try {
      const res = await fetch('/api/gate-vortex/shape');
      if (!res.ok) return;
      const params = await res.json();
      if (typeof params.a !== 'number') return; // malformed — skip silently, keep the existing set
      addGeneratedShape(params);
      showCaption(params.label || 'a new pattern');
    } catch (err) { /* offline or server hiccup — the curated shapes carry on fine without it */ }
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    nextSwitchAt = performance.now() + HOLD_MS;
    requestAnimationFrame(animate);
    fetchShapeFromMind();
    mindPollTimer = setInterval(fetchShapeFromMind, MIND_POLL_MS);
  }
  function stop() {
    running = false;
    clearInterval(mindPollTimer);
  }
  function setIntensity(level) { intensityTarget = level; }

  start();
  window.GateVortex = { start, stop, burst, setIntensity };
})();
