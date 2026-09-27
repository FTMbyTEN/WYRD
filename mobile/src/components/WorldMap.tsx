import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Mono } from './ui';
import { colors } from '../theme';
import type { CountryListItem } from '../api/types';

// The map itself lives in public/world-map.html (see the note there on why it's a real page).
const MAP_PAGE_WEB = '/world-map.html';
const MAP_PAGE_NATIVE = 'https://wryd00.serverpod.space/world-map.html';
// OpenFreeMap: free OpenStreetMap vector tiles, no API key. Detail goes down to buildings.
const STYLES = {
  map: 'https://tiles.openfreemap.org/styles/positron', // monochrome, matches the app
  detail: 'https://tiles.openfreemap.org/styles/liberty', // full colour: land use, water, parks, roads
} as const;
type StyleKey = keyof typeof STYLES;

type Inbound = { type: 'ready' } | { type: 'select'; cca3: string } | { type: 'view'; lat: number; lng: number; zoom: number };

/**
 * WORLD_MAP's flat, zoomable map: OpenStreetMap vector tiles rendered by MapLibre inside a small
 * self-contained page (an iframe on web, a WebView on phones), so one implementation serves both.
 * The page lives in public/world-map.html. Country markers are tappable; `focused` flies the map there. Flat by design: no rotate, no tilt.
 */
export function WorldMap({ countries, focused, onSelect }: {
  countries: CountryListItem[];
  focused: CountryListItem | null;
  onSelect: (c: CountryListItem) => void;
}) {
  const [style, setStyle] = useState<StyleKey>('map');
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webRef = useRef<React.ComponentRef<typeof WebView>>(null);
  const byCode = useRef(new Map<string, CountryListItem>());
  byCode.current = new Map(countries.map((c) => [c.cca3, c]));

  const send = (msg: object) => {
    const data = JSON.stringify(msg);
    if (Platform.OS === 'web') iframeRef.current?.contentWindow?.postMessage(data, '*');
    else webRef.current?.injectJavaScript(`window.__wyrd(${data});true;`);
  };

  const receive = (raw: unknown) => {
    let msg: Inbound;
    try { msg = typeof raw === 'string' ? JSON.parse(raw) : (raw as Inbound); } catch { return; }
    if (msg?.type === 'ready') setReady(true);
    else if (msg?.type === 'select') { const c = byCode.current.get(msg.cca3); if (c) onSelect(c); }
    else if (msg?.type === 'view') setView({ lat: msg.lat, lng: msg.lng, zoom: msg.zoom });
  };

  // web: messages from the iframe
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMsg = (e: MessageEvent) => { if (e.source === iframeRef.current?.contentWindow) receive(e.data); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready) send({ type: 'countries', countries: countries.map(({ name, cca3, lat, lng }) => ({ name, cca3, lat, lng })) });
  }, [ready, countries]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ready && focused) send({ type: 'focus', cca3: focused.cca3, lat: focused.lat, lng: focused.lng });
  }, [ready, focused?.cca3]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ready) send({ type: 'style', url: STYLES[style] });
  }, [ready, style]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'web'
        ? React.createElement('iframe', {
            ref: iframeRef,
            src: MAP_PAGE_WEB,
            title: 'World map',
            style: { border: 0, width: '100%', height: '100%', display: 'block', background: '#f2f2f0' },
          })
        : <WebView
            ref={webRef}
            source={{ uri: MAP_PAGE_NATIVE }}
            originWhitelist={['*']}
            onMessage={(e: WebViewMessageEvent) => receive(e.nativeEvent.data)}
            style={{ flex: 1, backgroundColor: '#f2f2f0' }}
          />}

      <View style={styles.toggle}>
        {(['map', 'detail'] as StyleKey[]).map((k) => (
          <Pressable key={k} onPress={() => setStyle(k)} style={[styles.toggleBtn, style === k && styles.toggleOn]}>
            <Mono style={[styles.toggleText, style === k && styles.toggleTextOn]}>{k === 'map' ? 'MAP' : 'DETAILED'}</Mono>
          </Pressable>
        ))}
      </View>
      {view && (
        <View style={styles.readout} pointerEvents="none">
          <Mono style={styles.readoutText}>
            {fmt(view.lat, 'N', 'S')} {fmt(view.lng, 'E', 'W')} · Z{view.zoom.toFixed(1)}
          </Mono>
        </View>
      )}
    </View>
  );
}

const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(3)}°${v >= 0 ? pos : neg}`;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f2f2f0' },
  toggle: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', borderWidth: 1, borderColor: colors.green, backgroundColor: colors.black },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  toggleOn: { backgroundColor: colors.green },
  toggleText: { fontSize: 10, letterSpacing: 1.5, color: colors.green },
  toggleTextOn: { color: colors.black },
  readout: { position: 'absolute', top: 44, left: 10, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 6, paddingVertical: 3 },
  readoutText: { fontSize: 9.5, color: colors.green },
});
