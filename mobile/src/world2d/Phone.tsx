import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CY, HEAD, MONO, clip, scan } from './cyber';
import type { Station } from './radio';
import { index, search, searchIndex, type Found } from './search';
import type { WyrdLine } from './WyrdPanel';

/**
 * The WYRD phone (P): every character carries one, and WYRD runs it. Rides -- a WYRD Ride by road or WYRD Air by sky,
 * ordered to anywhere in Lagos and taken there for real -- plus the radio, the city's live feed, the map, WYRD itself
 * and your wallet.
 */
export type RideKind = 'road' | 'air';
/** what the phone shows of a ride on its way, waiting, or under way */
export type RideStatus = { kind: RideKind; phase: 'coming' | 'waiting' | 'riding'; dest: string; metres: number; seconds: number; fast: boolean };
export const FARES: Record<RideKind, number> = { road: 500, air: 1500 };
const SPEED: Record<RideKind, number> = { road: 18, air: 45 }; // m/s, for the estimates

type Screen = 'home' | 'rides' | 'radio' | 'live';

export function Phone({ wallet, me, ride, onOrder, onCancel, onSkip, onFast, stations, onAir, onTune, live, onMap, onWyrd, onClose }: {
  wallet: number | null; me: { x: number; z: number }; ride: RideStatus | null;
  onOrder: (dest: Found, kind: RideKind) => void; onCancel: () => void; onSkip: () => void; onFast: () => void;
  stations: Station[]; onAir: Station | null; onTune: (i: number | null) => void;
  live: WyrdLine[]; onMap: () => void; onWyrd: () => void; onClose: () => void;
}) {
  const [screen, setScreen] = useState<Screen>(ride ? 'rides' : 'home');
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 15000); return () => clearInterval(t); }, []);
  const time = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={[s.phone, clip(18), scan]}>
        {/* the status bar */}
        <View style={s.bar}>
          <Text style={s.barText}>{time}</Text>
          <Text style={[s.barText, { color: CY.magenta }]}>WYRD OS</Text>
          <Text style={s.barText}>▂▄▆ 5G</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }}>
        {screen === 'home' ? (
          <View style={s.body}>
            <Text style={s.hello}>Lagos, {clock.getHours() < 12 ? 'good morning' : clock.getHours() < 17 ? 'good afternoon' : 'good evening'}.</Text>
            <Text style={s.money}>₦{wallet == null ? '—' : wallet.toLocaleString('en-NG')}</Text>
            {ride ? <RideCard ride={ride} onOpen={() => setScreen('rides')} /> : null}
            <View style={s.apps}>
              {([
                ['🚖', 'Rides', () => setScreen('rides'), CY.yellow],
                ['🗺', 'Map', onMap, CY.cyan],
                ['◉', 'WYRD', onWyrd, CY.magenta],
                ['📻', 'Radio', () => setScreen('radio'), CY.green],
                ['⚡', 'Live', () => setScreen('live'), CY.red],
              ] as const).map(([icon, name, go, tone]) => (
                <Pressable key={name} onPress={go} style={({ pressed }) => [s.app, pressed && { opacity: 0.7 }]}>
                  <View style={[s.appIcon, clip(8), { borderColor: tone }]}><Text style={s.appGlyph}>{icon}</Text></View>
                  <Text style={s.appName}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {screen === 'rides' ? <Rides me={me} wallet={wallet} ride={ride} onOrder={onOrder} onCancel={onCancel} onSkip={onSkip} onFast={onFast} /> : null}
        {screen === 'radio' ? (
          <View style={s.body}>
            <Text style={s.h1}>Radio</Text>
            {stations.map((st, i) => (
              <Pressable key={st.name} onPress={() => onTune(onAir?.name === st.name ? null : i)} style={[s.row, onAir?.name === st.name && s.rowOn]}>
                <Text style={s.rowMain}>{st.freq}  {st.name}</Text>
                <Text style={s.rowSub}>{onAir?.name === st.name ? '● ON AIR · tap to switch off' : st.tag}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {screen === 'live' ? (
          <View style={s.body}>
            <Text style={s.h1}>Live from WYRD</Text>
            {live.length ? [...live].reverse().slice(0, 8).map((l, i) => (
              <View key={i} style={s.feed}><Text style={s.feedText}>{l.text.replace(/^WYRD city bulletin: /, '')}</Text></View>
            )) : <Text style={s.rowSub}>Nothing on the wire yet. It comes in as the city moves.</Text>}
          </View>
        ) : null}
        </ScrollView>
        {/* the home bar */}
        <View style={s.nav}>
          <Pressable onPress={() => setScreen('home')} style={s.navBtn}><Text style={s.navText}>◯ HOME</Text></Pressable>
          <Pressable onPress={onClose} style={s.navBtn}><Text style={s.navText}>✕ CLOSE (P)</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function RideCard({ ride, onOpen }: { ride: RideStatus; onOpen?: () => void }) {
  const what = ride.kind === 'air' ? 'WYRD Air' : 'WYRD Ride';
  const line = ride.phase === 'coming' ? `${what} on its way · ${eta(ride.seconds)}`
    : ride.phase === 'waiting' ? `${what} is here — walk to it and press E`
    : `To ${ride.dest} · ${(ride.metres / 1000).toFixed(1)} km · ${eta(ride.seconds)}`;
  return (
    <Pressable onPress={onOpen} style={[s.card, clip(10)]}>
      <Text style={s.cardKicker}>{ride.phase === 'riding' ? 'ON YOUR WAY' : ride.phase === 'waiting' ? 'YOUR RIDE IS HERE' : 'RIDE ORDERED'}</Text>
      <Text style={s.cardMain}>{line}</Text>
    </Pressable>
  );
}
const eta = (sec: number) => (sec < 60 ? `${Math.max(1, Math.round(sec))} s` : `${Math.round(sec / 60)} min`);

function Rides({ me, wallet, ride, onOrder, onCancel, onSkip, onFast }: {
  me: { x: number; z: number }; wallet: number | null; ride: RideStatus | null;
  onOrder: (dest: Found, kind: RideKind) => void; onCancel: () => void; onSkip: () => void; onFast: () => void;
}) {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<Found[]>(index ?? []);
  const [dest, setDest] = useState<Found | null>(null);
  useEffect(() => { if (!index) void searchIndex().then(setAll); }, []);
  if (ride) {
    return (
      <View style={s.body}>
        <Text style={s.h1}>{ride.kind === 'air' ? 'WYRD Air' : 'WYRD Ride'}</Text>
        <RideCard ride={ride} />
        <View style={s.actions}>
          {ride.phase !== 'riding' ? <Btn label="Cancel" tone={CY.red} onPress={onCancel} /> : null}
          <Btn label={ride.fast ? '×4 ON' : 'Fast ×4'} tone={CY.cyan} onPress={onFast} />
          <Btn label={ride.phase === 'riding' ? 'Skip to arrival' : 'Skip the wait'} tone={CY.yellow} onPress={onSkip} />
        </View>
        <Text style={s.rowSub}>{ride.phase === 'riding' ? 'Sit back: WYRD is driving. Skip only if you want to.' : 'Watch for it on the street, marked with the yellow arrow.'}</Text>
      </View>
    );
  }
  const results = search(all, query).slice(0, 5);
  const km = dest ? Math.hypot(dest.x - me.x, dest.z - me.z) / 1000 : 0;
  return (
    <View style={s.body}>
      <Text style={s.h1}>Where to?</Text>
      {dest ? (
        <>
          <Pressable onPress={() => setDest(null)} style={[s.row, s.rowOn]}>
            <Text style={s.rowMain} numberOfLines={1}>{dest.name}</Text>
            <Text style={s.rowSub}>{dest.kind}{dest.area ? ` · ${dest.area}` : ''} · {km.toFixed(1)} km · tap to change</Text>
          </Pressable>
          {(['road', 'air'] as const).map((k) => {
            const short = wallet != null && wallet < FARES[k];
            return (
              <Pressable key={k} disabled={short} onPress={() => onOrder(dest, k)} style={({ pressed }) => [s.option, clip(10), pressed && { opacity: 0.75 }, short && { opacity: 0.45 }]}>
                <Text style={s.optIcon}>{k === 'air' ? '🛸' : '🚘'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowMain}>{k === 'air' ? 'WYRD Air' : 'WYRD Ride'}</Text>
                  <Text style={s.rowSub}>{k === 'air' ? 'Flies straight there over the city' : 'Drives you there by road'} · about {eta((km * 1000 * (k === 'air' ? 1 : 1.45)) / SPEED[k])}</Text>
                </View>
                <Text style={[s.fare, short && { color: CY.red }]}>₦{FARES[k].toLocaleString('en-NG')}</Text>
              </Pressable>
            );
          })}
        </>
      ) : (
        <>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search a street, place or landmark" placeholderTextColor={CY.dim} style={[s.input, clip(8)]} autoFocus accessibilityLabel="Ride destination" />
          {results.map((f) => (
            <Pressable key={`${f.kind}${f.name}${f.x}`} onPress={() => { setDest(f); setQuery(''); }} style={(st) => [s.row, (st as { hovered?: boolean }).hovered && s.rowOn]}>
              <Text style={s.rowMain} numberOfLines={1}>{f.name}</Text>
              <Text style={s.rowSub}>{f.kind}{f.area ? ` · ${f.area}` : ''} · {(Math.hypot(f.x - me.x, f.z - me.z) / 1000).toFixed(1)} km</Text>
            </Pressable>
          ))}
          {query.trim().length >= 2 && !results.length ? <Text style={s.rowSub}>{all.length ? 'Nothing by that name.' : 'Loading the map…'}</Text> : null}
        </>
      )}
    </View>
  );
}

function Btn({ label, tone, onPress }: { label: string; tone: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.btn, clip(6), { borderColor: tone }, pressed && { opacity: 0.7 }]}><Text style={[s.btnText, { color: tone }]}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', right: 18, bottom: 78, top: 84, justifyContent: 'flex-end' },
  phone: { width: 330, height: '100%', maxHeight: 580, backgroundColor: '#05070B', borderWidth: 1.5, borderColor: CY.line, overflow: 'hidden' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  barText: { fontFamily: MONO, fontSize: 11, color: CY.muted, letterSpacing: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 6, gap: 8 },
  hello: { fontFamily: HEAD, fontSize: 15, color: CY.muted, marginTop: 6 },
  money: { fontFamily: MONO, fontSize: 30, color: CY.green, letterSpacing: 1 },
  apps: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  app: { width: 64, alignItems: 'center', gap: 5 },
  appIcon: { width: 54, height: 54, borderWidth: 1.5, backgroundColor: CY.glass2, alignItems: 'center', justifyContent: 'center' },
  appGlyph: { fontSize: 24, color: CY.text },
  appName: { fontFamily: HEAD, fontSize: 13, fontWeight: '700', color: CY.text, letterSpacing: 0.5 },
  h1: { fontFamily: HEAD, fontSize: 24, fontWeight: '700', color: CY.text, letterSpacing: 0.5 },
  input: { fontFamily: MONO, fontSize: 14, color: CY.text, backgroundColor: CY.glass2, borderWidth: 1, borderColor: CY.line, paddingHorizontal: 12, paddingVertical: 10 },
  row: { paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 2, borderLeftColor: 'transparent' },
  rowOn: { borderLeftColor: CY.cyan, backgroundColor: 'rgba(0,240,255,0.07)' },
  rowMain: { fontFamily: HEAD, fontSize: 16, fontWeight: '700', color: CY.text },
  rowSub: { fontFamily: MONO, fontSize: 11, color: CY.muted, lineHeight: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: CY.glass2, borderWidth: 1, borderColor: CY.line },
  optIcon: { fontSize: 26 },
  fare: { fontFamily: MONO, fontSize: 15, color: CY.yellow },
  card: { padding: 12, backgroundColor: 'rgba(252,238,10,0.08)', borderWidth: 1, borderColor: CY.lineY, gap: 3, marginTop: 4 },
  cardKicker: { fontFamily: MONO, fontSize: 10, color: CY.yellow, letterSpacing: 2 },
  cardMain: { fontFamily: HEAD, fontSize: 15, fontWeight: '700', color: CY.text },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  btn: { borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: CY.glass2 },
  btnText: { fontFamily: MONO, fontSize: 12, letterSpacing: 1 },
  feed: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(0,240,255,0.12)' },
  feedText: { fontFamily: HEAD, fontSize: 14, color: CY.text, lineHeight: 19 },
  nav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: 1, borderTopColor: CY.line },
  navBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  navText: { fontFamily: MONO, fontSize: 12, color: CY.cyan, letterSpacing: 1 },
});
