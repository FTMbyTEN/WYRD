/**
 * Landmarks as real 3D models, drawn by the 2D canvas: each is a list of flat faces in metres (front towards +z,
 * standing on y = 0), turned to its real footprint and placed on its plot. Faces turned away from the camera are
 * skipped, the rest painted far to near and shaded by a fixed sun -- so a landmark lines up with its streets at every
 * camera angle and stays sharp at any zoom. Neon faces ([glow]) also shine on the night's glow layer.
 */
/** a flat face; [part]: the solid it belongs to (a box, a drum, a spire...) -- solids are put in order whole */
export type Face = { p: number[]; n: [number, number, number]; color: string; glow?: boolean; part: number };
/** [parts]: each solid's bounds, [x0, x1, y0, y1, z0, z1]; [box]: the plan, [x0, x1, z0, z1] */
export type Model = { faces: Face[]; height: number; radius: number; parts: number[][]; box: [number, number, number, number] };

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** builds a model from primitives; every face's normal points away from the primitive's own centre */
class Builder {
  faces: Face[] = [];
  private top = 0; private far = 0;
  /** the solid being built: each primitive is one; a face added on its own is a solid of its own */
  private part = -1; private inside = 0;
  private open() { if (this.inside++ === 0) this.part++; }
  private close() { this.inside--; }
  /** several faces (or primitives) as one solid */
  group(make: () => void) { this.open(); make(); this.close(); }
  face(pts: V3[], color: string, centre: V3, glow = false) {
    if (this.inside === 0) this.part++;
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const c: V3 = [0, 0, 0]; for (const q of pts) { c[0] += q[0] / pts.length; c[1] += q[1] / pts.length; c[2] += q[2] / pts.length; }
    const out = sub(c, centre);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    this.faces.push({ p: pts.flat(), n, color, glow, part: this.part });
    for (const q of pts) { this.top = Math.max(this.top, q[1]); this.far = Math.max(this.far, Math.hypot(q[0], q[2])); }
  }
  /** a box: centre (x, z), size w (x) by d (z), from y0 up h; [roof] colour for its top */
  box(x: number, z: number, w: number, d: number, y0: number, h: number, color: string, roof = color, glow = false) {
    this.open();
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h, c: V3 = [x, y0 + h / 2, z];
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color, c, glow);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], color, c, glow);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], color, c, glow);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], color, c, glow);
    // (a neon box is a band of light round its sides: its top would light the whole roof it rings)
    if (!glow) this.face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], roof, c, glow);
    this.close();
  }
  /** a cylinder or a frustum (r0 at the bottom, r1 at the top), with an optional lid */
  drum(x: number, z: number, r0: number, y0: number, h: number, color: string, opts: { r1?: number; seg?: number; lid?: string; glow?: boolean } = {}) {
    this.open();
    const seg = opts.seg ?? 24, r1 = opts.r1 ?? r0, y1 = y0 + h, c: V3 = [x, y0 + h / 2, z];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.face([[x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0], [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1], [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1]], color, [x, y0 + h / 2, z], opts.glow);
    }
    if (opts.lid && r1 > 0.01) this.face(Array.from({ length: seg }, (_, i): V3 => { const a = (i / seg) * Math.PI * 2; return [x + Math.cos(a) * r1, y1, z + Math.sin(a) * r1]; }), opts.lid, [x, y1 - 1, z]);
    void c;
    this.close();
  }
  /** a dome (half sphere) of radius r sitting at y0 */
  dome(x: number, z: number, r: number, y0: number, color: string, seg = 20, rings = 6) {
    this.open();
    for (let j = 0; j < rings; j++) {
      const t0 = (j / rings) * Math.PI / 2, t1 = ((j + 1) / rings) * Math.PI / 2;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const P = (t: number, a: number): V3 => [x + Math.cos(a) * Math.cos(t) * r, y0 + Math.sin(t) * r, z + Math.sin(a) * Math.cos(t) * r];
        this.face(j === rings - 1 ? [P(t0, a0), P(t0, a1), P(t1, a0)] : [P(t0, a0), P(t0, a1), P(t1, a1), P(t1, a0)], color, [x, y0, z]);
      }
    }
    this.close();
  }
  /** a pyramid or spire: square base w at y0, point h above */
  spire(x: number, z: number, w: number, y0: number, h: number, color: string) {
    this.open();
    const s = w / 2, top: V3 = [x, y0 + h, z], c: V3 = [x, y0 + h / 4, z];
    const b: V3[] = [[x - s, y0, z - s], [x + s, y0, z - s], [x + s, y0, z + s], [x - s, y0, z + s]];
    for (let i = 0; i < 4; i++) this.face([b[i], b[(i + 1) % 4], top], color, c);
    this.close();
  }
  /** a gabled roof along z: base w by d at y0, ridge h above */
  gable(x: number, z: number, w: number, d: number, y0: number, h: number, color: string) {
    this.open();
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h, c: V3 = [x, y0, z];
    this.face([[x0, y0, z0], [x0, y0, z1], [x, y1, z1], [x, y1, z0]], color, c);
    this.face([[x1, y0, z1], [x1, y0, z0], [x, y1, z0], [x, y1, z1]], color, c);
    this.face([[x0, y0, z1], [x1, y0, z1], [x, y1, z1]], color, c);
    this.face([[x1, y0, z0], [x0, y0, z0], [x, y1, z0]], color, c);
    this.close();
  }
  /** floor bands round a box: a slightly proud dark strip every [every] m (windows), from y0 to y1 */
  bands(x: number, z: number, w: number, d: number, y0: number, y1: number, every: number, tall: number, color: string) {
    for (let y = y0 + every * 0.4; y + tall < y1; y += every) this.box(x, z, w + 0.3, d + 0.3, y, tall, color, color);
  }
  done(): Model {
    const parts: number[][] = [], box: [number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const f of this.faces) {
      const b = parts[f.part] ?? (parts[f.part] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]);
      for (let i = 0; i < f.p.length; i += 3) {
        const x = f.p[i], y = f.p[i + 1], z = f.p[i + 2];
        if (x < b[0]) b[0] = x; if (x > b[1]) b[1] = x; if (y < b[2]) b[2] = y; if (y > b[3]) b[3] = y; if (z < b[4]) b[4] = z; if (z > b[5]) b[5] = z;
        if (x < box[0]) box[0] = x; if (x > box[1]) box[1] = x; if (z < box[2]) box[2] = z; if (z > box[3]) box[3] = z;
      }
    }
    return { faces: this.faces, height: this.top, radius: this.far, parts, box };
  }
}

/** a Lagos market: rows of stalls under coloured canopies, a little different each time ([seed]), [half] m from the middle */
function marketB(half: number, seed: number) {
  const b = new Builder(), cols = ['#E53935', '#1E88E5', '#F2C94C', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1'];
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  b.box(0, 0, half * 2, half * 2, 0, 0.3, '#8A8F96');
  for (let z = -half + 6; z <= half - 6; z += 9) for (let x = -half + 5; x <= half - 5; x += 6) {
    if (rnd() < 0.15) continue;
    b.box(x, z, 4, 3.4, 0.3, 1.2, '#7A5A3C', '#C98B4A'); // the table, its goods
    b.box(x, z, 5, 4.4, 2.6, 0.25, cols[Math.floor(rnd() * cols.length)]); // the canopy
  }
  b.box(0, -half - 0.4, half * 1.2, 0.4, 3.2, 1, '#FCEE0A', '#FCEE0A', true);
  return b;
}
const market = (half: number, seed: number) => marketB(half, seed).done();

// ---- the models (real proportions, front towards +z) ----

const MODELS: Record<string, () => Model> = {
  /** the National Theatre, Iganmu: a round drum under its famous folded "military cap" roof */
  theatre: () => {
    const b = new Builder();
    b.drum(0, 0, 62, 0, 4, '#BDB5A6', { lid: '#C9C1B2', seg: 32 });
    b.drum(0, 0, 52, 4, 15, '#ECE6DA', { seg: 32 });
    b.drum(0, 0, 52.3, 9.5, 4.5, '#2C3A4C', { seg: 32 });
    // the cap: pleats folding in from a wide brim to the crown
    const seg = 24;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const P = (r: number, y: number, a: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
      b.face([P(58, 19, a0), P(52, 19.8, am), P(30, 30, am), P(30, 30, a0)], '#DCD5C6', [0, 22, 0]);
      b.face([P(52, 19.8, am), P(58, 19, a1), P(30, 30, a1), P(30, 30, am)], '#C8C0B0', [0, 22, 0]);
    }
    b.drum(0, 0, 30, 30, 1.2, '#B9B0A0', { lid: '#AAA192', seg: 24 });
    b.drum(0, 0, 58.5, 18.6, 0.5, '#00F0FF', { seg: 32, glow: true }); // a neon line under the brim
    b.box(0, 66, 26, 10, 0, 4, '#BDB5A6'); // the entrance ramp
    return b.done();
  },
  /** the Cathedral Church of Christ, Marina, after its painting: cream Gothic stone under blue slate -- a long nave
   *  with lower aisles, every bay buttressed and crowned with a pinnacle, framed lancet windows, the west front's
   *  great traceried window, rose and cross between corner turrets, a transept and chancel behind, and the tall
   *  square bell tower at the front corner: four stages, stepped corner buttresses, paired belfry lancets,
   *  battlements and tall pinnacles */
  cathedral: () => {
    const b = new Builder();
    const stone = '#F1E6CC', trim = '#FAF3E1', deep = '#E2D3B2', slate = '#4D6FA6', ridge = '#3D5C92', glass = '#2E5596', wood = '#6E4128';
    /** a framed lancet on a wall facing (nx, nz): a cream surround, the blue glass a little proud of it */
    const lancet = (x: number, z: number, nx: number, nz: number, w: number, y0: number, h: number, fill = glass) => {
      const tx = -nz, tz = nx;
      const shape = (o: number, s: number, lift: number, color: string) => {
        const cx = x + nx * o, cz = z + nz * o, top = y0 + h + lift, spring = top - s * 1.5;
        b.face([[cx - tx * s, y0 - lift, cz - tz * s], [cx + tx * s, y0 - lift, cz + tz * s], [cx + tx * s, spring, cz + tz * s], [cx, top, cz], [cx - tx * s, spring, cz - tz * s]], color, [x - nx * 3, y0 + h / 2, z - nz * 3]);
      };
      shape(0.1, w / 2 + 0.35, 0.35, trim);
      shape(0.2, w / 2, 0, fill);
    };
    /** a buttress (two set-offs, narrowing) crowned with a pinnacle */
    const buttress = (x: number, z: number, h: number, w = 1.3) => {
      b.box(x, z, w, w, 0, h * 0.6, deep, trim);
      b.box(x, z, w * 0.8, w * 0.8, h * 0.6, h * 0.4, deep, trim);
      b.box(x, z, w * 0.9, w * 0.9, h, 0.5, trim);
      b.spire(x, z, w * 0.75, h + 0.5, w * 2.6, deep);
    };
    /** a gabled roof running along x (the builder's gable runs along z) */
    const gableX = (x: number, z: number, w: number, d: number, y0: number, h: number, color: string) => b.group(() => {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h, c: V3 = [x, y0, z];
      b.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z], [x0, y1, z]], color, c);
      b.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z], [x1, y1, z]], color, c);
      b.face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z]], stone, c);
      b.face([[x0, y0, z1], [x0, y0, z0], [x0, y1, z]], stone, c);
    });

    // a plinth the whole church stands on
    b.box(0, -5, 27, 48, 0, 0.8, deep, deep);
    // the nave: tall walls under a steep slate roof with a darker ridge
    const NL = 40, NZ = -2, NF = NZ + NL / 2; // length, middle, the west front's z
    b.box(0, NZ, 12, NL, 0.8, 14.2, stone, stone);
    b.gable(0, NZ, 12.8, NL + 0.6, 15, 9.5, slate);
    b.box(0, NZ, 0.6, NL + 0.6, 24.4, 0.35, ridge);
    // the aisles, with lean-to roofs up to the nave
    for (const s of [-1, 1]) {
      b.box(s * 8.25, NZ - 1, 4.5, NL - 2, 0.8, 8.2, stone, stone);
      b.face([[s * 10.8, 9, NZ - NL / 2], [s * 10.8, 9, NF - 1], [s * 6, 12.6, NF - 1], [s * 6, 12.6, NZ - NL / 2]], slate, [s * 8.25, 0, NZ - 1]);
      for (let z = NZ - NL / 2 + 4; z < NF - 3; z += 5.5) {
        lancet(s * 10.5, z, s, 0, 1.5, 2.6, 4.4); // aisle windows
        lancet(s * 6, z, s, 0, 1.2, 13.2, 1.6); // clerestory, above the aisle roof
        buttress(s * 11.1, z + 2.75, 8.6);
        b.spire(s * 6.3, z + 2.75, 0.9, 15, 3, deep); // pinnacles along the nave's eaves
      }
    }
    // the transept, a cross wing with gable ends, and the chancel beyond it
    b.box(0, NZ - NL / 2 + 6, 26, 9, 0.8, 12.2, stone, stone);
    gableX(0, NZ - NL / 2 + 6, 26.6, 9.6, 13, 6, slate);
    for (const s of [-1, 1]) { lancet(s * 13, NZ - NL / 2 + 6, s, 0, 2.6, 3, 7.5); buttress(s * 13.4, NZ - NL / 2 + 1.9, 12); buttress(s * 13.4, NZ - NL / 2 + 10.1, 12); }
    b.box(0, NZ - NL / 2 - 3, 9, 7, 0.8, 11.2, stone, stone);
    b.gable(0, NZ - NL / 2 - 3, 9.6, 7.4, 12, 5, slate);
    lancet(0, NZ - NL / 2 - 6.5, 0, -1, 2.6, 3.5, 6.5);

    // the west front: door, great window, rose in the gable, cross on top, turrets at the corners
    lancet(0, NF, 0, 1, 3.4, 0.8, 5.6, wood);
    lancet(0, NF, 0, 1, 4.4, 7.6, 6.8);
    b.box(0, NF + 0.12, 0.25, 0.1, 7.6, 5.8, trim); // the window's tracery mullion
    b.face(Array.from({ length: 10 }, (_, i): V3 => { const a = (i / 10) * Math.PI * 2; return [Math.cos(a) * 1.8, 19 + Math.sin(a) * 1.8, NF + 0.1]; }), trim, [0, 19, NF - 3]);
    b.face(Array.from({ length: 10 }, (_, i): V3 => { const a = (i / 10) * Math.PI * 2; return [Math.cos(a) * 1.35, 19 + Math.sin(a) * 1.35, NF + 0.2]; }), glass, [0, 19, NF - 3]);
    b.box(0, NF - 0.2, 0.5, 0.5, 24.4, 4.4, trim); b.box(0, NF - 0.2, 2.4, 0.5, 27, 0.5, trim); // the cross
    for (const s of [-1, 1]) {
      b.box(s * 6.6, NF + 0.3, 1.8, 1.8, 0.8, 20, deep, trim); b.box(s * 6.6, NF + 0.3, 2.1, 2.1, 20.8, 0.6, trim);
      b.spire(s * 6.6, NF + 0.3, 1.6, 21.4, 6, deep);
      buttress(s * 10.8, NF + 0.3, 9.5, 1.4);
      lancet(s * 8.25, NF, 0, 1, 1.6, 2.6, 4.4); // the aisles' west windows
    }

    // the bell tower at the front corner
    const tx = 14.6, tz = NF - 4.3, h = 4.3, H = 44;
    b.box(tx, tz, h * 2 + 1, h * 2 + 1, 0, 1.6, deep, deep);
    b.box(tx, tz, h * 2, h * 2, 1.6, H - 1.6, stone, stone);
    for (const y of [11, 22, 32]) b.box(tx, tz, h * 2 + 0.5, h * 2 + 0.5, y, 0.6, trim);
    for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const fx = tx + nx * h, fz = tz + nz * h, px = -nz, pz = nx;
      if (nz === 1) lancet(fx, fz, nx, nz, 2.2, 1.6, 5.4, wood); else lancet(fx, fz, nx, nz, 1.4, 4, 4.5);
      lancet(fx, fz, nx, nz, 1.6, 13.5, 6.5);
      for (const k of [-1, 1]) lancet(fx + px * k * 1.3, fz + pz * k * 1.3, nx, nz, 1.2, 23.8, 6.6); // the belfry's pairs
      for (const k of [-1, 1]) lancet(fx + px * k * 1.3, fz + pz * k * 1.3, nx, nz, 1.1, 34, 6.5, '#41618F');
      // battlements: merlons along the parapet
      for (let t = -h + 1.5; t <= h - 1.4; t += 1.75) b.box(fx - nx * 0.25 + px * t, fz - nz * 0.25 + pz * t, Math.abs(px) * 1 + Math.abs(nx) * 0.5, Math.abs(pz) * 1 + Math.abs(nz) * 0.5, H + 0.6, 1.4, trim);
      b.spire(fx - nx * 0.25, fz - nz * 0.25, 0.9, H + 2, 3.4, deep); // the small middle pinnacles
    }
    b.box(tx, tz, h * 2 + 0.6, h * 2 + 0.6, H, 0.6, trim); // the parapet's cornice
    b.box(tx, tz, h * 2 - 1, h * 2 - 1, H, 0.3, '#C9BB9A');
    // stepped corner buttresses up to tall pinnacles
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = tx + sx * (h + 0.2), cz = tz + sz * (h + 0.2);
      b.box(cx, cz, 1.9, 1.9, 0, 22, deep, trim);
      b.box(cx, cz, 1.5, 1.5, 22, 18, deep, trim);
      b.box(cx, cz, 1.2, 1.2, 40, H + 1.4 - 40, deep, trim);
      b.box(cx, cz, 1.5, 1.5, H + 1.4, 0.5, trim);
      b.spire(cx, cz, 1.3, H + 1.9, 9, deep);
    }
    b.box(0, NF - 0.2, 0.6, 0.3, 24.6, 3.8, '#00F0FF', '#00F0FF', true); // the cross, lit at night
    return b.done();
  },
  /** Lagos Central Mosque: a white prayer hall under a great dome, with four minarets */
  'central-mosque': () => {
    const b = new Builder(), white = '#F3F0E7', gold = '#D6B04A', green = '#2E8B57';
    b.box(0, 0, 46, 46, 0, 14, white, '#E4E0D4');
    for (let x = -18; x <= 18; x += 6) b.box(x, 23.2, 3.4, 0.4, 2, 7, '#2B5A44');
    b.drum(0, 0, 11, 14, 4, white, { seg: 24 });
    b.dome(0, 0, 11, 18, gold);
    b.spire(0, 0, 1, 29, 4, gold);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 25, z = sz * 25;
      b.drum(x, z, 2.4, 0, 46, white, { seg: 8 });
      b.drum(x, z, 3.2, 30, 1.2, '#DAD5C8', { seg: 8, lid: '#DAD5C8' });
      b.drum(x, z, 3.2, 40, 1.2, '#DAD5C8', { seg: 8, lid: '#DAD5C8' });
      b.dome(x, z, 2.4, 46, green, 10, 4);
      b.drum(x, z, 2.45, 41.5, 0.4, '#3DFF9A', { seg: 8, glow: true });
    }
    for (const sx of [-1, 1]) b.dome(sx * 14, 14, 5, 14, green, 14, 4);
    return b.done();
  },
  /** the National Stadium, Surulere: an oval bowl of stands round the pitch and track, with floodlights */
  stadium: () => {
    const b = new Builder(), seg = 40;
    const E = (a: number, rx: number, rz: number, y: number): V3 => [Math.cos(a) * rx, y, Math.sin(a) * rz];
    b.face(Array.from({ length: seg }, (_, i) => E((i / seg) * Math.PI * 2, 72, 52, 0.2)), '#B5533C', [0, -1, 0]); // the track
    b.face(Array.from({ length: seg }, (_, i) => E((i / seg) * Math.PI * 2, 60, 40, 0.3)), '#3E9B4F', [0, -1, 0]); // the pitch
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const seat = i % 2 ? '#2F7D3A' : '#C9A227', am = (a0 + a1) / 2;
      const outBelow: V3 = [Math.cos(am) * 400, -300, Math.sin(am) * 330], outside: V3 = [Math.cos(am) * 300, 2, Math.sin(am) * 250];
      b.face([E(a0, 74, 54, 3), E(a1, 74, 54, 3), E(a1, 112, 92, 24), E(a0, 112, 92, 24)], seat, outBelow); // stands, sloping up and out: they face the pitch
      b.face([E(a0, 112, 92, 0), E(a1, 112, 92, 0), E(a1, 112, 92, 26), E(a0, 112, 92, 26)], '#A7AEB8', [0, 13, 0]); // the outer wall
      b.face([E(a0, 112, 92, 24), E(a1, 112, 92, 24), E(a1, 115, 95, 26), E(a0, 115, 95, 26)], '#8C949E', [0, 0, 0]);
      b.face([E(a0, 74, 54, 0), E(a1, 74, 54, 0), E(a1, 74, 54, 3), E(a0, 74, 54, 3)], '#D9DDE2', outside); // the low wall round the track, facing in
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * 92, z = sz * 72;
      b.box(x, z, 2, 2, 0, 50, '#7D858F');
      b.box(x, z, 9, 1.5, 50, 4, '#EEF3F8', '#EEF3F8', true);
    }
    return b.done();
  },
  /** Independence House: the tall plain slab of 1963, floor bands all the way up */
  'independence-house': () => {
    const b = new Builder();
    b.box(0, 0, 40, 26, 0, 6, '#C9C3B6');
    b.box(0, 0, 34, 18, 6, 94, '#DCD7CC', '#BDB7AA');
    b.bands(0, 0, 34, 18, 6, 100, 3.3, 1.6, '#2D3A4A');
    b.box(0, 0, 10, 6, 100, 4, '#B4AEA2');
    b.box(0, 0, 0.8, 0.8, 104, 14, '#8D96A1');
    b.box(0, 0, 34.6, 18.6, 99, 0.5, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** NECOM House: a 32-storey tower under its red-and-white broadcast mast */
  'necom-house': () => {
    const b = new Builder();
    b.box(0, 0, 34, 34, 0, 8, '#C4BEB2');
    b.box(0, 0, 28, 28, 8, 104, '#E6E1D5', '#C9C3B6');
    b.bands(0, 0, 28, 28, 8, 112, 3.3, 1.5, '#334255');
    for (let i = 0; i < 8; i++) b.box(0, 0, 3.2 - i * 0.25, 3.2 - i * 0.25, 112 + i * 5.5, 5.5, i % 2 ? '#F2F2F2' : '#D7262E');
    b.box(0, 0, 0.6, 0.6, 156, 1, '#FF003C', '#FF003C', true);
    b.box(0, 0, 28.6, 28.6, 111, 0.6, '#FF2BD6', '#FF2BD6', true);
    return b.done();
  },
  /** Lagos City Hall: a colonial civic block with a columned portico, clock tower and blue dome */
  'city-hall': () => {
    const b = new Builder(), cream = '#EEE3C6', trim = '#D8CBA8';
    b.box(0, 0, 52, 28, 0, 16, cream, '#D9CFB4');
    b.bands(0, 0, 52, 28, 0, 16, 5.3, 2.2, '#3F4C5C');
    b.box(0, 16, 22, 4, 0, 3, trim);
    for (let x = -9; x <= 9; x += 3.6) b.drum(x, 17, 0.7, 3, 11, '#F7F1E0', { seg: 8 });
    b.box(0, 17, 22, 4, 14, 2, trim, trim);
    b.face([[-11, 16, 19], [11, 16, 19], [0, 21, 19]], '#F2E8CC', [0, 16, 15]);
    b.box(0, 2, 11, 11, 16, 13, cream, trim);
    b.box(0, 7.6, 3.6, 0.4, 23, 3.6, '#FFFFFF');
    b.drum(0, 2, 5.6, 29, 2, trim, { seg: 16 });
    b.dome(0, 2, 5.6, 31, '#2F6FD0', 16, 5);
    b.spire(0, 2, 0.8, 36.6, 3, '#D6B04A');
    b.box(0, 2, 11.6, 11.6, 28.6, 0.5, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** the Lagos Civic Centre: two glass blocks under a sweeping white canopy, on the lagoon's edge */
  civic: () => {
    const b = new Builder(), glass = '#2E6FA8', frame = '#EEF2F6';
    b.box(-10, 0, 30, 26, 0, 22, glass, frame);
    b.bands(-10, 0, 30, 26, 0, 22, 4, 0.5, '#9CC7E8');
    b.box(14, -2, 20, 20, 0, 34, '#2A62A0', frame);
    b.bands(14, -2, 20, 20, 0, 34, 4, 0.5, '#9CC7E8');
    // the canopy: a long slab tipping up from the low block over the tall one
    b.face([[-27, 23, 15], [26, 37, 15], [26, 38, 15], [-27, 24, 15]], frame, [0, 30, 0]);
    b.face([[-27, 24, -15], [26, 38, -15], [26, 38, 15], [-27, 24, 15]], frame, [0, 0, 0]);
    b.face([[-27, 23, -15], [26, 37, -15], [26, 37, 15], [-27, 23, 15]], '#C9D2DB', [0, 60, 0]);
    b.box(0, 15.5, 54, 0.6, 22.5, 0.5, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  // ---- landmark buildings ----
  /** Eko Hotel & Suites, Victoria Island: the long main tower over its low podium and wings */
  'eko-hotel': () => {
    const b = new Builder();
    b.box(0, 0, 110, 50, 0, 10, '#D9D3C6', '#C8C1B2');
    b.box(0, -4, 70, 20, 10, 52, '#EDE7DA', '#CFC8B9');
    b.bands(0, -4, 70, 20, 10, 62, 3.2, 1.4, '#2C4E6E');
    for (const s of [-1, 1]) { b.box(s * 46, 12, 18, 24, 10, 18, '#E4DED0', '#CFC8B9'); b.bands(s * 46, 12, 18, 24, 10, 28, 3.2, 1.4, '#2C4E6E'); }
    b.box(0, 6.2, 30, 0.6, 58, 3, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** the Federal Palace Hotel: a slab of balconies looking out to the Atlantic */
  'federal-palace': () => {
    const b = new Builder();
    b.box(0, 0, 90, 40, 0, 8, '#D2CCBE');
    b.box(0, 0, 64, 18, 8, 40, '#F1ECE1', '#D6D0C3');
    b.bands(0, 0, 64, 18, 8, 48, 3.1, 0.9, '#5E8FB5');
    b.box(0, 0, 64.6, 18.6, 47, 0.6, '#FF2BD6', '#FF2BD6', true);
    b.drum(30, 18, 8, 0, 9, '#E8E2D5', { lid: '#D9D3C6', seg: 16 });
    return b.done();
  },
  /** the Marina bank headquarters: a dark glass tower with a lit crown */
  'union-bank': () => {
    const b = new Builder();
    b.box(0, 0, 36, 32, 0, 8, '#9AA3AD');
    b.box(0, 0, 28, 26, 8, 84, '#24374F', '#1B2A3D');
    b.bands(0, 0, 28, 26, 8, 92, 3.6, 0.5, '#6E93B8');
    b.box(0, 0, 22, 20, 92, 6, '#2B405A');
    b.box(0, 0, 28.6, 26.6, 91.5, 0.6, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** CSS Bookshop House, Broad Street: a mid-rise slab with its sign */
  'css-bookshop': () => {
    const b = new Builder();
    b.box(0, 0, 30, 16, 0, 40, '#E7DFCC', '#C9C1AE');
    b.bands(0, 0, 30, 16, 4, 40, 3.2, 1.5, '#384A5E');
    b.box(0, 0, 30.4, 16.4, 0, 4, '#B8AE98');
    b.box(0, 8.4, 20, 0.5, 36, 2.6, '#FCEE0A', '#FCEE0A', true);
    return b.done();
  },
  /** the UNILAG Senate Building: a tall tower of white vertical fins */
  'unilag-senate': () => {
    const b = new Builder();
    b.box(0, 0, 36, 26, 0, 6, '#CFC9BC');
    b.box(0, 0, 24, 18, 6, 52, '#3D4F63', '#D6D0C3');
    for (let x = -11; x <= 11; x += 2.75) { b.box(x, 9.2, 0.7, 0.8, 6, 52, '#F4F1EA'); b.box(x, -9.2, 0.7, 0.8, 6, 52, '#F4F1EA'); }
    for (let z = -8; z <= 8; z += 2.67) { b.box(12.2, z, 0.8, 0.7, 6, 52, '#F4F1EA'); b.box(-12.2, z, 0.8, 0.7, 6, 52, '#F4F1EA'); }
    b.box(0, 0, 24.6, 18.6, 57.5, 0.6, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** the UNILAG main gate: two pillars and a lintel over the road, flags either side */
  'unilag-gate': () => {
    const b = new Builder();
    for (const s of [-1, 1]) { b.box(s * 13, 0, 4, 4, 0, 12, '#E9E3D6', '#CFC8B9'); b.box(s * 20, 0, 3, 3, 0, 6, '#D9D3C6'); b.box(s * 24, 0, 0.3, 0.3, 0, 14, '#9AA3AD'); b.box(s * 24 + 1.2, 0, 2.4, 0.15, 11.6, 1.6, s < 0 ? '#1E8E3E' : '#FFFFFF'); }
    b.box(0, 0, 30, 4.4, 12, 3, '#F2EDE2', '#D9D3C6');
    b.box(0, 2.3, 18, 0.4, 12.6, 1.8, '#FCEE0A', '#FCEE0A', true);
    return b.done();
  },
  /** the Lagos State Secretariat, Alausa: low office blocks round a courtyard, a taller block at the head */
  alausa: () => {
    const b = new Builder(), wall = '#E6E0D2', win = '#3A5068';
    for (const [x, z, w, d] of [[0, -60, 150, 22], [-64, 0, 22, 100], [64, 0, 22, 100]] as const) { b.box(x, z, w, d, 0, 14, wall, '#CFC8B9'); b.bands(x, z, w, d, 0, 14, 3.4, 1.4, win); }
    b.box(0, -60, 40, 26, 14, 18, '#F1ECE1', '#D6D0C3'); b.bands(0, -60, 40, 26, 14, 32, 3.4, 1.4, win);
    b.box(0, 10, 50, 50, 0, 0.3, '#7FAF6A');
    b.box(0, 10, 0.4, 0.4, 0, 16, '#9AA3AD'); b.box(1.4, 10, 2.8, 0.15, 14, 1.8, '#1E8E3E');
    b.box(0, -46.8, 30, 0.6, 28, 2, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** the Mobolaji Johnson railway station: a long hall under a barrel-vaulted roof, the platforms alongside */
  'rail-terminal': () => {
    const b = new Builder();
    b.box(0, 0, 160, 40, 0, 12, '#E8E3D8', '#D6D0C3');
    b.bands(0, 0, 160, 40, 2, 12, 5, 3, '#2F4A66');
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
      const P = (a: number, x: number): V3 => [x, 12 + Math.sin(a) * 9, Math.cos(a) * 22];
      b.face([P(a0, -82), P(a0, 82), P(a1, 82), P(a1, -82)], i % 2 ? '#BFC7CF' : '#CBD2D9', [0, 6, 0]);
    }
    for (const s of [-1, 1]) b.face(Array.from({ length: seg + 1 }, (_, i): V3 => [s * 82, 12 + Math.sin((i / seg) * Math.PI) * 9, Math.cos((i / seg) * Math.PI) * 22]), '#9FB6CC', [0, 12, 0]);
    b.box(0, 34, 170, 10, 0, 1.2, '#B8B2A6'); b.box(0, 34, 170, 1, 1.2, 0.3, '#FCEE0A');
    b.box(0, 22.4, 120, 0.6, 20.5, 0.8, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** Ikeja City Mall: a big low box with its glazed entrance and sign */
  mall: () => {
    const b = new Builder();
    b.box(0, 0, 150, 96, 0, 18, '#E9E4DA', '#CFC9BD');
    b.box(0, 48.5, 40, 2, 0, 16, '#3F78B0');
    b.box(0, 52, 46, 8, 16, 1, '#F2F2F2');
    b.box(0, 49.6, 34, 0.6, 18.5, 4, '#FF2BD6', '#FF2BD6', true);
    for (let x = -60; x <= 60; x += 20) b.box(x, 0, 8, 8, 18, 2, '#D6D0C4');
    return b.done();
  },
  /** the Lekki toll plaza: a long canopy on columns over the booths, across the expressway */
  'lekki-toll': () => {
    const b = new Builder();
    for (let x = -54; x <= 54; x += 12) { b.box(x, 0, 1.2, 1.2, 0, 8, '#C9CED6'); b.box(x + 6, 0, 2.4, 4, 0, 3, '#E8E4DA', '#F2C94C'); }
    b.box(0, 0, 124, 20, 8, 2.2, '#F3F4F6', '#E6E8EC');
    b.box(0, 10.3, 120, 0.4, 8.4, 1.2, '#00F0FF', '#00F0FF', true);
    b.box(0, -10.3, 120, 0.4, 8.4, 1.2, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
  /** Tinubu Square: an open paved square round its fountain, with flagpoles */
  'tinubu-square': () => {
    const b = new Builder();
    b.box(0, 0, 70, 70, 0, 0.4, '#D8D2C4');
    b.drum(0, 0, 12, 0.4, 1.2, '#CFC8B9', { lid: '#3E9FD8', seg: 24 });
    b.drum(0, 0, 3, 1.6, 4, '#E9E3D6', { lid: '#E9E3D6', seg: 12 });
    b.drum(0, 0, 12.2, 1.4, 0.3, '#00F0FF', { seg: 24, glow: true });
    for (const [x, z] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) b.spire(x, z, 5, 0.4, 6, '#3E8B48');
    for (const x of [-8, 0, 8]) { b.box(x, 30, 0.3, 0.3, 0.4, 12, '#9AA3AD'); b.box(x + 1.2, 30, 2.4, 0.15, 10.4, 1.6, '#1E8E3E'); }
    return b.done();
  },
  /** Nike Art Gallery: a four-storey house of art, its walls in bold painted panels */
  'nike-gallery': () => {
    const b = new Builder(), cols = ['#E53935', '#F2C94C', '#1E88E5', '#43A047', '#8E24AA', '#FB8C00'];
    b.box(0, 0, 30, 20, 0, 16, '#F1E6D2', '#C9B79A');
    for (let i = 0; i < 6; i++) b.box(-12.5 + i * 5, 10.2, 4, 0.4, 3 + (i % 2) * 5, 4, cols[i]);
    for (let i = 0; i < 4; i++) b.box(15.2, -7 + i * 4.6, 0.4, 3.6, 4 + (i % 2) * 5, 4, cols[(i + 2) % 6]);
    b.gable(0, 0, 30, 20, 16, 4, '#8C5A3C');
    return b.done();
  },
  /** the New Afrika Shrine: a great open hall under a broad roof, its name in light */
  shrine: () => {
    const b = new Builder();
    b.box(0, 0, 46, 32, 0, 3, '#5A4A3C', '#5A4A3C');
    for (let x = -21; x <= 21; x += 7) for (const z of [-15, 15]) b.box(x, z, 1, 1, 3, 7, '#3A2E26');
    b.gable(0, 0, 50, 36, 10, 6, '#8E6A4A');
    b.box(0, 16.4, 30, 0.5, 6, 2.4, '#FF2BD6', '#FF2BD6', true);
    b.box(0, -10, 16, 8, 3, 1.4, '#C9A227');
    return b.done();
  },
  /** Falomo Shopping Centre: a low centre of shops under an office block */
  falomo: () => {
    const b = new Builder();
    b.box(0, 0, 70, 46, 0, 9, '#E2DCCF', '#CFC9BD');
    b.box(0, 23.4, 66, 0.6, 0, 4, '#3F78B0');
    b.box(-14, -4, 28, 22, 9, 22, '#ECE7DC', '#D6D0C3'); b.bands(-14, -4, 28, 22, 9, 31, 3.3, 1.4, '#3A5068');
    b.box(14, 23.6, 30, 0.5, 6, 2.2, '#3DFF9A', '#3DFF9A', true);
    return b.done();
  },
  // ---- open places, markets and the big complexes ----
  balogun: () => market(64, 11),
  idumota: () => market(40, 23),
  'yaba-market': () => market(52, 37),
  tejuosho: () => { const b = marketB(44, 41); b.box(0, -32, 60, 18, 0, 16, '#E5DFD2', '#CFC9BD'); b.bands(0, -32, 60, 18, 0, 16, 3.4, 1.4, '#3A5068'); return b.done(); },
  'computer-village': () => { const b = marketB(44, 53); for (const x of [-30, 0, 30]) { b.box(x, -34, 22, 14, 0, 10, '#E9E4D8', '#CFC9BD'); b.box(x, -26.8, 18, 0.4, 7, 2, '#00F0FF', '#00F0FF', true); } return b.done(); },
  /** the Oshodi interchange: three terminal halls under sweeping white canopies, buses waiting */
  oshodi: () => {
    const b = new Builder();
    for (const [x, z] of [[-40, -10], [10, 20], [45, -25]] as const) {
      b.box(x, z, 34, 20, 0, 9, '#E7E3DA', '#D6D0C3'); b.bands(x, z, 34, 20, 0, 9, 4.2, 2, '#3F78B0');
      b.face([[x - 22, 12, z - 14], [x + 22, 14, z - 14], [x + 22, 14, z + 14], [x - 22, 12, z + 14]], '#F5F7FA', [x, 0, z]);
      b.box(x, z + 14.2, 40, 0.4, 11, 0.8, '#00F0FF', '#00F0FF', true);
    }
    for (let i = 0; i < 6; i++) b.box(-50 + i * 18, 44, 3, 11, 0, 3.2, '#1F5FD6', '#E8EDF5');
    return b.done();
  },
  /** the Obalende motor park: bus shelters in rows, yellow danfos waiting */
  obalende: () => {
    const b = new Builder();
    b.box(0, 0, 100, 70, 0, 0.3, '#6B6F76');
    for (let r = 0; r < 3; r++) {
      const z = -24 + r * 24;
      for (let x = -40; x <= 40; x += 20) { b.box(x, z, 0.4, 0.4, 0.3, 4, '#9AA3AD'); b.box(x, z, 18, 6, 4.3, 0.4, '#F2C94C', '#F2C94C'); }
      for (let x = -36; x <= 36; x += 12) b.box(x, z + 7, 2.2, 5.5, 0.3, 2.4, '#F2C94C', '#E8D27A');
    }
    b.box(0, 35.2, 40, 0.4, 3, 1.4, '#FCEE0A', '#FCEE0A', true);
    return b.done();
  },
  /** Tafawa Balewa Square: a great square with its grandstand and the gate of horses */
  tbs: () => {
    const b = new Builder();
    b.box(0, 0, 160, 120, 0, 0.3, '#D9D3C4');
    b.box(0, -52, 120, 16, 0, 6, '#ECE6D8', '#E1DACA');
    for (let i = 0; i < 6; i++) b.box(0, -46 + i * 2.2 - 8, 116, 2.2, 0, 1 + i * 1.6, i % 2 ? '#2F7D3A' : '#ECE6D8');
    b.face([[-60, 9, -60], [60, 9, -60], [60, 11, -44], [-60, 11, -44]], '#F5F2EA', [0, 0, -52]);
    for (const s of [-1, 1]) { b.box(s * 14, 58, 4, 4, 0, 14, '#E9E3D6'); b.box(s * 14, 58, 6, 6, 14, 3, '#D6B04A'); }
    b.box(0, 58, 32, 4, 14, 2, '#E9E3D6');
    b.box(0, 60.2, 24, 0.4, 14.4, 1.2, '#FCEE0A', '#FCEE0A', true);
    return b.done();
  },
  /** Muri Okunola Park: lawns, trees and a pavilion */
  'muri-okunola': () => {
    const b = new Builder();
    b.box(0, 0, 110, 80, 0, 0.3, '#7FBF6A');
    for (let i = 0; i < 14; i++) { const x = -48 + (i % 7) * 16, z = i < 7 ? -30 : 30; b.box(x, z, 0.6, 0.6, 0.3, 3, '#6B4A2E'); b.spire(x, z, 6, 3, 7, '#3E8B48'); }
    b.box(0, 0, 20, 14, 0.3, 0.6, '#D9D3C4'); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 8, sz * 5, 0.5, 0.5, 0.9, 4, '#E9E3D6');
    b.face([[-11, 5, -8], [11, 5, -8], [0, 8, 0]], '#C9A227', [0, 0, 0]); b.face([[11, 5, 8], [-11, 5, 8], [0, 8, 0]], '#C9A227', [0, 0, 0]);
    b.face([[11, 5, -8], [11, 5, 8], [0, 8, 0]], '#B8921F', [0, 0, 0]); b.face([[-11, 5, 8], [-11, 5, -8], [0, 8, 0]], '#B8921F', [0, 0, 0]);
    b.drum(0, 0, 14, 0.3, 0.2, '#3DFF9A', { seg: 24, glow: true });
    return b.done();
  },
  /** Bar Beach: umbrellas and a lifeguard tower on the sand */
  'bar-beach': () => {
    const b = new Builder(), cols = ['#E53935', '#1E88E5', '#F2C94C', '#43A047', '#FF2BD6'];
    for (let i = 0; i < 12; i++) { const x = -55 + i * 10, z = (i % 3) * 8 - 8; b.box(x, z, 0.2, 0.2, 0, 2.6, '#E9E3D6'); b.spire(x, z, 4, 2.4, 1.2, cols[i % 5]); }
    b.box(30, -20, 4, 4, 0, 0.4, '#C9A227'); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(30 + sx * 1.6, -20 + sz * 1.6, 0.3, 0.3, 0, 4, '#E9E3D6');
    b.box(30, -20, 4, 4, 4, 2.2, '#E53935', '#F5F5F5');
    return b.done();
  },
  /** Eko Atlantic: a cluster of new glass towers by the Great Wall of Lagos */
  'eko-atlantic': () => {
    const b = new Builder();
    const towers: [number, number, number, number, number, string][] = [[-110, -60, 34, 30, 160, '#2B5E8C'], [-40, -90, 30, 30, 200, '#24374F'], [40, -60, 36, 28, 175, '#2E6FA8'], [110, -90, 30, 30, 140, '#1F4E6E'], [-70, 40, 40, 30, 120, '#3A5E9E'], [60, 50, 34, 34, 150, '#2B7F86']];
    towers.forEach(([x, z, w, d, h, col], i) => {
      b.box(x, z, w, d, 0, h, col, '#1B2A3D'); b.bands(x, z, w, d, 0, h, 4, 0.4, '#8FB8DC');
      b.box(x, z, w + 0.6, d + 0.6, h - 1, 0.6, ['#00F0FF', '#FF2BD6', '#FCEE0A', '#3DFF9A', '#9B6BFF', '#00F0FF'][i], ['#00F0FF', '#FF2BD6', '#FCEE0A', '#3DFF9A', '#9B6BFF', '#00F0FF'][i], true);
    });
    b.box(0, 120, 320, 10, 0, 6, '#9AA3AD', '#B8BFC7'); // the Great Wall of Lagos
    return b.done();
  },
  /** Murtala Muhammed Airport: the long terminal and its control tower */
  airport: () => {
    const b = new Builder();
    b.box(0, 0, 260, 50, 0, 18, '#E8E4DA', '#D6D0C4');
    b.bands(0, 0, 260, 50, 2, 18, 6, 4, '#2F5E8E');
    b.face([[-132, 20, -30], [132, 20, -30], [132, 22, 30], [-132, 22, 30]], '#F2F4F7', [0, 0, 0]);
    b.drum(110, 60, 5, 0, 52, '#E9E3D6', { seg: 12 });
    b.drum(110, 60, 9, 52, 7, '#2C4E6E', { r1: 10, seg: 12, lid: '#D6D0C4' });
    b.drum(110, 60, 10.2, 58.6, 0.5, '#00F0FF', { seg: 12, glow: true });
    b.box(0, 30.3, 120, 0.4, 19, 2, '#FCEE0A', '#FCEE0A', true);
    return b.done();
  },
  /** Ojuelegba: the flyover over the famous junction, billboards on its pillars */
  ojuelegba: () => {
    const b = new Builder();
    for (let x = -60; x <= 60; x += 20) { b.box(x, 0, 2.4, 3, 0, 8, '#B8B2A6'); }
    b.box(0, 0, 140, 16, 8, 1.6, '#9AA0A8', '#3D424A');
    for (const s of [-1, 1]) { b.box(0, s * 8.3, 140, 0.4, 9.2, 0.6, s < 0 ? '#FF2BD6' : '#00F0FF', s < 0 ? '#FF2BD6' : '#00F0FF', true); }
    for (const x of [-40, 0, 40]) { b.box(x, 12, 0.6, 0.6, 0, 14, '#7D858F'); b.box(x, 12, 14, 0.5, 14, 6, ['#E53935', '#F2C94C', '#1E88E5'][(x / 40 + 1) | 0]); }
    return b.done();
  },
  /** the Lekki-Ikoyi Link Bridge: its single pylon and fan of cables over the deck */
  'link-bridge': () => {
    const b = new Builder();
    b.box(0, 0, 4, 220, 9, 1.4, '#C9CED6', '#C9CED6');
    b.box(0, 0, 5, 6, 0, 9, '#B8B2A6');
    b.box(0, 0, 3, 3, 10, 80, '#E9EDF2', '#E9EDF2');
    for (let i = 1; i <= 8; i++) for (const s of [-1, 1]) {
      const z = s * i * 12;
      b.face([[0, 88 - i * 6, 0], [0, 87 - i * 6, 0], [0.2, 10.4, z], [-0.2, 10.4, z]], '#DDE3EA', [3, 40, 0]);
    }
    b.box(0, 0, 3.4, 3.4, 89, 1, '#00F0FF', '#00F0FF', true);
    return b.done();
  },
};

const built = new Map<string, Model>();
/** the 3D model for a landmark id, if it has one */
export function modelFor(id: string): Model | null {
  if (!MODELS[id]) return null;
  let m = built.get(id);
  if (!m) { m = MODELS[id](); built.set(id, m); }
  return m;
}
export const MODELLED = Object.keys(MODELS);

/** shade a colour by [k] (0..1+) */
const shades = new Map<string, string>();
function shade(color: string, k: number) {
  const key = color + k.toFixed(2);
  let s = shades.get(key);
  if (!s) {
    const n = parseInt(color.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
    s = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    shades.set(key, s);
  }
  return s;
}
const SUN = norm([-0.45, 0.8, 0.4]);

/**
 * The order to paint a model's solids in, seen from [vx, vy, vz] (towards the camera, in the model's own axes) with
 * the screen's sideways axis [sx, sz]. Two solids that overlap on screen are ordered by their boxes: if they lie apart
 * along an axis, the one on the camera's side of it is in front -- true from every angle, unlike sorting faces by
 * their middles, which let a roof or a buttress jump over a wall as the camera turned. Boxes that pass through each
 * other go by which reaches nearer the camera. The order only depends on the view direction, so it's kept per direction.
 */
const orders = new WeakMap<Model, Map<string, Int32Array>>();
function partOrder(model: Model, vx: number, vy: number, vz: number, sx: number, sz: number, plan: number, key: string): Int32Array {
  let m = orders.get(model);
  if (!m) { m = new Map(); orders.set(model, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const P = model.parts, n = P.length;
  // each solid's box on a unit screen: across (sx, sz), up the screen by depth (v) and height
  const bx0 = new Float64Array(n), bx1 = new Float64Array(n), by0 = new Float64Array(n), by1 = new Float64Array(n), mid = new Float64Array(n), reach = new Float64Array(n);
  const gx = Math.hypot(vx, vz) || 1, fx = vx / gx, fz = vz / gx; // ground direction towards the camera
  const tilt = vy, rise = gx;
  for (let i = 0; i < n; i++) {
    const q = P[i];
    if (!q) { bx0[i] = 1; bx1[i] = 0; continue; }
    const b = [q[0] * plan, q[1] * plan, q[2], q[3], q[4] * plan, q[5] * plan]; // (scaled in plan only)
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) {
      const across = x * sx + z * sz, toward = x * fx + z * fz, up = toward * tilt - y * rise; // screen y grows downwards
      if (across < a0) a0 = across; if (across > a1) a1 = across; if (-up < c0) c0 = -up; if (-up > c1) c1 = -up;
    }
    bx0[i] = a0; bx1[i] = a1; by0[i] = c0; by1[i] = c1;
    mid[i] = ((b[0] + b[1]) / 2) * vx + ((b[2] + b[3]) / 2) * vy + ((b[4] + b[5]) / 2) * vz;
    reach[i] = (vx > 0 ? b[1] : b[0]) * vx + (vz > 0 ? b[5] : b[4]) * vz; // how far across the ground it reaches towards the camera
  }
  const e = 1e-3;
  /** -1: i behind j, 1: j behind i */
  const rel = (i: number, j: number) => {
    const A = P[i], B = P[j];
    if (A[1] <= B[0] + e && Math.abs(vx) > e) return vx > 0 ? -1 : 1;
    if (B[1] <= A[0] + e && Math.abs(vx) > e) return vx > 0 ? 1 : -1;
    if (A[5] <= B[4] + e && Math.abs(vz) > e) return vz > 0 ? -1 : 1;
    if (B[5] <= A[4] + e && Math.abs(vz) > e) return vz > 0 ? 1 : -1;
    if (A[3] <= B[2] + e) return -1; // below, seen from above
    if (B[3] <= A[2] + e) return 1;
    // they pass through each other (a band round a tower, a buttress in a wall): the one reaching further out towards
    // the camera across the ground is in front -- the band wraps the tower all the way down, the buttress stands proud
    if (Math.abs(reach[i] - reach[j]) > e) return reach[i] < reach[j] ? -1 : 1;
    return mid[i] < mid[j] ? -1 : mid[i] > mid[j] ? 1 : 0;
  };
  const after: number[][] = Array.from({ length: n }, () => []), need = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (!P[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!P[j] || bx1[i] <= bx0[j] || bx1[j] <= bx0[i] || by1[i] <= by0[j] || by1[j] <= by0[i]) continue;
      const r = rel(i, j);
      if (r < 0) { after[i].push(j); need[j]++; } else if (r > 0) { after[j].push(i); need[i]++; }
    }
  }
  // farthest-first among the free; a loop (rare) is broken at its farthest
  const byMid = Array.from({ length: n }, (_, i) => i).sort((p, q) => mid[p] - mid[q]);
  const ready = byMid.filter((i) => need[i] === 0).reverse(), done = new Uint8Array(n), out: number[] = [];
  let k = 0;
  while (out.length < n) {
    let i: number;
    if (ready.length) i = ready.pop()!;
    else { while (done[byMid[k]]) k++; i = byMid[k]; }
    if (done[i]) continue;
    done[i] = 1; out.push(i);
    for (const j of after[i]) if (!done[j] && --need[j] === 0) {
      let q = ready.length;
      while (q > 0 && mid[ready[q - 1]] < mid[j]) q--;
      ready.splice(q, 0, j);
    }
  }
  const res = Int32Array.from(out);
  if (m.size > 64) m.clear();
  m.set(key, res);
  return res;
}

/**
 * Draws [model] standing at (x, z), its front turned to [heading] (a world angle, like the vehicles'), with the
 * camera [c]. [project] is the renderer's world-to-screen. [glow]: the night's glow layer, for the neon faces.
 * [size]: its plan's scale, fitting it to its real plot (its height stays true).
 */
export function drawModel(ctx: CanvasRenderingContext2D, c: { yaw: number; tilt: number; rise: number }, model: Model, x: number, z: number, heading: number,
  project: (x: number, z: number, y: number) => { sx: number; sy: number }, glow?: CanvasRenderingContext2D | null, size = 1) {
  const co = Math.cos(heading) * size, si = Math.sin(heading) * size;
  // the model's +z front faces along (sin h, cos h): world = (lx cos h + lz sin h, lz cos h - lx sin h), its plan times its size
  const toW = (lx: number, lz: number) => [x + lx * co + lz * si, z - lx * si + lz * co];
  const cs = Math.sin(c.yaw), cc = Math.cos(c.yaw);
  // towards the camera and the screen's sideways axis, in the model's own axes
  const hc = Math.cos(heading), hs = Math.sin(heading);
  const vx = (cs * hc - cc * hs) * c.rise, vz = (cs * hs + cc * hc) * c.rise, vy = c.tilt;
  const sx = Math.cos(c.yaw) * hc + Math.sin(c.yaw) * hs, sz = Math.cos(c.yaw) * hs - Math.sin(c.yaw) * hc;
  const key = `${Math.round(Math.atan2(vx, vz) * 400)}|${Math.round(c.tilt * 400)}|${size.toFixed(2)}`;
  const order = partOrder(model, vx, vy, vz, sx, sz, size, key);
  // the faces of each solid that face the camera
  const byPart = new Map<number, Face[]>();
  // a plan scaled on its own tips sloped faces (roofs, spires): their normals go as (nx / size, ny, nz / size)
  const tip = (f: Face) => { const a = f.n[0] / size, b = f.n[1], d = f.n[2] / size, l = Math.hypot(a, b, d) || 1; return [a / l, b / l, d / l]; };
  for (const f of model.faces) {
    const n = size === 1 ? f.n : tip(f);
    if (n[0] * vx + n[1] * vy + n[2] * vz <= 0.001) continue; // turned away
    const l = byPart.get(f.part);
    if (l) l.push(f); else byPart.set(f.part, [f]);
  }
  for (const part of order) {
    const fs = byPart.get(part);
    if (!fs) continue;
    for (const f of fs) {
      const p: { sx: number; sy: number }[] = [];
      for (let i = 0; i < f.p.length; i += 3) { const [wx, wz] = toW(f.p[i], f.p[i + 2]); p.push(project(wx, wz, f.p[i + 1])); }
      const n = size === 1 ? f.n : tip(f), nx = n[0] * hc + n[2] * hs, nz = -n[0] * hs + n[2] * hc, ny = n[1];
      const light = 0.74 + 0.34 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
      ctx.beginPath(); ctx.moveTo(p[0].sx, p[0].sy); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].sx, p[i].sy); ctx.closePath();
      ctx.fillStyle = f.glow ? f.color : shade(f.color, light);
      ctx.fill();
      // a lighter edge, like the paintings' bevelled stone (it also closes hairline gaps between faces)
      if (!f.glow) { ctx.strokeStyle = shade(f.color, light * 1.1 + 0.05); ctx.lineWidth = 0.8; ctx.stroke(); }
      if (glow) {
        // the glow layer: everything of the model blanks what's behind; its neon shines
        glow.beginPath(); glow.moveTo(p[0].sx, p[0].sy); for (let i = 1; i < p.length; i++) glow.lineTo(p[i].sx, p[i].sy); glow.closePath();
        if (f.glow) { glow.globalCompositeOperation = 'source-over'; glow.fillStyle = f.color; glow.fill(); }
        else { glow.globalCompositeOperation = 'destination-out'; glow.fillStyle = '#000'; glow.fill(); glow.globalCompositeOperation = 'source-over'; }
      }
    }
  }
}
