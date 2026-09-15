import EventSource, { type EventSourceListener } from 'react-native-sse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from './client';
import type { StreamEvent } from './types';

type EventName = StreamEvent['event'];
type Listener = (data: unknown) => void;

// One shared connection to GET /api/stream (requireAuth-gated), fanned out to any number of
// subscribers via a tiny pub/sub. Reconnects with backoff on error since a phone's network drops
// far more often than a browser tab's does.
class WyrdStream {
  private es: EventSource<EventName> | null = null;
  private listeners = new Map<EventName, Set<Listener>>();
  private retryMs = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  async start() {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private async connect() {
    const sid = await AsyncStorage.getItem('wyrd_sid');
    const headers: Record<string, string> = {};
    if (sid) headers.Cookie = `sid=${sid}`;

    this.es = new EventSource<EventName>(`${BASE_URL}/api/stream`, {
      headers,
      pollingInterval: 0, // no auto-reconnect polling — we drive our own backoff below
    });

    const names: EventName[] = [
      'mind', 'thinking', 'idle', 'thought', 'self_modify', 'cop_report',
      'diary', 'dream', 'ingesting', 'ingested', 'ingest_error', 'profile', 'chat',
    ];
    names.forEach((name) => {
      this.es!.addEventListener(name, ((event: { data?: string | null }) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data);
          this.emit(name, parsed);
        } catch {
          // ignore malformed frame
        }
      }) as EventSourceListener<EventName>);
    });

    this.es.addEventListener('open', () => {
      this.retryMs = 1000;
    });
    this.es.addEventListener('error', () => {
      this.reconnectSoon();
    });
  }

  private reconnectSoon() {
    this.es?.close();
    this.es = null;
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryMs = Math.min(this.retryMs * 2, 30000);
      this.connect();
    }, this.retryMs);
  }

  stop() {
    this.started = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.es?.close();
    this.es = null;
  }

  // Call after login/logout — the connection is auth-gated by cookie, so a session change
  // means the old connection is stale and must be replaced.
  restart() {
    this.stop();
    this.start();
  }

  subscribe(event: EventName, cb: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: EventName, data: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}

export const wyrdStream = new WyrdStream();
