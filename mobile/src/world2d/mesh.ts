/**
 * Landmarks as real 3D models, drawn by the 2D canvas: each is a list of flat faces in metres (front towards +z,
 * standing on y = 0), turned to its real footprint and placed on its plot. Faces turned away from the camera are
 * skipped, the rest painted far to near and shaded by a fixed sun -- so a landmark lines up with its streets at every
 * camera angle and stays sharp at any zoom. Neon faces ([glow]) also shine on the night's glow layer.
 */
export type Face = { p: number[]; n: [number, number, number]; color: string; glow?: boolean };
export type Model = { faces: Face[]; height: number; radius: number };

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** builds a model from primitives; every face's normal points away from the primitive's own centre */
class Builder {
  faces: Face[] = [];
  private top = 0; private far = 0;
  face(pts: V3[], color: string, centre: V3, glow = false) {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const c: V3 = [0, 0, 0]; for (const q of pts) { c[0] += q[0] / pts.length; c[1] += q[1] / pts.length; c[2] += q[2] / pts.length; }
    const out = sub(c, centre);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    this.faces.push({ p: pts.flat(), n, color, glow });
    for (const q of pts) { this.top = Math.max(this.top, q[1]); this.far = Math.max(this.far, Math.hypot(q[0], q[2])); }
  }
  /** a box: centre (x, z), size w (x) by d (z), from y0 up h; [roof] colour for its top */
  box(x: number, z: number, w: number, d: number, y0: number, h: number, color: string, roof = color, glow = false) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h, c: V3 = [x, y0 + h / 2, z];
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color, c, glow);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], color, c, glow);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], color, c, glow);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], color, c, glow);
    this.face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], roof, c, glow);
  }
  /** a cylinder or a frustum (r0 at the bottom, r1 at the top), with an optional lid */
  drum(x: number, z: number, r0: number, y0: number, h: number, color: string, opts: { r1?: number; seg?: number; lid?: string; glow?: boolean } = {}) {
    const seg = opts.seg ?? 24, r1 = opts.r1 ?? r0, y1 = y0 + h, c: V3 = [x, y0 + h / 2, z];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.face([[x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0], [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1], [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1]], color, [x, y0 + h / 2, z], opts.glow);
    }
    if (opts.lid && r1 > 0.01) this.face(Array.from({ length: seg }, (_, i): V3 => { const a = (i / seg) * Math.PI * 2; return [x + Math.cos(a) * r1, y1, z + Math.sin(a) * r1]; }), opts.lid, [x, y1 - 1, z]);
    void c;
  }
  /** a dome (half sphere) of radius r sitting at y0 */
  dome(x: number, z: number, r: number, y0: number, color: string, seg = 20, rings = 6) {
    for (let j = 0; j < rings; j++) {
      const t0 = (j / rings) * Math.PI / 2, t1 = ((j + 1) / rings) * Math.PI / 2;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const P = (t: number, a: number): V3 => [x + Math.cos(a) * Math.cos(t) * r, y0 + Math.sin(t) * r, z + Math.sin(a) * Math.cos(t) * r];
        this.face(j === rings - 1 ? [P(t0, a0), P(t0, a1), P(t1, a0)] : [P(t0, a0), P(t0, a1), P(t1, a1), P(t1, a0)], color, [x, y0, z]);
      }
    }
  }
  /** a pyramid or spire: square base w at y0, point h above */
  spire(x: number, z: number, w: number, y0: number, h: number, color: string) {
    const s = w / 2, top: V3 = [x, y0 + h, z], c: V3 = [x, y0 + h / 4, z];
    const b: V3[] = [[x - s, y0, z - s], [x + s, y0, z - s], [x + s, y0, z + s], [x - s, y0, z + s]];
    for (let i = 0; i < 4; i++) this.face([b[i], b[(i + 1) % 4], top], color, c);
  }
  /** a gabled roof along z: base w by d at y0, ridge h above */
  gable(x: number, z: number, w: number, d: number, y0: number, h: number, color: string) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h, c: V3 = [x, y0, z];
    this.face([[x0, y0, z0], [x0, y0, z1], [x, y1, z1], [x, y1, z0]], color, c);
    this.face([[x1, y0, z1], [x1, y0, z0], [x, y1, z0], [x, y1, z1]], color, c);
    this.face([[x0, y0, z1], [x1, y0, z1], [x, y1, z1]], color, c);
    this.face([[x1, y0, z0], [x0, y0, z0], [x, y1, z0]], color, c);
  }
  /** floor bands round a box: a slightly proud dark strip every [every] m (windows), from y0 to y1 */
  bands(x: number, z: number, w: number, d: number, y0: number, y1: number, every: number, tall: number, color: string) {
    for (let y = y0 + every * 0.4; y + tall < y1; y += every) this.box(x, z, w + 0.3, d + 0.3, y, tall, color, color);
  }
  done(): Model { return { faces: this.faces, height: this.top, radius: this.far }; }
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
  /** the Cathedral Church of Christ, Marina: a Gothic nave with a tall tower and spire at the west front */
  cathedral: () => {
    const b = new Builder(), stone = '#B9A88C', roof = '#5E534A', dark = '#2F2A26';
    b.box(0, -4, 18, 46, 0, 15, stone, roof);
    b.gable(0, -4, 18, 46, 15, 8, roof);
    for (const s of [-1, 1]) { b.box(s * 13, -6, 8, 38, 0, 9, '#AE9D82', roof); for (let z = -22; z <= 10; z += 6) b.box(s * 9.1, z, 0.4, 2.2, 5, 7, dark); }
    b.box(0, 24, 13, 13, 0, 36, stone, '#A49377');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.spire(sx * 5.6, 24 + sz * 5.6, 1.6, 36, 6, '#8E7F68');
    b.spire(0, 24, 10, 36, 24, '#6B6156');
    b.box(0, 30.6, 3, 0.4, 2, 7, dark); b.box(0, 30.6, 4.5, 0.4, 16, 5, dark);
    b.box(0, 30.8, 1.2, 0.4, 28, 1.2, '#00F0FF', '#00F0FF', true);
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
 * Draws [model] standing at (x, z), its front turned to [heading] (a world angle, like the vehicles'), with the
 * camera [c]. [project] is the renderer's world-to-screen. [glow]: the night's glow layer, for the neon faces.
 */
export function drawModel(ctx: CanvasRenderingContext2D, c: { yaw: number; tilt: number; rise: number }, model: Model, x: number, z: number, heading: number,
  project: (x: number, z: number, y: number) => { sx: number; sy: number }, glow?: CanvasRenderingContext2D | null) {
  const co = Math.cos(heading), si = Math.sin(heading);
  // the model's +z front faces along (sin h, cos h): world = (lx cos h + lz sin h, lz cos h - lx sin h)
  const toW = (lx: number, lz: number) => [x + lx * co + lz * si, z - lx * si + lz * co];
  const cs = Math.sin(c.yaw), cc = Math.cos(c.yaw);
  const toCam: V3 = [cs * c.rise, c.tilt, cc * c.rise];
  const list: { d: number; f: Face; pts: { sx: number; sy: number }[]; light: number }[] = [];
  for (const f of model.faces) {
    const nx = f.n[0] * co + f.n[2] * si, nz = -f.n[0] * si + f.n[2] * co, ny = f.n[1];
    if (nx * toCam[0] + ny * toCam[1] + nz * toCam[2] <= 0.001) continue; // turned away
    const pts: { sx: number; sy: number }[] = [];
    let d = 0;
    for (let i = 0; i < f.p.length; i += 3) {
      const [wx, wz] = toW(f.p[i], f.p[i + 2]), wy = f.p[i + 1];
      pts.push(project(wx, wz, wy));
      d += (cs * (wx - x) + cc * (wz - z)) * c.rise + wy * c.tilt;
    }
    const light = 0.62 + 0.42 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
    list.push({ d: d / pts.length, f, pts, light });
  }
  list.sort((a, b) => a.d - b.d);
  for (const it of list) {
    const p = it.pts;
    ctx.beginPath(); ctx.moveTo(p[0].sx, p[0].sy); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].sx, p[i].sy); ctx.closePath();
    ctx.fillStyle = it.f.glow ? it.f.color : shade(it.f.color, it.light);
    ctx.fill();
    if (!it.f.glow) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke(); } // (closes hairline gaps between faces)
    if (glow) {
      // the glow layer: everything of the model blanks what's behind; its neon shines
      glow.beginPath(); glow.moveTo(p[0].sx, p[0].sy); for (let i = 1; i < p.length; i++) glow.lineTo(p[i].sx, p[i].sy); glow.closePath();
      if (it.f.glow) { glow.globalCompositeOperation = 'source-over'; glow.fillStyle = it.f.color; glow.fill(); }
      else { glow.globalCompositeOperation = 'destination-out'; glow.fillStyle = '#000'; glow.fill(); glow.globalCompositeOperation = 'source-over'; }
    }
  }
}
