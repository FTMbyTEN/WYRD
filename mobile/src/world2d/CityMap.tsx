import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DISTRICTS, LANDMARKS, toXZ } from './geo';
import { index, search, searchIndex, type Found } from './search';

/**
 * The city map (Tab): all of Lagos -- main roads, rail, the lagoon and the sea, districts and every
 * famous building -- with you on it. Drag to pan, scroll to zoom, click a place to take a danfo there.
 */
export type Overview = { bounds: [number, number, number, number]; roads: number[][][]; rail: number[][]; water: { w: number; p: number[] }[] };
type Sea = { p: Float32Array; island: boolean }[];

export function CityMap({ overview, sea, sand = [], me, onTravel, onClose }: {
  overview: Overview | null; sea: Sea; sand?: { p: Float32Array; line: boolean }[]; me: { x: number; z: number };
  onTravel: (x: number, z: number, name: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ cx: me.x, cz: me.z, k: 0.06 }); // px per metre
  const [hover, setHover] = useState<{ name: string; x: number; z: number } | null>(null);
  const [, redraw] = useState(0);
  // search: what's typed, what matches, and the place picked (pinned on the map)
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<Found[]>(index ?? []);
  const [pin, setPin] = useState<Found | null>(null);
  const [pick, setPick] = useState(0);
  useEffect(() => { if (!index) void searchIndex().then(setAll); }, []);
  const results = search(all, query);
  const choose = (f: Found) => {
    setPin(f); setQuery(''); setPick(0);
    view.current = { cx: f.x, cz: f.z, k: Math.max(view.current.k, f.kind === 'District' ? 0.08 : 0.22) };
    redraw((n) => n + 1);
  };

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
    // the beaches first: the sea is laid over the seaward half of the shore strip
    for (const q of sand) {
      ctx.beginPath(); for (let i = 0; i < q.p.length; i += 2) { const x = X(q.p[i]), y = Z(q.p[i + 1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      if (q.line) { ctx.strokeStyle = '#EAD49A'; ctx.lineWidth = Math.max(3, 90 * k); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
      else { ctx.closePath(); ctx.fillStyle = '#EAD49A'; ctx.fill(); }
    }
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
    if (pin) {
      // the place you searched for: a pin with its name
      const px = X(pin.x), py = Z(pin.z);
      ctx.fillStyle = 'rgba(0,229,255,0.22)'; ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#00B8D4'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 9, py - 16); ctx.arc(px, py - 18, 9, Math.PI * 0.85, Math.PI * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#FFFFFF';
      ctx.strokeText(pin.name, px, py - 34); ctx.fillStyle = '#1E2A44'; ctx.fillText(pin.name, px, py - 34);
    }
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
          <Text style={s.sub}>{hover ? `${hover.name} — click to take a danfo there` : 'Search, or drag to look around · scroll to zoom · click a place to travel'}</Text>
          <Pressable onPress={onClose} style={s.close}><Text style={s.closeText}>Close (Tab)</Text></Pressable>
        </View>
        <View style={s.searchRow}>
          <TextInput value={query} onChangeText={(t) => { setQuery(t); setPick(0); }} placeholder="Search Lagos: a street, a place, a landmark…" placeholderTextColor="#9AA3B2"
            style={s.search} autoFocus accessibilityLabel="Search the map"
            onKeyPress={(e) => {
              const k = (e.nativeEvent as { key: string }).key;
              if (k === 'ArrowDown') setPick((p) => Math.min(results.length - 1, p + 1));
              if (k === 'ArrowUp') setPick((p) => Math.max(0, p - 1));
              if (k === 'Enter') { const f = results[pick] ?? results[0]; if (f) choose(f); }
            }} />
          {pin ? (
            <View style={s.pinRow}>
              <Text style={s.pinName} numberOfLines={1}>{pin.name}<Text style={s.pinMeta}>  {pin.kind}{pin.area ? ` · ${pin.area}` : ''}  ·  {(Math.hypot(pin.x - me.x, pin.z - me.z) / 1000).toFixed(1)} km</Text></Text>
              <Pressable onPress={() => onTravel(pin.x, pin.z, pin.name)} style={s.go}><Text style={s.goText}>Travel there</Text></Pressable>
              <Pressable onPress={() => setPin(null)} style={s.clear}><Text style={s.clearText}>✕</Text></Pressable>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>
          {React.createElement('canvas', { ref, style: { width: '100%', height: '100%', display: 'block', borderRadius: 14, cursor: 'crosshair' } })}
          {results.length ? (
            <View style={s.results}>
              {results.map((f, i) => (
                <Pressable key={`${f.kind}${f.name}${f.x}`} onPress={() => choose(f)} onHoverIn={() => setPick(i)} style={[s.result, i === pick && s.resultOn]}>
                  <Text style={s.resultName} numberOfLines={1}>{f.name}</Text>
                  <Text style={s.resultMeta} numberOfLines={1}>{f.kind}{f.area ? ` · ${f.area}` : ''}</Text>
                </Pressable>
              ))}
            </View>
          ) : query.trim().length >= 2 ? <View style={s.results}><Text style={[s.resultMeta, { padding: 10 }]}>{all.length ? 'Nothing by that name. Try part of it.' : 'Loading the map\'s names…'}</Text></View> : null}
        </View>
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 260, fontFamily: font, fontSize: 15, borderWidth: 1.5, borderColor: '#C9CED6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, color: '#1E2A44', backgroundColor: '#F6F8FB' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  pinName: { fontFamily: font, fontSize: 14, fontWeight: '800', color: '#1E2A44', flexShrink: 1 },
  pinMeta: { fontWeight: '500', color: '#5B6475', fontSize: 12.5 },
  go: { backgroundColor: '#00B8D4', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  goText: { fontFamily: font, fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  clear: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#EEF1F4' },
  clearText: { fontFamily: font, fontSize: 13, fontWeight: '800', color: '#5B6475' },
  results: { position: 'absolute', top: 8, left: 8, width: 380, maxWidth: '90%', backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  result: { paddingHorizontal: 12, paddingVertical: 7 },
  resultOn: { backgroundColor: '#E6F9FC' },
  resultName: { fontFamily: font, fontSize: 14, fontWeight: '700', color: '#1E2A44' },
  resultMeta: { fontFamily: font, fontSize: 12, color: '#5B6475' },
});
