import { Platform } from 'react-native';

/**
 * Whether this is a modest device: 4 GB of memory or less, 4 CPU cores or fewer, or the person
 * asked their system to reduce motion. On these WYRD skips purely decorative animation (the
 * full-screen rain) and draws its living visuals at a gentler frame rate, so it stays smooth
 * on low-end phones and laptops.
 */
function detect(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowMemory = nav.deviceMemory != null && nav.deviceMemory <= 4;
  const fewCores = nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 4;
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return lowMemory || fewCores || Boolean(reducedMotion);
}

export const LITE = detect();

/** Frame rate for Skia animations. */
export const ANIMATION_FPS = LITE ? 20 : 30;

/** Frame rate for a visual that is the whole screen (the gate vortex): the display's own rate. */
export const SMOOTH_FPS = LITE ? 30 : 60;
