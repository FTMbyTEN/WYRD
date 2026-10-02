// Backed by the real GET /api/alerts endpoint — synthesized server-side from diary/dreams/
// cop_log/digest, nothing new stored. Replaces the earlier client-side approach that treated
// every single net-feed ingestion as its own alert (the badge ballooned to double digits within
// a minute and buried the events that actually mattered — a diary entry, a COP flag, a dream —
// under routine ingestion noise). Polls, plus an immediate refresh on the SSE events that most
// likely mean the list changed, so it still feels live without re-deriving it client-side.
import { useEffect, useState } from 'react';
import { api } from './client';
import { wyrdStream } from './stream';
import type { StreamEvent } from './types';

export interface AlertItem {
  id: string;
  tag: 'DIARY' | 'DREAM' | 'COP' | 'DIGEST';
  ago: string;
  body: string;
}

const POLL_MS = 60000;
let alerts: AlertItem[] = [];
// which alerts this person has already seen, by what they say (their position and "ago" shift as
// new ones arrive): kept on the device, so signing in again doesn't bring old ones back as unread
const SEEN_KEY = 'wyrd.alertsSeen';
const keyOf = (a: AlertItem) => `${a.tag}|${a.body}`;
const seen = new Set<string>(loadSeen());
function loadSeen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]; } catch { return []; }
}
function saveSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-400))); } catch { /* fine: kept in memory */ }
}
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
  for (const a of alerts) seen.add(keyOf(a));
  saveSeen();
  notify();
}

export function useUnreadAlertCount() {
  const list = useAlerts();
  return list.filter((a) => !seen.has(keyOf(a))).length;
}
