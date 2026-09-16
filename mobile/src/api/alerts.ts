// Backed by the real GET /api/alerts endpoint — synthesized server-side from diary/dreams/
// cop_log/digest, nothing new stored. Replaces the earlier client-side approach that treated
// every single net-feed ingestion as its own alert (the badge ballooned to double digits within
// a minute and buried the events that actually mattered — a diary entry, a COP flag, a dream —
// under routine ingestion noise). Polls, plus an immediate refresh on the SSE events that most
// likely mean the list changed, so it still feels live without re-deriving it client-side.
import { useEffect, useState } from 'react';
import { api } from './client';
import { wyrdStream } from './sse';
import type { StreamEvent } from './types';

export interface AlertItem {
  id: string;
  tag: 'DIARY' | 'DREAM' | 'COP' | 'DIGEST';
  ago: string;
  body: string;
}

const POLL_MS = 60000;
let alerts: AlertItem[] = [];
let seenCount = 0;
const subscribers = new Set<() => void>();
let started = false;

function notify() {
  subscribers.forEach((cb) => cb());
}

async function refresh() {
  try {
    const notes = await api.alerts();
    alerts = notes.map((n, i) => ({ id: `${i}-${n.tag}-${n.ago}`, tag: n.tag, ago: n.ago, body: n.body }));
    notify();
  } catch {
    // stay on the last-known list rather than clearing it out from under the user
  }
}

function ensureStarted() {
  if (started) return;
  started = true;
  refresh();
  setInterval(refresh, POLL_MS);
  (['diary', 'dream', 'cop_report', 'self_modify'] as StreamEvent['event'][]).forEach((event) => {
    wyrdStream.subscribe(event, () => refresh());
  });
}

export function useAlerts() {
  const [, force] = useState(0);
  useEffect(() => {
    ensureStarted();
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
  }, []);
  return alerts;
}

export function markAllAlertsRead() {
  seenCount = alerts.length;
  notify();
}

export function useUnreadAlertCount() {
  const list = useAlerts();
  return Math.max(0, list.length - seenCount);
}
