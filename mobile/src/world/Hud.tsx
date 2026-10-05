import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import type { Road } from './osmCity';

/**
 * NAIJA 2099's HUD: an ID card, a compass, a live minimap of the real streets, the mission tracker,
 * WYRD's comms, context prompts with their key, vehicle gauges, and a pause menu -- in the city's
 * own look (dark glass panels, cyan and magenta light, corner brackets, mono type).
 *
 * The minimap and compass draw themselves on small canvases ~10 times a second from a shared feed
 * the game writes each frame, so the HUD costs almost nothing.
 */
export type HudFeed = {
  x: number; z: number; bearing: number; // where the player is; which way the camera looks (0 = north, clockwise)
  inCar: boolean; alt: number; speed: number; // flying: height (m), speed (m/s)
  target: { x: number; z: number } | null; // the mission's place
  tower: { x: number; z: number } | null; // WYRD's tower
  car: { x: number; z: number } | null; // the hover-car, when it's down
  roads: () => Road[];
  route: { x: number; y: number }[] | null; // the mission GPS, along the streets
};
export const newFeed = (): HudFeed => ({ x: 0, z: 0, bearing: 0, inCar: false, alt: 0, speed: 0, target: null, tower: null, car: null, roads: () => [], route: null });

const CYAN = '#00e5ff', MAGENTA = '#ff2bd6', GOLD = '#ffc400', COBALT = '#4a6bff';
const web = Platform.OS === 'web';

/** A canvas inside a View (web), redrawn ~10x a second. */
function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[] = []) {
  const host = useRef<View>(null);
  useEffect(() => {
    if (!web) return;
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    el.appendChild(cv);
    const g = cv.getContext('2d')!;
    const tick = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth, h = el.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      draw(g, w, h);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => { clearInterval(id); cv.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return host;
}

/** The live minimap: the real streets round you, turning with your view; mission, tower and car marked. */
export function Minimap({ feed, size = 168 }: { feed: React.MutableRefObject<HudFeed>; size?: number }) {
  const R = 170; // metres from centre to rim
  const host = useCanvas((g, w, h) => {
    const f = feed.current, cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 2, k = r / R;
    const c = Math.cos(-f.bearing), s = Math.sin(-f.bearing);
    // world -> screen: north-up (south is +z, down), then turned so your view points up
    const toS = (x: number, z: number) => { const dx = (x - f.x) * k, dz = (z - f.z) * k; return [cx + dx * c - dz * s, cy + dx * s + dz * c] as const; };
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(10,12,18,0.82)'; g.fillRect(0, 0, w, h);
    // streets: main roads brighter and wider
    g.lineCap = 'round';
    for (const road of f.roads()) {
      const p0 = road.pts[0], pn = road.pts[road.pts.length - 1];
      if (Math.min(Math.hypot(p0.x - f.x, p0.y - f.z), Math.hypot(pn.x - f.x, pn.y - f.z)) > R + road.len) continue;
      g.strokeStyle = road.kind <= 2 ? 'rgba(0,229,255,0.75)' : road.kind <= 4 ? 'rgba(180,190,210,0.55)' : 'rgba(150,160,180,0.3)';
      g.lineWidth = Math.max(1, road.width * k * 0.9);
      g.beginPath();
      road.pts.forEach((p, i) => { const [sx, sy] = toS(p.x, p.y); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
      g.stroke();
    }
    // the GPS route, in gold
    if (f.route && f.route.length > 1) {
      g.strokeStyle = 'rgba(255,196,0,0.95)'; g.lineWidth = 3; g.setLineDash([6, 4]);
      g.beginPath();
      f.route.forEach((p, i) => { const [sx, sy] = toS(p.x, p.y); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
      g.stroke(); g.setLineDash([]);
    }
    g.restore();
    // the rim, and N on it
    g.strokeStyle = 'rgba(0,229,255,0.6)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    const [nx, ny] = [cx + Math.sin(-f.bearing) * (r - 9), cy - Math.cos(-f.bearing) * (r - 9)];
    g.fillStyle = MAGENTA; g.font = 'bold 10px "Share Tech Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', nx, ny);
    // markers: inside the map, or pinned to the rim pointing the way (with the distance)
    const mark = (p: { x: number; z: number } | null, color: string, label: string, pulse = false) => {
      if (!p) return;
      let [sx, sy] = toS(p.x, p.z);
      const d = Math.hypot(sx - cx, sy - cy), dist = Math.hypot(p.x - f.x, p.z - f.z);
      const out = d > r - 8;
      if (out) { sx = cx + ((sx - cx) / d) * (r - 8); sy = cy + ((sy - cy) / d) * (r - 8); }
      const rr = 4.5 + (pulse ? Math.sin(performance.now() / 180) * 1.2 : 0);
      g.fillStyle = color; g.beginPath(); g.arc(sx, sy, rr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#0a0c12'; g.lineWidth = 1.5; g.stroke();
      if (out) { g.fillStyle = color; g.font = '9px "Share Tech Mono", monospace'; g.fillText(dist > 999 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`, sx + (cx - sx) * 0.18, sy + (cy - sy) * 0.18); }
      void label;
    };
    mark(f.tower, COBALT, 'W');
    mark(f.car, CYAN, 'car');
    mark(f.target, GOLD, 'mission', true);
    // you: an arrow pointing up (your view)
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 5, cy + 5); g.lineTo(cx, cy + 2); g.lineTo(cx - 5, cy + 5); g.closePath(); g.fill();
  });
  return <View ref={host} style={{ width: size, height: size }} pointerEvents="none" />;
}

/** The compass strip: headings scroll past as you turn; the mission and tower show where they lie. */
export function Compass({ feed, width = 360 }: { feed: React.MutableRefObject<HudFeed>; width?: number }) {
  const host = useCanvas((g, w, h) => {
    const f = feed.current, span = Math.PI * 0.75; // the strip shows 135 degrees
    const xOf = (a: number) => { let d = a - f.bearing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) > span / 2 ? null : w / 2 + (d / span) * w; };
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(10,12,18,0)'); grad.addColorStop(0.15, 'rgba(10,12,18,0.75)'); grad.addColorStop(0.85, 'rgba(10,12,18,0.75)'); grad.addColorStop(1, 'rgba(10,12,18,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, x = xOf(a);
      if (x == null) continue;
      const major = i % 9 === 0;
      g.strokeStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
      g.beginPath(); g.moveTo(x, h - (major ? 10 : 6)); g.lineTo(x, h - 2); g.stroke();
      if (major) { g.fillStyle = i === 0 ? MAGENTA : '#ffffff'; g.font = `${i % 18 === 0 ? 'bold 12' : '10'}px "Share Tech Mono", monospace`; g.fillText(names[i / 9], x, h / 2 - 3); }
    }
    const bearingTo = (p: { x: number; z: number }) => Math.atan2(p.x - f.x, -(p.z - f.z));
    const pin = (p: { x: number; z: number } | null, color: string) => {
      if (!p) return;
      const x = xOf((bearingTo(p) + Math.PI * 2) % (Math.PI * 2));
      if (x == null) return;
      g.fillStyle = color; g.beginPath(); g.moveTo(x, h - 1); g.lineTo(x - 5, h - 9); g.lineTo(x + 5, h - 9); g.closePath(); g.fill();
    };
    pin(f.tower, COBALT);
    pin(f.target, GOLD);
    g.fillStyle = CYAN; g.fillRect(w / 2 - 1, 0, 2, 5); // centre mark
  });
  return <View ref={host} style={{ width, height: 30 }} pointerEvents="none" />;
}

/** Altitude and speed while flying, read from the feed four times a second. */
export function VehicleGauges({ feed }: { feed: React.MutableRefObject<HudFeed> }) {
  const [v, setV] = useState({ alt: 0, kmh: 0 });
  useEffect(() => {
    const id = setInterval(() => setV({ alt: Math.round(feed.current.alt), kmh: Math.round(feed.current.speed * 3.6) }), 250);
    return () => clearInterval(id);
  }, [feed]);
  return (
    <Panel style={styles.gauges}>
      <Mono style={styles.eyebrow}>HOVER-CAR</Mono>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <View><Display style={styles.gaugeNum}>{v.kmh}</Display><Mono style={styles.gaugeUnit}>KM/H</Mono></View>
        <View><Display style={styles.gaugeNum}>{v.alt}</Display><Mono style={styles.gaugeUnit}>M UP</Mono></View>
      </View>
      <View style={styles.altBar}><View style={[styles.altFill, { width: `${Math.min(100, (v.alt / 200) * 100)}%` }]} /></View>
    </Panel>
  );
}

/** A dark glass panel with cyan corner brackets. */
export function Panel({ children, style, accent = CYAN }: { children: React.ReactNode; style?: object; accent?: string }) {
  return (
    <View style={[styles.panel, style]}>
      <View style={[styles.corner, { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2, borderColor: accent }]} />
      <View style={[styles.corner, { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2, borderColor: accent }]} />
      <View style={[styles.corner, { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: accent }]} />
      <View style={[styles.corner, { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2, borderColor: accent }]} />
      {children}
    </View>
  );
}

/** A key cap, for prompts: [E] */
export function KeyCap({ k }: { k: string }) {
  return <View style={styles.key}><Mono style={styles.keyText}>{k}</Mono></View>;
}

/** The standing bar: -100 .. 100, filling from the middle (magenta below zero, cyan above). */
export function StandingBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.abs(value)) / 2;
  return (
    <View style={styles.bar}>
      <View style={styles.barMid} />
      <View style={[styles.barFill, value >= 0 ? { left: '50%', width: `${pct}%`, backgroundColor: CYAN } : { right: '50%', width: `${pct}%`, backgroundColor: MAGENTA }]} />
    </View>
  );
}

/** The pause menu: everything that isn't moment-to-moment play. */
export function PauseMenu({ items, onClose, name }: { items: { label: string; hint?: string; onPress: () => void; danger?: boolean }[]; onClose: () => void; name: string }) {
  return (
    <View style={styles.menuShade}>
      <Panel style={styles.menu} accent={MAGENTA}>
        <Mono style={styles.eyebrow}>NAIJA 2099 · PAUSED</Mono>
        <Display style={styles.menuTitle}>{name}</Display>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Pressable onPress={onClose} style={[styles.menuItem, styles.menuItemOn]}><Mono style={[styles.menuText, { color: colors.onSignal }]}>RESUME</Mono><Mono style={[styles.menuHint, { color: colors.onSignal }]}>ESC</Mono></Pressable>
          {items.map((it) => (
            <Pressable key={it.label} onPress={it.onPress} style={styles.menuItem}>
              <Mono style={[styles.menuText, it.danger && { color: '#ff6b6b' }]}>{it.label}</Mono>
              {it.hint ? <Mono style={styles.menuHint}>{it.hint}</Mono> : null}
            </Pressable>
          ))}
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: 'rgba(10,12,18,0.78)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.18)', padding: 10 },
  corner: { position: 'absolute', width: 9, height: 9 },
  eyebrow: { fontSize: 9, letterSpacing: 2.2, color: '#8ea0ff' },
  gauges: { gap: 4, minWidth: 170 },
  gaugeNum: { fontSize: 30, lineHeight: 32, color: '#ffffff' },
  gaugeUnit: { fontSize: 9, letterSpacing: 1.8, color: CYAN },
  altBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 4 },
  altFill: { height: 3, backgroundColor: CYAN },
  key: { borderWidth: 1, borderColor: '#ffffff', paddingHorizontal: 6, paddingVertical: 1, minWidth: 22, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  keyText: { fontSize: 11, color: '#ffffff' },
  bar: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 4, overflow: 'hidden' },
  barMid: { position: 'absolute', left: '50%', top: -2, width: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.5)' },
  barFill: { position: 'absolute', top: 0, height: 4 },
  menuShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,6,10,0.55)', alignItems: 'center', justifyContent: 'center' },
  menu: { width: 340, maxWidth: '90%', padding: 18 },
  menuTitle: { fontSize: 28, lineHeight: 32, color: '#ffffff' },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2a2e38' },
  menuItemOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  menuText: { fontSize: 11.5, letterSpacing: 1.8, color: '#e6e8ee' },
  menuHint: { fontSize: 9.5, letterSpacing: 1.4, color: '#7a808c' },
});
