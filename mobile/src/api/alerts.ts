// The backend has no alerts/notifications endpoint (confirmed absent from server.js). The
// design's ALERTS overlay is real UI, so instead of faking data we synthesize a live feed from
// the same SSE events every other tab already reacts to — this is real activity, just re-framed
// as a notification list rather than a dedicated backend feature.
import { useEffect, useState } from 'react';
import { wyrdStream } from './sse';
import type { CopLogEntry, DiaryEntry, DreamEntry, FeedItem, SelfConfigChange } from './types';

export interface AlertItem {
  id: string;
  tag: 'DIARY' | 'COP' | 'DREAM' | 'SELF' | 'INGEST';
  body: string;
  timestamp: string;
  read: boolean;
}

const MAX_ALERTS = 40;
let alerts: AlertItem[] = [];
const subscribers = new Set<() => void>();
let started = false;

function push(item: Omit<AlertItem, 'id' | 'read'>) {
  alerts = [{ ...item, id: `${item.timestamp}-${item.tag}-${Math.random().toString(36).slice(2, 7)}`, read: false }, ...alerts].slice(0, MAX_ALERTS);
  subscribers.forEach((cb) => cb());
}

function ensureStarted() {
  if (started) return;
  started = true;
  wyrdStream.subscribe('diary', (d) => {
    const entry = d as DiaryEntry;
    push({ tag: 'DIARY', body: "WYRD wrote today's entry. One per day, unprompted.", timestamp: entry.timestamp });
  });
  wyrdStream.subscribe('dream', (d) => {
    const entry = d as DreamEntry;
    push({ tag: 'DREAM', body: `Idle stretch produced a dream: "${entry.content.slice(0, 80)}${entry.content.length > 80 ? '…' : ''}"`, timestamp: entry.timestamp });
  });
  wyrdStream.subscribe('cop_report', (d) => {
    const entry = d as CopLogEntry;
    push({ tag: 'COP', body: `Self-modification reviewed: ${entry.change.key} → ${JSON.stringify(entry.change.newValue)}. ${entry.verdict.slice(0, 80)}`, timestamp: entry.timestamp });
  });
  wyrdStream.subscribe('self_modify', (d) => {
    const change = d as SelfConfigChange;
    push({ tag: 'SELF', body: `${change.key} changed on its own — no approval step. ${change.reason}`, timestamp: new Date().toISOString() });
  });
  wyrdStream.subscribe('ingested', (d) => {
    const item = d as FeedItem;
    push({ tag: 'INGEST', body: `[${item.feedSource}] ${item.title}`, timestamp: item.timestamp });
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
  alerts = alerts.map((a) => ({ ...a, read: true }));
  subscribers.forEach((cb) => cb());
}

export function useUnreadAlertCount() {
  const list = useAlerts();
  return list.filter((a) => !a.read).length;
}
