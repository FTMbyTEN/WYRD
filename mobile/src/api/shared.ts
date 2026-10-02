// One request layer for the whole app: screens (hooks.ts) and the live-update poller (stream.ts)
// ask through here, so the same data is never fetched twice at once, a value fetched a moment ago
// is reused, and every screen showing it hears each new value whoever fetched it.

// the last value each keyed fetch returned, so a screen opened again (or prefetched) shows at once
export const cache = new Map<string, unknown>();
const cachedAt = new Map<string, number>();
// requests already on their way: a second asker waits on the first
const inflight = new Map<string, Promise<unknown>>();
// data younger than this is reused when a screen opens, instead of fetched again
export const FRESH_MS = 4000;
// one poll serves every screen: each new value is handed to all of them
export const listeners = new Map<string, Set<(v: unknown) => void>>();

export function shared<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const going = inflight.get(key);
  if (going) return going as Promise<T>;
  const p = fetcher()
    .then((v) => {
      cache.set(key, v);
      cachedAt.set(key, Date.now());
      listeners.get(key)?.forEach((l) => l(v));
      return v;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const fresh = (key?: string, within = FRESH_MS) => !!key && Date.now() - (cachedAt.get(key) ?? 0) < within;
