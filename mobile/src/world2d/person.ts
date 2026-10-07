/**
 * People, drawn and animated rather than pasted: a small rig (head, torso, two arms, two legs, feet)
 * in the clean-minimal look, with a real walk cycle -- legs stride, arms swing against them, the
 * body rises on each passing step and dips as a foot lands, the head nods a little. Four facings
 * (towards you, away, left, right). The same idea as the rigged walkers of the 3D city, in 2D.
 */
export type Facing = 'down' | 'up' | 'left' | 'right';
export type Look = {
  skin: string; hair: string; top: string; bottom: string; shoes: string;
  /** a wrapper skirt (ankara) instead of trousers, a gele headwrap, a kaftan (long top), a backpack */
  wrap?: string; gele?: string; kaftan?: boolean; pack?: string; load?: string;
};

const SKINS = ['#5A3825', '#6B4430', '#7C5038', '#8D5E42', '#4A2E1F', '#9C6B4B'];
const TOPS = ['#2F80ED', '#EB5757', '#27AE60', '#F2994A', '#9B51E0', '#FFFFFF', '#F2C94C', '#56CCF2', '#1E2A44'];
const BOTTOMS = ['#2D3142', '#4F5D75', '#1B263B', '#6D597A', '#3A5A40'];
const WRAPS = ['#E76F51', '#2A9D8F', '#E9C46A', '#8338EC', '#F15BB5', '#06D6A0'];

export const PLAYER_LOOK: Look = { skin: '#6B4430', hair: '#1A1110', top: '#F2C94C', bottom: '#263238', shoes: '#F5F5F5', pack: '#37474F' };

/** A believable Lagos passer-by from a seed. */
export function lookFor(seed: number): Look {
  const r = (n: number) => { seed = (seed * 16807) % 2147483647; return Math.floor((seed / 2147483647) * n); };
  const kind = r(5);
  const base: Look = { skin: SKINS[r(SKINS.length)], hair: '#1A1110', top: TOPS[r(TOPS.length)], bottom: BOTTOMS[r(BOTTOMS.length)], shoes: ['#222', '#6D4C41', '#EEE'][r(3)] };
  if (kind === 0) return { ...base, wrap: WRAPS[r(WRAPS.length)], gele: WRAPS[r(WRAPS.length)], top: WRAPS[r(WRAPS.length)] };  // woman in ankara and gele
  if (kind === 1) return { ...base, wrap: WRAPS[r(WRAPS.length)], load: '#C68642' };                                          // trader with a basin on her head
  if (kind === 2) return { ...base, kaftan: true, top: ['#FFFFFF', '#E0E0E0', '#B3E5FC', '#C8E6C9'][r(4)] };                   // man in a kaftan
  return base;                                                                                                               // shirt and trousers
}

export function facingOf(dx: number, dz: number): Facing {
  return Math.abs(dx) > Math.abs(dz) * 1.2 ? (dx < 0 ? 'left' : 'right') : dz < 0 ? 'up' : 'down';
}

function limb(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number, width: number, color: string) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(angle) * len, y + Math.cos(angle) * len); ctx.stroke();
  return { x: x + Math.sin(angle) * len, y: y + Math.cos(angle) * len };
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/**
 * Draws one person standing on (sx, sy) — their feet's point on the ground. [u] is pixels per
 * metre; [phase] advances one unit per stride (0..2 is a full cycle of both legs); null = standing.
 */
export function drawPerson(ctx: CanvasRenderingContext2D, sx: number, sy: number, u: number, look: Look, facing: Facing, phase: number | null) {
  const H = 1.75 * 1.75 * u; // stylised: a touch taller than life so people read at this zoom
  const t = (phase ?? 0) * Math.PI;
  const walking = phase != null;
  const swing = walking ? Math.sin(t) : 0;           // -1..1, which leg is forward
  const lift = walking ? Math.abs(Math.cos(t)) : 1;  // 1 when legs pass each other (body highest)
  const bob = walking ? (lift - 0.5) * H * 0.035 : 0;

  const hipY = sy - H * 0.47 - bob, shoulderY = sy - H * 0.8 - bob, headY = sy - H * 0.9 - bob;
  const legLen = H * 0.47, armLen = H * 0.33, legW = H * 0.085, armW = H * 0.06, bodyW = H * 0.22;

  // shadow, smaller as the body rises
  ctx.fillStyle = 'rgba(20,30,50,0.28)';
  ctx.beginPath(); ctx.ellipse(sx, sy, H * 0.17, H * 0.055, 0, 0, Math.PI * 2); ctx.fill();

  const side = facing === 'left' || facing === 'right';
  const dir = facing === 'left' ? -1 : 1;

  if (side) {
    // profile: legs and arms swing forward/back, far limbs darker, behind the body
    const legA = swing * 0.5 * dir, armA = -swing * 0.55 * dir;
    // far arm and leg
    limb(ctx, sx, shoulderY + armW, armLen, -armA, armW, shade(look.kaftan ? look.top : look.skin, 0.75));
    const farFoot = limb(ctx, sx, hipY, legLen * (1 - Math.max(0, -swing) * 0.06), -legA, legW, shade(look.wrap ? look.skin : look.bottom, 0.75));
    foot(ctx, farFoot.x, farFoot.y, dir, H, shade(look.shoes, 0.75));
    // near leg
    const nearFoot = limb(ctx, sx, hipY, legLen * (1 - Math.max(0, swing) * 0.06), legA, legW, look.wrap ? look.skin : look.bottom);
    foot(ctx, nearFoot.x, nearFoot.y, dir, H, look.shoes);
    body(ctx, sx, shoulderY, hipY, bodyW * 0.8, H, look, sy);
    if (look.pack) { ctx.fillStyle = look.pack; roundRect(ctx, sx - dir * bodyW * 0.62 - bodyW * 0.22, shoulderY + H * 0.02, bodyW * 0.44, H * 0.24, H * 0.04); ctx.fill(); }
    head(ctx, sx + dir * H * 0.01, headY, H, look, facing, walking ? Math.sin(t * 2) * 0.03 : 0);
    // near arm in front
    limb(ctx, sx, shoulderY + armW, armLen, armA, armW, look.kaftan ? look.top : look.skin);
    return;
  }

  // towards or away from you: legs step up and down in turn, arms swing in and out of depth
  const legSpread = H * 0.06;
  const stepL = walking ? Math.max(0, swing) * H * 0.05 : 0, stepR = walking ? Math.max(0, -swing) * H * 0.05 : 0;
  const lf = { x: sx - legSpread, y: sy - stepL }, rf = { x: sx + legSpread, y: sy - stepR };
  if (facing === 'up') { if (look.pack) {/* drawn on the back below */} }
  for (const [f, up] of [[lf, stepL], [rf, stepR]] as const) {
    ctx.strokeStyle = look.wrap ? look.skin : look.bottom; ctx.lineWidth = legW; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(f.x, hipY); ctx.lineTo(f.x, f.y - H * 0.02); ctx.stroke();
    ctx.fillStyle = look.shoes; ctx.beginPath(); ctx.ellipse(f.x, f.y - H * 0.015, legW * 0.75, legW * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    void up;
  }
  const armSwing = walking ? swing * 0.12 : 0;
  const armColor = look.kaftan ? look.top : look.skin;
  // arms: hanging at the sides, a little forward/back with the stride (shorter when swung towards or away)
  limb(ctx, sx - bodyW * 0.62, shoulderY + armW * 0.6, armLen * (1 - Math.abs(armSwing)), 0.08, armW, armColor);
  limb(ctx, sx + bodyW * 0.62, shoulderY + armW * 0.6, armLen * (1 - Math.abs(armSwing)), -0.08, armW, armColor);
  body(ctx, sx, shoulderY, hipY, bodyW, H, look, sy);
  if (look.pack && facing === 'up') { ctx.fillStyle = look.pack; roundRect(ctx, sx - bodyW * 0.42, shoulderY + H * 0.03, bodyW * 0.84, H * 0.26, H * 0.05); ctx.fill(); }
  if (look.pack && facing === 'down') { ctx.strokeStyle = look.pack; ctx.lineWidth = H * 0.025; ctx.beginPath(); ctx.moveTo(sx - bodyW * 0.35, shoulderY); ctx.lineTo(sx - bodyW * 0.3, shoulderY + H * 0.2); ctx.moveTo(sx + bodyW * 0.35, shoulderY); ctx.lineTo(sx + bodyW * 0.3, shoulderY + H * 0.2); ctx.stroke(); }
  head(ctx, sx, headY, H, look, facing, walking ? Math.sin(t * 2) * 0.02 : 0);
}

function foot(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, H: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x + dir * H * 0.03, y, H * 0.06, H * 0.028, 0, 0, Math.PI * 2); ctx.fill();
}

function body(ctx: CanvasRenderingContext2D, x: number, shoulderY: number, hipY: number, w: number, H: number, look: Look, groundY: number) {
  if (look.wrap) {
    // wrapper skirt from the waist to just above the ankle, flaring a little
    ctx.fillStyle = look.wrap;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, hipY - H * 0.03); ctx.lineTo(x + w * 0.5, hipY - H * 0.03);
    ctx.lineTo(x + w * 0.62, groundY - H * 0.09); ctx.lineTo(x - w * 0.62, groundY - H * 0.09); ctx.closePath(); ctx.fill();
    // a simple ankara band pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = H * 0.012;
    for (let i = 1; i <= 3; i++) { const yy = hipY + (groundY - hipY) * (i / 4) - H * 0.06; ctx.beginPath(); ctx.moveTo(x - w * 0.55, yy); ctx.lineTo(x + w * 0.55, yy); ctx.stroke(); }
  }
  ctx.fillStyle = look.top;
  const bottom = look.kaftan ? groundY - H * 0.12 : hipY + H * 0.03;
  roundRect(ctx, x - w / 2, shoulderY - H * 0.02, w, bottom - shoulderY + H * 0.02, H * 0.05);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  roundRect(ctx, x + w * 0.15, shoulderY - H * 0.02, w * 0.35, bottom - shoulderY + H * 0.02, H * 0.05); ctx.fill();
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, H: number, look: Look, facing: Facing, nod: number) {
  const r = H * 0.075;
  ctx.save(); ctx.translate(x, y); ctx.rotate(nod);
  ctx.fillStyle = look.skin; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  if (look.gele) {
    ctx.fillStyle = look.gele;
    ctx.beginPath(); ctx.ellipse(0, -r * 0.7, r * 1.45, r * 0.85, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.4, -r * 1.25, r * 0.9, r * 0.5, -0.4, 0, Math.PI * 2); ctx.fill();
  } else {
    // short hair: a cap over the top (more of it from behind)
    ctx.fillStyle = look.hair;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.02, Math.PI * (facing === 'up' ? 0.05 : 1.08), Math.PI * (facing === 'up' ? 0.95 : 1.92), facing === 'up'); ctx.fill();
    if (facing === 'up') { ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 1.02, Math.PI, 0); ctx.fill(); }
  }
  if (look.load) { ctx.fillStyle = look.load; ctx.beginPath(); ctx.ellipse(0, -r * 1.25, r * 1.6, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(-r * 0.4, -r * 1.55, r * 0.35, 0, Math.PI * 2); ctx.arc(r * 0.4, -r * 1.5, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
