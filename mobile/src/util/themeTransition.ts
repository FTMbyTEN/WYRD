/**
 * The change between light and dark (web), as a timelapse: a day sped up over the page. Going dark,
 * the cream warms to golden hour, the sun sinks through orange and violet dusk, the stars come out
 * and it settles into WYRD's night; going light, the same run backwards -- a sunrise. Then the page
 * reloads in the new theme and fades in out of the sky's last colour. One small canvas (a gradient,
 * a sun, a few hundred stars). Reduced motion: a quick fade.
 */

const ARRIVAL = 'wyrd.themeIn';
type RGB = [number, number, number];

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t: number) => t * t * (3 - 2 * t);

// The sky over a day's end: [progress, top of the sky, the horizon]. 0 = WYRD's day, 1 = its night.
function skyStops(day: string, night: string): [number, RGB, RGB][] {
  return [
    [0.0, rgb(day), rgb(day)],
    [0.22, rgb('#F6DDB0'), rgb('#F4C27A')], // golden hour
    [0.45, rgb('#C7745E'), rgb('#EE8A4A')], // sunset
    [0.66, rgb('#4A3358'), rgb('#B4584A')], // dusk
    [0.84, rgb('#1E1A2B'), rgb('#3A2533')], // last light
    [1.0, rgb(night), rgb(night)],
  ];
}

function skyAt(stops: [number, RGB, RGB][], p: number): [RGB, RGB] {
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const [p0, t0, h0] = stops[i - 1], [p1, t1, h1] = stops[i];
      const k = smooth((p - p0) / (p1 - p0));
      return [mix(t0, t1, k), mix(h0, h1, k)];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2]];
}

const hash = (i: number) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };

/**
 * Leaving: the timelapse from WYRD's [day] colour to its [night] (or the reverse when [toDark] is
 * false), over the page; then [done] (the reload).
 */
export function timelapseTheme(day: string, night: string, toDark: boolean, done: () => void) {
  const W = window.innerWidth, H = window.innerHeight;
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;opacity:0';
  document.body.appendChild(cv);
  const x = cv.getContext('2d')!;
  x.scale(dpr, dpr);
  const end = toDark ? night : day;
  if (reduced()) {
    x.fillStyle = end; x.fillRect(0, 0, W, H);
    cv.style.transition = 'opacity 200ms ease';
    requestAnimationFrame(() => { cv.style.opacity = '1'; });
    setTimeout(done, 220);
    return;
  }
  const stops = skyStops(day, night);
  const stars = Array.from({ length: Math.round(Math.min(380, (W * H) / 4000)) }, (_, i) => ({
    x: hash(i) * W, y: hash(i + 9) * H * 0.85, r: 0.5 + hash(i + 3) * 1.3, at: 0.55 + hash(i + 5) * 0.35, tw: hash(i + 7) * 6,
  }));
  const MS = 1450, FADE_IN = 180;
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - t0) / MS);
    cv.style.opacity = String(Math.min(1, (now - t0) / FADE_IN)); // the page gives way to the sky
    const p = toDark ? t : 1 - t; // how far into the night
    const [top, horizon] = skyAt(stops, p);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(top));
    g.addColorStop(1, css(horizon));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // the sun, sinking (or rising) on a low arc, its glow fading with the light
    const sunP = Math.min(1, p / 0.8);
    const sx = W * (0.3 + 0.4 * sunP), sy = H * (0.28 + 0.85 * sunP * sunP);
    const sr = Math.min(W, H) * 0.07;
    const glowA = 0.55 * (1 - Math.max(0, (p - 0.55) / 0.3));
    if (glowA > 0) {
      const glow = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 6);
      glow.addColorStop(0, `rgba(255,214,150,${glowA})`);
      glow.addColorStop(1, 'rgba(255,214,150,0)');
      x.fillStyle = glow;
      x.fillRect(0, 0, W, H);
      x.fillStyle = css(mix(rgb('#FFF1D6'), rgb('#F07A3C'), Math.min(1, p / 0.6)), Math.min(1, glowA * 2));
      x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
    }
    // the stars come out (or go in), each in its own moment, twinkling
    for (const s of stars) {
      const a = Math.max(0, Math.min(1, (p - s.at) / 0.12));
      if (a <= 0) continue;
      x.fillStyle = `rgba(255,244,226,${a * (0.65 + 0.35 * Math.sin(now * 0.008 + s.tw))})`;
      x.beginPath(); x.arc(s.x, s.y, s.r, 0, Math.PI * 2); x.fill();
    }
    if (t < 1) requestAnimationFrame(frame);
    else { x.fillStyle = end; x.fillRect(0, 0, W, H); done(); }
  };
  requestAnimationFrame(frame);
}

/** Before a theme-change reload: the next page fades in out of the sky's last colour. */
export function markArrival() {
  try { sessionStorage.setItem(ARRIVAL, '1'); } catch { /* it will just appear */ }
}

let cover: HTMLDivElement | null = null;

/** On load, after a theme change: hold the new background over the page until the app is drawn. */
export function startArrival(color: string) {
  if (typeof document === 'undefined') return;
  try {
    if (sessionStorage.getItem(ARRIVAL) == null) return;
    sessionStorage.removeItem(ARRIVAL);
  } catch { return; }
  const v = document.createElement('div');
  v.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${color}`;
  document.body.appendChild(v);
  cover = v;
  setTimeout(() => revealArrival(), 6000); // never leave it up if the app is slow to draw
}

/** The app is drawn: the cover fades away to show it. */
export function revealArrival() {
  const v = cover;
  if (!v) return;
  cover = null;
  v.style.transition = `opacity ${reduced() ? 200 : 460}ms cubic-bezier(0.65, 0, 0.35, 1)`;
  requestAnimationFrame(() => { v.style.opacity = '0'; });
  setTimeout(() => v.remove(), 520);
}
