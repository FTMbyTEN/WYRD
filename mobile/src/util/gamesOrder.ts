/** The order of the Games tab's cards WYRD was asked for (customize_app "games_order"), by name,
 *  kept on this device; the Games tab listens for a change. */
const KEY = 'wyrd.gamesOrder';
const EVENT = 'wyrd-games-order';

export function gamesOrder(): string[] {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
}

export function setGamesOrder(csv: string) {
  const names = csv.split(',').map((n) => n.trim()).filter(Boolean);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(names)); } catch { /* for now only */ }
  try { globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: names })); } catch { /* not on this platform */ }
}

export function onGamesOrder(fn: (names: string[]) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<string[]>).detail);
  try { globalThis.addEventListener?.(EVENT, h); } catch { /* not on this platform */ }
  return () => { try { globalThis.removeEventListener?.(EVENT, h); } catch { /* gone */ } };
}

/** [items] in that order; the ones it doesn't name keep their place after. */
export function inGamesOrder<T>(items: T[], name: (t: T) => string, order: string[]): T[] {
  const o = order.map((n) => n.toLowerCase());
  const rank = (t: T) => { const i = o.indexOf(name(t).toLowerCase()); return i < 0 ? o.length : i; };
  return items.map((t, i) => [t, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([t]) => t);
}
