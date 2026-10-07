import { AppState, type AppStateStatus } from 'react-native';
import { api } from './client';
import { shared } from './shared';
import type { StreamEvent } from './types';

type EventName = StreamEvent['event'];
type Listener = (data: unknown) => void;

// Live event bus for the app. The old Node backend pushed these over SSE (GET /api/stream);
// Serverpod has no equivalent endpoint, so each event is synthesized by polling the matching
// Serverpod read method and diffing against the last result. The event names and payloads are
// unchanged, so hooks.ts / alerts.ts subscribe exactly as before.
//
// A source only polls while something is subscribed to one of its events (so e.g. `profile`,
// the one auth-gated source, stops once the signed-in screens unmount) and pauses while the app
// is backgrounded. The first poll of each source just records a baseline -- the hooks already
// fetched their own initial data, so replaying it as "new" events would duplicate entries.
//
// Events with no Serverpod source (thinking/idle/thought/ingesting/ingest_error) never fire.
// `chat` is published locally by the sender via publish(), since a chat turn is only ever
// created by this client.

interface Source {
  events: EventName[];
  intervalMs: number;
  /** Returns the events to emit, given the state from the previous poll (undefined on the first). */
  poll: (state: unknown) => Promise<{ state: unknown; emit: [EventName, unknown][] }>;
}

// Serverpod timestamps are uniform ISO-8601 UTC strings (e.g. 2026-09-25T22:46:59.439666Z), so
// they order correctly as plain strings -- no Date.parse, whose handling of 6-digit fractional
// seconds varies by JS engine.
const newestOf = (items: { timestamp: string }[], floor = "") =>
  items.reduce((max, it) => (it.timestamp > max ? it.timestamp : max), floor);
const newerThan = <T extends { timestamp: string }>(items: T[], since: string) =>
  items.filter((it) => it.timestamp > since).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

/** Poll a timestamped list, emitting entries newer than the newest one already seen (oldest
 *  first, so hooks that prepend end up newest-first). */
function listSource<T extends { timestamp: string }>(
  event: EventName,
  intervalMs: number,
  fetch: () => Promise<T[]>,
): Source {
  return {
    events: [event],
    intervalMs,
    poll: async (state) => {
      const items = await fetch();
      if (state === undefined) return { state: newestOf(items), emit: [] };
      const fresh = newerThan(items, state as string);
      return {
        state: newestOf(items, state as string),
        emit: fresh.map((it): [EventName, unknown] => [event, it]),
      };
    },
  };
}

/** Poll a whole object, emitting it when its serialized form changes. */
function snapshotSource<T>(event: EventName, intervalMs: number, fetch: () => Promise<T>): Source {
  return {
    events: [event],
    intervalMs,
    poll: async (state) => {
      const value = await fetch();
      const key = JSON.stringify(value);
      return { state: key, emit: state !== undefined && state !== key ? [[event, value]] : [] };
    },
  };
}

// the diary, dreams and COP are the owner's: everyone else's app doesn't ask for them at all
const ownerOnly = <T,>(fetch: () => Promise<T[]>) => async (): Promise<T[]> =>
  (await shared('droneAccess', api.droneIsOperator).catch(() => false)) ? fetch() : [];

const SOURCES: Source[] = [
  // the same keyed requests the screens use, so a poll here and a screen opening never both ask
  snapshotSource('mind', 5000, () => shared('mind', api.mind)),
  snapshotSource('profile', 30000, () => shared('profile', api.profile)),
  listSource('ingested', 15000, () => shared('feed', api.feedRecent)),
  listSource('diary', 30000, ownerOnly(() => api.diary(5))),
  listSource('dream', 30000, ownerOnly(() => api.dreams(5))),
  listSource('cop_report', 30000, ownerOnly(() => api.copLog(5))),
  {
    events: ['self_modify'],
    intervalMs: 30000,
    poll: async (state) => {
      const { history } = await api.selfConfig();
      if (state === undefined) return { state: newestOf(history), emit: [] };
      const fresh = newerThan(history, state as string);
      return {
        state: newestOf(history, state as string),
        emit: fresh.map(({ timestamp: _ts, ...change }): [EventName, unknown] => ['self_modify', change]),
      };
    },
  },
];

class WyrdStream {
  private listeners = new Map<EventName, Set<Listener>>();
  private timers = new Map<Source, ReturnType<typeof setInterval>>();
  private states = new Map<Source, unknown>();
  private inFlight = new Set<Source>();
  private foreground = AppState.currentState !== 'background';

  constructor() {
    AppState.addEventListener('change', (next: AppStateStatus) => {
      const fg = next === 'active';
      if (fg === this.foreground) return;
      this.foreground = fg;
      SOURCES.forEach((s) => this.sync(s));
    });
  }

  subscribe(event: EventName, cb: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    this.syncFor(event);
    return () => {
      this.listeners.get(event)?.delete(cb);
      this.syncFor(event);
    };
  }

  /** Emit an event that originated on this client (e.g. a chat turn it just sent). */
  publish(event: EventName, data: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  private syncFor(event: EventName) {
    SOURCES.filter((s) => s.events.includes(event)).forEach((s) => this.sync(s));
  }

  /** Start or stop a source's timer to match whether it's wanted right now. */
  private sync(source: Source) {
    const wanted = this.foreground && source.events.some((e) => (this.listeners.get(e)?.size ?? 0) > 0);
    const running = this.timers.has(source);
    if (wanted && !running) {
      this.tick(source);
      this.timers.set(source, setInterval(() => this.tick(source), source.intervalMs));
    } else if (!wanted && running) {
      clearInterval(this.timers.get(source));
      this.timers.delete(source);
    }
  }

  private async tick(source: Source) {
    if (this.inFlight.has(source)) return;
    this.inFlight.add(source);
    try {
      const { state, emit } = await source.poll(this.states.get(source));
      this.states.set(source, state);
      emit.forEach(([event, data]) => this.publish(event, data));
    } catch {
      // transient failure (offline, signed out, server hiccup) -- keep the last baseline and
      // try again next interval
    } finally {
      this.inFlight.delete(source);
    }
  }
}

export const wyrdStream = new WyrdStream();
