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
  /** a work uniform: a hi-vis vest over the top, a cap with a peak */
  vest?: string; cap?: string;
  /** not a person: a WYRD unit (a hovering robot), its lights in this colour */
  bot?: string;
};
/** what someone's hands are doing: waving traffic on, sweeping, holding out a tray of goods, on the phone */
export type Pose = 'wave' | 'sweep' | 'hold' | 'phone';
/** goods on a vendor's tray (colours of what's on it) */
const TRAY = ['#F2C94C', '#E53935', '#FFFFFF', '#6D4C41'];

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
export function drawPerson(ctx: CanvasRenderingContext2D, sx: number, sy: number, u: number, look: Look, facing: Facing, phase: number | null, pose?: Pose, time = 0) {
  const H = 1.75 * 1.75 * u; // stylised: a touch taller than life so people read at this zoom
  if (look.bot) { drawBot(ctx, sx, sy, H, look.bot, facing, pose, time); return; }
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
    // near arm in front: swinging with the walk, or at work
    const armC = look.kaftan ? look.top : look.skin;
    if (pose === 'wave') limb(ctx, sx, shoulderY + armW, armLen, dir * (Math.PI * 0.72 + Math.sin(time * 5) * 0.35), armW, armC);
    else if (pose === 'phone') limb(ctx, sx, shoulderY + armW, armLen * 0.75, dir * Math.PI * 0.86, armW, armC);
    else if (pose === 'sweep' || pose === 'hold') {
      const hand = limb(ctx, sx, shoulderY + armW, armLen, dir * (pose === 'hold' ? 1.25 : 0.55), armW, armC);
      if (pose === 'hold') tray(ctx, hand.x + dir * H * 0.05, hand.y, H);
      else broom(ctx, hand.x, hand.y, sy, H, Math.sin(time * 3.2) * dir);
    } else limb(ctx, sx, shoulderY + armW, armLen, armA, armW, armC);
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
  const atWork = pose === 'sweep' || pose === 'hold';
  if (!atWork) {
    limb(ctx, sx - bodyW * 0.62, shoulderY + armW * 0.6, armLen * (1 - Math.abs(armSwing)), 0.08, armW, armColor);
    if (pose === 'wave') limb(ctx, sx + bodyW * 0.62, shoulderY + armW * 0.6, armLen, -(Math.PI * 0.72 + Math.sin(time * 5) * 0.35), armW, armColor);
    else if (pose === 'phone') limb(ctx, sx + bodyW * 0.62, shoulderY + armW * 0.6, armLen * 0.7, -Math.PI * 0.9, armW, armColor);
    else limb(ctx, sx + bodyW * 0.62, shoulderY + armW * 0.6, armLen * (1 - Math.abs(armSwing)), -0.08, armW, armColor);
  }
  body(ctx, sx, shoulderY, hipY, bodyW, H, look, sy);
  if (atWork && facing !== 'up') {
    // both hands out in front: holding the tray, or the broom
    const l = limb(ctx, sx - bodyW * 0.62, shoulderY + armW * 0.6, armLen * 0.85, 0.45, armW, armColor);
    const rr = limb(ctx, sx + bodyW * 0.62, shoulderY + armW * 0.6, armLen * 0.85, -0.45, armW, armColor);
    if (pose === 'hold') tray(ctx, (l.x + rr.x) / 2, (l.y + rr.y) / 2, H);
    else broom(ctx, (l.x + rr.x) / 2, (l.y + rr.y) / 2, sy, H, Math.sin(time * 3.2));
  } else if (atWork) {
    limb(ctx, sx - bodyW * 0.62, shoulderY + armW * 0.6, armLen * 0.85, 0.2, armW, armColor);
    limb(ctx, sx + bodyW * 0.62, shoulderY + armW * 0.6, armLen * 0.85, -0.2, armW, armColor);
  }
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
  if (look.vest) {
    // the hi-vis vest, with its silver reflective bands
    ctx.fillStyle = look.vest;
    roundRect(ctx, x - w * 0.52, shoulderY - H * 0.015, w * 1.04, hipY - shoulderY + H * 0.02, H * 0.04); ctx.fill();
    ctx.fillStyle = 'rgba(235,240,245,0.95)';
    ctx.fillRect(x - w * 0.52, shoulderY + (hipY - shoulderY) * 0.45, w * 1.04, H * 0.022);
    ctx.fillRect(x - w * 0.52, shoulderY + (hipY - shoulderY) * 0.75, w * 1.04, H * 0.022);
  }
}

/**
 * A WYRD unit: a small robot hovering a hand's breadth off the ground on a glowing thruster -- a tapered hover pod, a
 * white shell with a hi-vis band and WYRD's yellow W, a head with a lit visor and a blinking antenna. Working traffic
 * ('wave'), one arm sweeps an orange light wand.
 */
function drawBot(ctx: CanvasRenderingContext2D, sx: number, sy: number, H: number, accent: string, facing: Facing, pose: Pose | undefined, time: number) {
  const hover = H * 0.07 + Math.sin(time * 2.2) * H * 0.015, base = sy - hover;
  const side = facing === 'left' || facing === 'right', dir = facing === 'left' ? -1 : 1;
  // the thruster's glow on the ground, and a soft shadow
  ctx.fillStyle = 'rgba(0,240,255,0.22)'; ctx.beginPath(); ctx.ellipse(sx, sy, H * 0.2, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,30,50,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, H * 0.11, H * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  // hover pod, narrow at the thruster
  ctx.fillStyle = '#2A3240';
  ctx.beginPath(); ctx.moveTo(sx - H * 0.06, base); ctx.lineTo(sx + H * 0.06, base); ctx.lineTo(sx + H * 0.12, base - H * 0.38); ctx.lineTo(sx - H * 0.12, base - H * 0.38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(sx, base, H * 0.07, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();
  // the shell
  const top = base - H * 0.8, bot = base - H * 0.36, w = side ? H * 0.24 : H * 0.3;
  const arm = (x: number, a: number, wand: boolean) => {
    const hand = limb(ctx, x, top + H * 0.06, H * 0.27, a, H * 0.055, '#C9D2DC');
    if (!wand) return;
    // the light wand: a soft glow, then the bright core
    const ex = hand.x + Math.sin(a) * H * 0.2, ey = hand.y + Math.cos(a) * H * 0.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,122,26,0.35)'; ctx.lineWidth = H * 0.08; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#FFB066'; ctx.lineWidth = H * 0.03; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(ex, ey); ctx.stroke();
  };
  const waveA = Math.PI * 0.72 + Math.sin(time * 5) * 0.35;
  // the far arm behind the shell
  if (side) arm(sx, -dir * 0.15, false); else arm(sx - w / 2, 0.12, false);
  ctx.fillStyle = '#E9EEF3'; roundRect(ctx, sx - w / 2, top, w, bot - top, H * 0.06); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = H * 0.012; ctx.stroke();
  ctx.fillStyle = '#F2C94C'; ctx.fillRect(sx - w / 2 + H * 0.01, top + (bot - top) * 0.72, w - H * 0.02, H * 0.035); // the hi-vis band
  if (facing !== 'up') {
    ctx.fillStyle = '#FCEE0A'; ctx.font = `700 ${Math.max(6, H * 0.17)}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('W', sx + (side ? dir * H * 0.03 : 0), top + (bot - top) * 0.38);
  }
  // the head: dark, with a lit visor towards where it looks, and a blinking antenna
  const hy = top - H * 0.11;
  ctx.fillStyle = '#2A3240'; roundRect(ctx, sx - H * 0.1, hy - H * 0.08, H * 0.2, H * 0.15, H * 0.05); ctx.fill();
  if (facing !== 'up') { ctx.fillStyle = accent; roundRect(ctx, sx - H * 0.075 + (side ? dir * H * 0.03 : 0), hy - H * 0.035, side ? H * 0.11 : H * 0.15, H * 0.045, H * 0.02); ctx.fill(); }
  ctx.strokeStyle = '#2A3240'; ctx.lineWidth = H * 0.015; ctx.beginPath(); ctx.moveTo(sx, hy - H * 0.08); ctx.lineTo(sx, hy - H * 0.16); ctx.stroke();
  ctx.fillStyle = (time * 1.5) % 1 < 0.5 ? '#FF003C' : '#4A0012'; ctx.beginPath(); ctx.arc(sx, hy - H * 0.17, H * 0.022, 0, Math.PI * 2); ctx.fill();
  // the near arm, waving the traffic on with its wand
  const wave = pose === 'wave';
  if (side) arm(sx, wave ? dir * waveA : dir * 0.15, wave); else arm(sx + w / 2, wave ? -waveA : -0.12, wave);
}

/** a vendor's tray at the hands, piled with goods */
function tray(ctx: CanvasRenderingContext2D, x: number, y: number, H: number) {
  const w = H * 0.34;
  ctx.fillStyle = '#8D6E63'; roundRect(ctx, x - w / 2, y - H * 0.03, w, H * 0.045, H * 0.01); ctx.fill();
  for (let i = 0; i < 4; i++) { ctx.fillStyle = TRAY[i]; ctx.fillRect(x - w * 0.42 + i * w * 0.22, y - H * 0.065, w * 0.17, H * 0.04); }
}
/** a long broom from the hands to the ground, swept side to side by [sw] (-1..1) */
function broom(ctx: CanvasRenderingContext2D, hx: number, hy: number, groundY: number, H: number, sw: number) {
  const bx = hx + sw * H * 0.18, by = groundY - H * 0.02;
  ctx.strokeStyle = '#A1887F'; ctx.lineWidth = H * 0.018; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy - H * 0.08); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = '#D7B56D'; ctx.lineWidth = H * 0.012;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(bx, by - H * 0.05); ctx.lineTo(bx + i * H * 0.022 + sw * H * 0.02, by + H * 0.012); ctx.stroke(); }
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
  if (look.cap) {
    // a uniform cap: crown and a peak towards where they face
    ctx.fillStyle = look.cap;
    ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 1.08, r * 0.62, 0, Math.PI, 0); ctx.fill();
    const peak = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
    ctx.beginPath(); ctx.ellipse(peak * r * 0.75, -r * 0.5, r * (peak ? 0.75 : 1.15), r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (look.load) { ctx.fillStyle = look.load; ctx.beginPath(); ctx.ellipse(0, -r * 1.25, r * 1.6, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(-r * 0.4, -r * 1.55, r * 0.35, 0, Math.PI * 2); ctx.arc(r * 0.4, -r * 1.5, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
