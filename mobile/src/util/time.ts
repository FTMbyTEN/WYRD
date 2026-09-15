export function timeAgo(iso: string | number): string {
  const then = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function countdown(targetMs: number | null | undefined): string {
  if (!targetMs) return '—';
  const diff = Math.max(0, targetMs - Date.now());
  const totalSec = Math.round(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function clockHHMM(d = new Date()): string {
  return d.toTimeString().slice(0, 5);
}
