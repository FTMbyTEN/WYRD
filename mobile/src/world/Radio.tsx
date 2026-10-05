import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Mono } from '../components/ui';

/**
 * Lagos FM: real Lagos stations, streamed live from the stations' own public streams (the game only
 * plays them; it never stores or re-broadcasts them). One audio element; a station that fails to
 * play hands over to the next. The choice and the volume are remembered on this device.
 */
export const STATIONS = [
  { id: 'wazobia', name: 'Wazobia FM', freq: '95.1', tag: 'Pidgin · street talk', url: 'https://wazobiafmlagos951-atunwadigital.streamguys1.com/wazobiafmlagos951' },
  { id: 'cool', name: 'Cool FM', freq: '96.9', tag: 'Hits · Afrobeats', url: 'https://coolfmlagos969-atunwadigital.streamguys1.com/coolfmlagos969' },
  { id: 'metro', name: 'Metro FM', freq: '97.7', tag: 'Lagos · talk & music', url: 'https://go.webgateready.com/metrofm' },
  { id: 'nigeriainfo', name: 'Nigeria Info', freq: '99.3', tag: 'News · talk', url: 'https://nigeriainfofmlagos993-atunwadigital.streamguys1.com/nigeriainfofmlagos993' },
  { id: 'bond', name: 'Bond FM', freq: '92.9', tag: 'Lagos classic', url: 'https://go.webgateready.com/bondfm' },
  { id: 'goradio', name: 'GoRadio', freq: 'online', tag: 'Lagos online', url: 'https://online.goradio.com.ng/listen/gr/radio.mp3' },
];
const KEY = 'naija2099.fm';
const load = (): { id: string | null; vol: number } => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v.vol === 'number') return v; } catch { /* no storage */ }
  return { id: null, vol: 0.7 };
};
const keep = (v: { id: string | null; vol: number }) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* no storage */ } };

export function LagosFM() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'tuning' | 'live' | 'off-air'>('idle');
  const [vol, setVol] = useState(() => load().vol);

  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);
  useEffect(() => { if (audio.current) audio.current.volume = vol; keep({ id: on, vol }); }, [vol, on]);

  const play = (id: string, tries = 0) => {
    const st = STATIONS.find((s) => s.id === id)!;
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    a.pause();
    a.src = st.url;
    a.volume = vol;
    setOn(id); setState('tuning');
    a.onplaying = () => setState('live');
    a.onerror = () => {
      // dead air: hand over to the next station, once round the dial
      if (tries < STATIONS.length - 1) play(STATIONS[(STATIONS.indexOf(st) + 1) % STATIONS.length].id, tries + 1);
      else { setState('off-air'); setOn(null); }
    };
    a.play().catch(() => a.onerror?.(new Event('error')));
  };
  const stop = () => { audio.current?.pause(); if (audio.current) audio.current.src = ''; setOn(null); setState('idle'); };
  const st = STATIONS.find((s) => s.id === on);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable onPress={() => setOpen((o) => !o)} style={[styles.btn, on && styles.btnOn]} accessibilityLabel="Lagos FM radio">
        <Mono style={[styles.btnText, on && { color: '#0d0f14' }]}>{on ? `♪ ${st?.freq}` : '♪ FM'}</Mono>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          <View style={styles.head}>
            <Mono style={styles.eyebrow}>LAGOS FM {state === 'live' ? '· ● LIVE' : state === 'tuning' ? '· TUNING…' : state === 'off-air' ? '· OFF AIR' : ''}</Mono>
            {on ? <Pressable onPress={stop}><Mono style={styles.stop}>■ STOP</Mono></Pressable> : null}
          </View>
          {st ? <Mono style={styles.now}>{st.name} {st.freq} · {st.tag}</Mono> : <Mono style={styles.now}>Pick a station</Mono>}
          <View style={styles.row}>
            {STATIONS.map((s) => (
              <Pressable key={s.id} onPress={() => play(s.id)} style={[styles.chip, on === s.id && styles.chipOn]}>
                <Mono style={[styles.chipText, on === s.id && { color: '#0d0f14' }]}>{s.name.toUpperCase()}</Mono>
                <Mono style={[styles.chipFreq, on === s.id && { color: '#0d0f14' }]}>{s.freq}</Mono>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            {[0.25, 0.5, 0.75, 1].map((v) => (
              <Pressable key={v} onPress={() => setVol(v)} style={[styles.vol, vol >= v && styles.volOn]} accessibilityLabel={`Volume ${v * 100}%`} />
            ))}
            <Mono style={styles.chipFreq}>VOL</Mono>
          </View>
          <Mono style={styles.credit}>Live from the stations' own public streams.</Mono>
        </View>
      ) : null}
    </View>
  );
}

const CYAN = '#00e5ff';
const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: 6 },
  btn: { borderWidth: 1, borderColor: CYAN, backgroundColor: 'rgba(8,12,20,0.75)', paddingHorizontal: 10, paddingVertical: 6 },
  btnOn: { backgroundColor: CYAN },
  btnText: { fontSize: 10.5, letterSpacing: 1.6, color: CYAN },
  panel: { width: 250, backgroundColor: 'rgba(8,12,20,0.9)', borderWidth: 1, borderColor: CYAN, padding: 10, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontSize: 9.5, letterSpacing: 1.8, color: '#ff2bd6' },
  stop: { fontSize: 9.5, letterSpacing: 1.4, color: '#c9ccd3' },
  now: { fontSize: 11, color: '#ffffff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: '#2a3a4a', paddingHorizontal: 7, paddingVertical: 5, alignItems: 'center', minWidth: 72 },
  chipOn: { backgroundColor: CYAN, borderColor: CYAN },
  chipText: { fontSize: 8.5, letterSpacing: 1, color: '#c9ccd3' },
  chipFreq: { fontSize: 8.5, color: '#8ea0ff' },
  vol: { width: 22, height: 10, borderWidth: 1, borderColor: CYAN },
  volOn: { backgroundColor: CYAN },
  credit: { fontSize: 8, color: '#6a7080' },
});
