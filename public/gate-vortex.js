// The gate/login screen's cinematic backdrop — a generative particle structure that morphs
// between 22 curated wireframe-ish forms spanning geometry, physics, the quantum realm, the
// cosmos, nature, humans, architecture, and WYRD's own likeness — plus new shapes WYRD itself
// authors on a live timer via /api/gate-vortex/shape (see fetchShapeFromMind below), all in
// WYRD's own terminal green, plus a dim starfield for depth. Same particle-count-preserving
// morph technique across every shape (curated or generated) so a plain per-vertex lerp animates
// smoothly between any two of them — no shape-specific transition logic needed.
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
    const scale = 2.7;
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

  function shapeHelixDNA() {
    const arr = new Float32Array(N * 3);
    const half = N / 2;
    for (let i = 0; i < N; i++) {
      const strand = i < half ? 0 : 1;
      const idx = strand === 0 ? i : i - half;
      const t = idx / (half - 1);
      const y = -2.8 + t * 5.6;
      const angle = t * Math.PI * 10 + (strand === 1 ? Math.PI : 0);
      const r = 1.3;
      arr[i * 3] = Math.cos(angle) * r;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = Math.sin(angle) * r;
    }
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

  // ---- Humans: a stick-figure silhouette — a head plus five straight limb/spine segments,
  // each walked linearly by an even share of the points. ----
  // ---- Humans, v2: real volumetric limbs (tapered tube-of-rings around each bone axis, not a
  // single flat line per limb) with actual elbow/knee bends — reads as a body, not a wireframe
  // skeleton. Shares the same ring-stacking idea as the vortex/funnel shapes, just walked along
  // an arbitrary 3D axis instead of a straight vertical one. ----
  function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vLen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function vNorm(a) { const l = vLen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  function shapeHuman() {
    const arr = new Float32Array(N * 3);
    let idx = 0;
    const headCount = Math.round(N * 0.09);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < headCount; i++) {
      const yv = 1 - (i / (headCount - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - yv * yv));
      const theta = golden * i;
      const R = 0.42;
      arr[idx * 3] = Math.cos(theta) * rY * R;
      arr[idx * 3 + 1] = 2.55 + yv * R;
      arr[idx * 3 + 2] = Math.sin(theta) * rY * R;
      idx++;
    }

    function addLimb(from, to, rStart, rEnd, ringsAlong, perRing, budget) {
      const dir = vNorm(vSub(to, from));
      const up = Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
      const right = vNorm(vCross(up, dir));
      const trueUp = vCross(dir, right);
      let written = 0;
      for (let r = 0; r < ringsAlong && written < budget; r++) {
        const t = r / (ringsAlong - 1);
        const cx = from[0] + (to[0] - from[0]) * t;
        const cy = from[1] + (to[1] - from[1]) * t;
        const cz = from[2] + (to[2] - from[2]) * t;
        const radius = rStart + (rEnd - rStart) * t;
        for (let p = 0; p < perRing && written < budget; p++) {
          const a = (p / perRing) * Math.PI * 2;
          const ox = (right[0] * Math.cos(a) + trueUp[0] * Math.sin(a)) * radius;
          const oy = (right[1] * Math.cos(a) + trueUp[1] * Math.sin(a)) * radius;
          const oz = (right[2] * Math.cos(a) + trueUp[2] * Math.sin(a)) * radius;
          arr[idx * 3] = cx + ox; arr[idx * 3 + 1] = cy + oy; arr[idx * 3 + 2] = cz + oz;
          idx++; written++;
        }
      }
    }

    // real anatomy: shoulders → elbows → hands, hips → knees → feet, plus a tapered torso —
    // the elbow/knee bends are what actually sell it as a figure instead of an X shape
    const limbs = [
      { from: [0, 2.1, 0], to: [0, 0.25, 0], r0: 0.5, r1: 0.4, weight: 2.1 },
      { from: [-0.35, 1.95, 0], to: [-1.1, 1.2, 0.15], r0: 0.22, r1: 0.15, weight: 1 },
      { from: [-1.1, 1.2, 0.15], to: [-1.25, 0.2, 0.3], r0: 0.15, r1: 0.1, weight: 1 },
      { from: [0.35, 1.95, 0], to: [1.1, 1.2, 0.15], r0: 0.22, r1: 0.15, weight: 1 },
      { from: [1.1, 1.2, 0.15], to: [1.25, 0.2, 0.3], r0: 0.15, r1: 0.1, weight: 1 },
      { from: [-0.2, 0.25, 0], to: [-0.3, -1.25, 0.15], r0: 0.26, r1: 0.18, weight: 1.3 },
      { from: [-0.3, -1.25, 0.15], to: [-0.34, -2.6, 0.25], r0: 0.18, r1: 0.1, weight: 1.3 },
      { from: [0.2, 0.25, 0], to: [0.3, -1.25, 0.15], r0: 0.26, r1: 0.18, weight: 1.3 },
      { from: [0.3, -1.25, 0.15], to: [0.34, -2.6, 0.25], r0: 0.18, r1: 0.1, weight: 1.3 },
    ];
    const remaining = N - headCount;
    const totalWeight = limbs.reduce((s, l) => s + l.weight, 0);
    for (const limb of limbs) {
      const budget = Math.max(8, Math.round(remaining * (limb.weight / totalWeight)));
      const ringsAlong = Math.max(4, Math.round(Math.sqrt(budget * 1.4)));
      const perRing = Math.max(4, Math.round(budget / ringsAlong));
      addLimb(limb.from, limb.to, limb.r0, limb.r1, ringsAlong, perRing, budget);
    }
    while (idx < N) { arr[idx * 3] = 0; arr[idx * 3 + 1] = -3; arr[idx * 3 + 2] = 0; idx++; }
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
  function shapeNautilus() {
    const arr = new Float32Array(N * 3);
    const turns = 4, b = 0.18, totalT = turns * Math.PI * 2;
    let maxR = 0;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * totalT;
      const r = 0.15 * Math.exp(b * t);
      arr[i * 3] = Math.cos(t) * r;
      arr[i * 3 + 1] = Math.sin(t) * r;
      arr[i * 3 + 2] = (t / totalT - 0.5) * 1.2;
      maxR = Math.max(maxR, r);
    }
    const norm = 2.3 / maxR;
    for (let i = 0; i < arr.length; i++) arr[i] *= norm;
    return arr;
  }

  const shapes = [
    shapeSphere(), shapeMandala(), shapeFace(), shapeInfinity(),
    shapeHelixDNA(), shapeTorusKnot(), shapeCubeGrid(), shapeGalaxy(), shapeWaveGrid(), shapeStarBurst(),
    shapeAtom(), shapeOrbital(), shapeSaturn(), shapeBlackHole(), shapeHuman(), shapeCityscape(), shapePyramid(),
    shapeMobius(), shapeTesseract(), shapeNeuralNetwork(), shapeFractalTree(), shapeNautilus(),
  ];
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

    // camera parallax: looks toward the cursor rather than just spinning blindly
    camera.position.x += (mouseX * 1.1 - camera.position.x) * 0.04;
    camera.position.y += (-mouseY * 0.8 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    const baseSpeed = 0.0022 + intensity * 0.006;
    group.rotation.y += baseSpeed;
    group.rotation.x = Math.sin(now * 0.00015) * 0.15 + mouseY * 0.12;
    group.rotation.z = mouseX * 0.05;

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
  function shapeGenerative(p) {
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
