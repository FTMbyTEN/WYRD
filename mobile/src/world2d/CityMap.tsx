import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DISTRICTS, LANDMARKS, toXZ } from './geo';

/**
 * The city map (Tab): all of Lagos -- main roads, rail, the lagoon and the sea, districts and every
 * famous building -- with you on it. Drag to pan, scroll to zoom, click a place to take a danfo there.
 */
export type Overview = { bounds: [number, number, number, number]; roads: number[][][]; rail: number[][]; water: { w: number; p: number[] }[] };
type Sea = { p: Float32Array; island: boolean }[];

export function CityMap({ overview, sea, me, onTravel, onClose }: {
  overview: Overview | null; sea: Sea; me: { x: number; z: number };
  onTravel: (x: number, z: number, name: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ cx: me.x, cz: me.z, k: 0.06 }); // px per metre
  const [hover, setHover] = useState<{ name: string; x: number; z: number } | null>(null);
  const [, redraw] = useState(0);

  const places = [
    ...LANDMARKS.map((l) => ({ name: l.name, ...toXZ(l.at), big: false })),
    ...DISTRICTS.map((d) => ({ name: d.name, ...toXZ(d.at), big: true })),
  ];

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cx, cz, k } = view.current;
    const X = (x: number) => (x - cx) * k + W / 2, Z = (z: number) => (z - cz) * k + H / 2;
    ctx.fillStyle = '#EEF1EA'; ctx.fillRect(0, 0, W, H);
    // water: the sea and lagoon, then the mapped creeks and canals
    for (const q of sea) {
      ctx.beginPath(); for (let i = 0; i < q.p.length; i += 2) { const x = X(q.p[i]), y = Z(q.p[i + 1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fillStyle = q.island ? '#EEF1EA' : '#7CC3EE'; ctx.fill();
    }
    const line = (p: number[]) => { ctx.beginPath(); for (let i = 0; i < p.length; i += 2) { const x = X(p[i] * 10), y = Z(p[i + 1] * 10); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } };
    if (overview) {
      for (const w of overview.water) {
        line(w.p);
        if (w.w) { ctx.strokeStyle = '#7CC3EE'; ctx.lineWidth = Math.max(1, w.w * k); ctx.stroke(); } else { ctx.closePath(); ctx.fillStyle = '#7CC3EE'; ctx.fill(); }
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#B0B6BE'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      for (const r of overview.rail) { line(r); ctx.stroke(); }
      ctx.setLineDash([]);
      const style = [['#F2994A', 4], ['#F2C94C', 3.4], ['#FFFFFF', 2.6], ['#FFFFFF', 1.8], ['#FFFFFF', 1.1]] as const;
      for (let kind = 4; kind >= 0; kind--) {
        if (kind === 4 && k < 0.05) continue;
        ctx.strokeStyle = 'rgba(60,70,90,0.25)'; ctx.lineWidth = style[kind][1] + 1.2;
        for (const r of overview.roads[kind]) { line(r); ctx.stroke(); }
        ctx.strokeStyle = style[kind][0]; ctx.lineWidth = style[kind][1];
        for (const r of overview.roads[kind]) { line(r); ctx.stroke(); }
      }
    }
    // places
    ctx.textAlign = 'center';
    for (const p of places) {
      const x = X(p.x), y = Z(p.z);
      if (x < -50 || y < -20 || x > W + 50 || y > H + 20) continue;
      if (p.big) {
        ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(30,42,68,0.75)'; ctx.fillText(p.name.toUpperCase(), x, y);
      } else {
        ctx.fillStyle = '#C4572E'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke();
        if (k > 0.1 || hover?.name === p.name) { ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = '#1E2A44'; ctx.fillText(p.name, x, y - 9); }
      }
    }
    // you
    const mx = X(me.x), my = Z(me.z);
    ctx.fillStyle = 'rgba(242,201,76,0.35)'; ctx.beginPath(); ctx.arc(mx, my, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F2C94C'; ctx.strokeStyle = '#1E2A44'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (hover) {
      const hx = X(hover.x), hy = Z(hover.z);
      ctx.strokeStyle = '#1E2A44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2); ctx.stroke();
    }
  });

  useEffect(() => {
    const c = ref.current; if (!c) return;
    let drag: { x: number; y: number; moved: number } | null = null;
    const toWorld = (e: MouseEvent) => {
      const r = c.getBoundingClientRect(), { cx, cz, k } = view.current;
      return { x: (e.clientX - r.left - r.width / 2) / k + cx, z: (e.clientY - r.top - r.height / 2) / k + cz };
    };
    const nearest = (w: { x: number; z: number }) => {
      const k = view.current.k;
      let best: (typeof places)[number] | null = null, bd = 14 / k;
      for (const p of places) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) };
        view.current.cx -= dx / view.current.k; view.current.cz -= dy / view.current.k; redraw((n) => n + 1);
      } else {
        const p = nearest(toWorld(e));
        setHover(p ? { name: p.name, x: p.x, z: p.z } : null);
      }
    };
    const up = (e: PointerEvent) => {
      if (drag && drag.moved < 5) {
        const w = toWorld(e), p = nearest(w);
        onTravel(p ? p.x : w.x, p ? p.z : w.z, p ? p.name : 'there');
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.k = Math.max(0.015, Math.min(0.6, view.current.k * (e.deltaY > 0 ? 0.85 : 1.18)));
      redraw((n) => n + 1);
    };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    c.addEventListener('wheel', wheel, { passive: false });
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('wheel', wheel); };
  }, [onTravel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <View style={s.head}>
          <Text style={s.title}>Lagos</Text>
          <Text style={s.sub}>{hover ? `${hover.name} — click to take a danfo there` : 'Drag to look around · scroll to zoom · click a place to travel'}</Text>
          <Pressable onPress={onClose} style={s.close}><Text style={s.closeText}>Close (Tab)</Text></Pressable>
        </View>
        {React.createElement('canvas', { ref, style: { width: '100%', flex: 1, display: 'block', borderRadius: 14, cursor: 'crosshair', minHeight: 0 } })}
        <Text style={s.osm}>Map data © OpenStreetMap contributors</Text>
      </View>
    </View>
  );
}

const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const s = StyleSheet.create({
  wrap: { position: 'absolute', inset: 0, backgroundColor: 'rgba(10,14,22,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 } as object,
  card: { width: '100%', height: '100%', maxWidth: 1200, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontFamily: font, fontSize: 22, fontWeight: '800', color: '#1E2A44' },
  sub: { fontFamily: font, fontSize: 13, color: '#5B6475', flex: 1 },
  close: { backgroundColor: '#1E2A44', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  closeText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  osm: { fontFamily: font, fontSize: 10, color: '#8A93A3', textAlign: 'right' },
});
