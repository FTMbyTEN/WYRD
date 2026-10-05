import { LITE } from '../util/perf';

/**
 * Graphics tiers for the open world. AUTO starts at a tier suited to the device and steps down if
 * frames run slow (and up once if there's plenty of headroom); a person can pin a tier instead.
 *
 *  low:  no real-time shadows, no bloom, 0.75x resolution, near tiles + one far ring. Still shaded:
 *        the light baked into the city's vertex colours and the facade shader carry it.
 *  mid:  a 1024 sun shadow over ~60 m round you, refreshed every 3rd frame; no bloom.
 *  high: shadow refreshed every 2nd frame, half-resolution bloom, a wider far ring.
 */
export type Tier = 'low' | 'mid' | 'high';
export type GfxChoice = 'auto' | Tier;

export const TIERS: Record<Tier, { dpr: number; shadows: boolean; shadowEvery: number; bloom: boolean; far: number; fog: number; people: number; vehicles: number }> = {
  low: { dpr: 0.75, shadows: false, shadowEvery: 0, bloom: false, far: 1, fog: 520, people: 14, vehicles: 12 },
  mid: { dpr: 1.0, shadows: true, shadowEvery: 3, bloom: false, far: 2, fog: 700, people: 22, vehicles: 18 },
  high: { dpr: 1.5, shadows: true, shadowEvery: 2, bloom: true, far: 3, fog: 950, people: 30, vehicles: 24 },
};

/** A phone (touch screen): the game starts on Low, and Low is lighter still -- a lower resolution, a
 *  closer haze (fewer tiles drawn), fewer cars. Phones run hot and their GPUs share the battery. */
export const PHONE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
if (PHONE) Object.assign(TIERS.low, { dpr: 0.6, fog: 380, people: 8, vehicles: 8 });

const KEY = 'wyrd.world.gfx';
export function loadChoice(): GfxChoice {
  try { const v = localStorage.getItem(KEY); if (v === 'auto' || v === 'low' || v === 'mid' || v === 'high') return v; } catch { /* no storage */ }
  return 'auto';
}
export function saveChoice(c: GfxChoice) { try { localStorage.setItem(KEY, c); } catch { /* no storage */ } }
export const startTier = (c: GfxChoice): Tier => (c !== 'auto' ? c : LITE || PHONE ? 'low' : 'mid');

/**
 * Watches frame times. After a settling period it averages ~2 s of frames: over 26 ms (under
 * ~38 fps) it steps down; a steady 60 fps on mid tries high once. Returns the new tier, or null.
 */
export class AutoTier {
  private samples: number[] = [];
  private since = 0;
  private triedUp = false;
  constructor(public tier: Tier) {}
  sample(ms: number, now: number, busy: boolean): Tier | null {
    if (busy) { this.samples.length = 0; this.since = now; return null; } // building tiles: not a fair measure
    if (now - this.since < 1500) return null;
    this.samples.push(ms);
    if (this.samples.length < 120) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const avg = sorted.slice(10, -10).reduce((a, b) => a + b, 0) / (sorted.length - 20);
    this.samples.length = 0;
    this.since = now;
    if (avg > 26 && this.tier !== 'low') return (this.tier = this.tier === 'high' ? 'mid' : 'low');
    if (avg < 17.5 && this.tier === 'mid' && !this.triedUp) { this.triedUp = true; return (this.tier = 'high'); }
    return null;
  }
}
