import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CY, HEAD, MONO } from './cyber';
import type { Station } from './radio';
import { index, search, searchIndex, type Found } from './search';
import type { WyrdLine } from './WyrdPanel';

/**
 * The WYRD phone (P): every character carries one, and WYRD runs it -- a WYRD ONE, titanium and glass (the Ikoyi heir
 * carries the black-and-gold Signature). A dynamic island shows what's live (a ride on its way, a call, the police on
 * you); the home screen is a lock-screen clock, widgets and apps: Calls (the people you can ring -- some can make the
 * police go away), Rides (a WYRD Ride by road or WYRD Air by sky, anywhere in Lagos, taken there for real), WYRD,
 * the map, the radio, the city's live feed and your wallet.
 */
export type RideKind = 'road' | 'air';
/** what the phone shows of a ride on its way, waiting, or under way */
export type RideStatus = { kind: RideKind; phase: 'coming' | 'waiting' | 'riding'; dest: string; metres: number; seconds: number; fast: boolean };
export const FARES: Record<RideKind, number> = { road: 500, air: 1500 };
const SPEED: Record<RideKind, number> = { road: 18, air: 45 }; // m/s, for the estimates

/** the police on you, as the phone shows it */
export type CopStatus = { stars: number; chasing: number; dist: number | null };
/** someone you can ring */
export type Contact = { id: string; name: string; role: string; does: string; tone: string };
/** how a call went: what was said (in turn), and how many stars it took off */
export type CallResult = { lines: [who: 'you' | 'them', text: string][]; cleared: number; outcome: string };

/** the people in your phone: everyone can ring the fines desk and WYRD; who else depends on who you were */
export function contactsFor(background: string | null | undefined): Contact[] {
  const all: Contact[] = [
    { id: 'fines', name: 'Alagbon Fines Desk', role: 'Lagos State Police', does: 'Pay ₦2,000 · clears 2 stars', tone: '#3D7BFF' },
    { id: 'wyrd', name: 'WYRD', role: 'The city mind', does: 'Asks it to put in a word · 1 star, if it\'s not too bad', tone: CY.magenta },
  ];
  if (background === 'heir') return [
    { id: 'daddy', name: 'Daddy', role: 'Chief A. Adebayo-Coker', does: 'Free · 1 star · once in 4 min', tone: '#E6C35C' },
    { id: 'lawyer', name: 'Barr. Funmi Adeyemi, SAN', role: 'The family lawyer', does: '₦10,000 · clears every star', tone: '#E6C35C' },
    { id: 'uncle', name: 'Uncle Tunde', role: 'Force HQ, Ikeja', does: 'Free · every star · once in 15 min · if he picks up', tone: '#E6C35C' },
    ...all,
  ];
  if (background === 'nurse') return [{ id: 'sgt', name: 'Sgt. Bello', role: 'Your patient at the clinic', does: 'Free · 1 star · once in 10 min', tone: CY.green }, ...all];
  if (background === 'conductor') return [{ id: 'chairman', name: 'Alhaji Musiliu', role: 'NURTW chairman, Ojuelegba', does: 'Free · 1 star · once in 10 min', tone: CY.yellow }, ...all];
  return all;
}

type Screen = 'home' | 'rides' | 'radio' | 'live' | 'calls' | 'wallet' | 'settings';

export function Phone({ wallet, me, ride, onOrder, onCancel, onSkip, onFast, stations, onAir, onTune, live, onMap, onWyrd, onClose, background, cop, onCall, teach, onTeach }: {
  wallet: number | null; me: { x: number; z: number }; ride: RideStatus | null;
  onOrder: (dest: Found, kind: RideKind) => void; onCancel: () => void; onSkip: () => void; onFast: () => void;
  stations: Station[]; onAir: Station | null; onTune: (i: number | null) => void;
  live: WyrdLine[]; onMap: () => void; onWyrd: () => void; onClose: () => void;
  background: string | null | undefined; cop: CopStatus; onCall: (id: string) => Promise<CallResult>;
  /** whether WYRD may learn from this player's play, and changing it */
  teach: boolean; onTeach: (on: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>(ride ? 'rides' : cop.stars > 0 ? 'calls' : 'home');
  const [calling, setCalling] = useState<Contact | null>(null);
  const [clock, setClock] = useState(() => lagosNow());
  useEffect(() => { const t = setInterval(() => setClock(lagosNow()), 10000); return () => clearInterval(t); }, []);
  const gold = background === 'heir';
  const T = gold ? GOLD : TI;
  const time = `${String(clock.getUTCHours()).padStart(2, '0')}:${String(clock.getUTCMinutes()).padStart(2, '0')}`;
  const date = clock.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  // the dynamic island: what's live right now
  const island = calling ? { dot: CY.green, text: calling.name } : cop.chasing ? { dot: CY.red, text: `POLICE${cop.dist != null ? ` · ${cop.dist} m` : ''}` }
    : ride ? { dot: CY.yellow, text: ride.phase === 'waiting' ? 'Ride is here' : eta(ride.seconds) } : cop.stars ? { dot: CY.red, text: '★'.repeat(cop.stars) } : null;

  const APPS: [string, string, () => void, string][] = [
    ['📞', 'Calls', () => setScreen('calls'), 'linear-gradient(160deg,#4BE38A,#13914A)'],
    ['🚘', 'Rides', () => setScreen('rides'), 'linear-gradient(160deg,#FFE76A,#E0A800)'],
    ['W', 'WYRD', onWyrd, 'linear-gradient(160deg,#FF5BE0,#7A1DFF)'],
    ['🗺', 'Map', onMap, 'linear-gradient(160deg,#45F3FF,#0A7BD8)'],
    ['📻', 'Radio', () => setScreen('radio'), 'linear-gradient(160deg,#FFB067,#E5532A)'],
    ['⚡', 'Live', () => setScreen('live'), 'linear-gradient(160deg,#FF6B8B,#C1123A)'],
    ['₦', 'Wallet', () => setScreen('wallet'), 'linear-gradient(160deg,#9CFFC9,#1E9E68)'],
    ['⚙', 'Settings', () => setScreen('settings'), 'linear-gradient(160deg,#B8C2D0,#5A6577)'],
  ];
  const DOCK = [APPS[0], APPS[1], APPS[2], APPS[3]];
  const back = () => { if (calling) setCalling(null); else setScreen('home'); };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={[s.device, { backgroundImage: T.frame, boxShadow: T.shadow } as object]}>
        {/* side buttons */}
        <View style={[s.btnSide, { left: -3, top: 110, height: 34, backgroundColor: T.edge }]} />
        <View style={[s.btnSide, { left: -3, top: 156, height: 54, backgroundColor: T.edge }]} />
        <View style={[s.btnSide, { right: -3, top: 140, height: 70, backgroundColor: T.edge }]} />
        <View style={[s.screen, { backgroundImage: T.wall } as object]}>
          {/* status bar and the island */}
          <View style={s.status}>
            <Text style={s.statusText}>{time}</Text>
            <View style={s.statusRight}>
              <View style={s.bars}>{[5, 7, 9, 11].map((h, i) => <View key={i} style={[s.barCol, { height: h }]} />)}</View>
              <Text style={s.statusText}>5G</Text>
              <View style={s.battery}><View style={[s.batteryFill, { width: '78%' }]} /></View>
            </View>
          </View>
          <View style={[s.island, island && s.islandWide]}>
            {island ? <><View style={[s.islandDot, { backgroundColor: island.dot, boxShadow: `0 0 8px ${island.dot}` } as object]} /><Text style={s.islandText} numberOfLines={1}>{island.text}</Text></> : null}
          </View>

          {screen === 'home' && !calling ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.home}>
              <Text style={[s.bigClock, { color: T.clock }]}>{time}</Text>
              <Text style={s.date}>{date} · Lagos</Text>
              {gold ? <Text style={s.signature}>WYRD ONE · SIGNATURE</Text> : null}
              <View style={s.widgets}>
                <Pressable onPress={() => setScreen('wallet')} style={[s.widget, s.glass, { flex: 1 }]}>
                  <Text style={s.wKicker}>NAIRA</Text>
                  <Text style={s.wBig}>₦{wallet == null ? '—' : Math.round(wallet).toLocaleString('en-NG')}</Text>
                </Pressable>
                {cop.stars > 0 ? (
                  <Pressable onPress={() => setScreen('calls')} style={[s.widget, s.glass, s.copWidget, { flex: 1 }]}>
                    <Text style={[s.wKicker, { color: '#FF6B8B' }]}>WANTED</Text>
                    <Text style={s.stars}>{'★'.repeat(cop.stars)}<Text style={{ color: 'rgba(255,255,255,0.25)' }}>{'★'.repeat(5 - cop.stars)}</Text></Text>
                    <Text style={s.wSmall}>{cop.chasing ? 'Police on you' : 'Make a call →'}</Text>
                  </Pressable>
                ) : onAir ? (
                  <Pressable onPress={() => setScreen('radio')} style={[s.widget, s.glass, { flex: 1 }]}>
                    <Text style={s.wKicker}>NOW PLAYING</Text>
                    <Text style={s.wMid} numberOfLines={1}>{onAir.name}</Text>
                    <Text style={s.wSmall}>{onAir.freq} FM</Text>
                  </Pressable>
                ) : null}
              </View>
              {ride ? <RideCard ride={ride} onOpen={() => setScreen('rides')} /> : null}
              <View style={s.grid}>
                {APPS.slice(4).map(([g, n, go, bg]) => <AppIcon key={n} glyph={g} name={n} bg={bg} onPress={go} />)}
              </View>
              <View style={{ flex: 1 }} />
              <View style={[s.dock, s.glass]}>
                {DOCK.map(([g, n, go, bg]) => <AppIcon key={n} glyph={g} name={n} bg={bg} onPress={go} badge={n === 'Calls' && cop.stars > 0} />)}
              </View>
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={s.appHead}>
                <Pressable onPress={back} style={s.backBtn} accessibilityLabel="Back"><Text style={s.backText}>‹</Text></Pressable>
                <Text style={s.appTitle}>{calling ? '' : { rides: 'Rides', radio: 'Radio', live: 'Live', calls: 'Calls', wallet: 'Wallet', settings: 'Settings', home: '' }[screen]}</Text>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 14 }}>
                {calling ? <Call who={calling} onCall={onCall} onDone={() => setCalling(null)} /> : null}
                {!calling && screen === 'calls' ? <Calls contacts={contactsFor(background)} cop={cop} onPick={setCalling} /> : null}
                {!calling && screen === 'rides' ? <Rides me={me} wallet={wallet} ride={ride} onOrder={onOrder} onCancel={onCancel} onSkip={onSkip} onFast={onFast} /> : null}
                {!calling && screen === 'radio' ? (
                  <View style={s.body}>
                    {stations.map((st, i) => {
                      const on = onAir?.name === st.name;
                      return (
                        <Pressable key={st.name} onPress={() => onTune(on ? null : i)} style={[s.listRow, s.glass, on && s.listOn]}>
                          <Text style={[s.freq, on && { color: CY.green }]}>{st.freq}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={s.rowMain} numberOfLines={1}>{st.name}</Text>
                            <Text style={s.rowSub}>{on ? '● On air · tap to switch off' : st.tag}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                {!calling && screen === 'live' ? (
                  <View style={s.body}>
                    {live.length ? [...live].reverse().slice(0, 12).map((l, i) => {
                      const unit = /^Traffic unit|^P-\d|→ Police|^WYRD →/.test(l.text);
                      return (
                        <View key={i} style={[s.feed, s.glass, { borderLeftColor: unit ? CY.magenta : CY.cyan }]}>
                          <Text style={s.feedWho}>{unit ? 'WYRD NETWORK' : 'CITY'} · {ago(l.at)}</Text>
                          <Text style={s.feedText}>{l.text.replace(/^WYRD city bulletin: /, '')}</Text>
                        </View>
                      );
                    }) : <Text style={s.rowSub}>Nothing on the wire yet. It comes in as the city moves.</Text>}
                  </View>
                ) : null}
                {!calling && screen === 'settings' ? (
                  <View style={s.body}>
                    <Pressable onPress={() => onTeach(!teach)} style={[s.listRow, s.glass]} accessibilityRole="switch" accessibilityState={{ checked: teach }} accessibilityLabel="Let WYRD learn from my play">
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowMain}>Let WYRD learn from my play</Text>
                        <Text style={s.rowSub}>{teach ? 'On' : 'Off'}</Text>
                      </View>
                      <View style={[s.toggle, teach && s.toggleOn]}><View style={[s.knob, teach && s.knobOn]} /></View>
                    </Pressable>
                    <View style={[s.card, s.glass]}>
                      <Text style={s.wKicker}>WHAT WYRD KEEPS</Text>
                      <Text style={s.rowSub}>What you say to WYRD and how your missions turn out, with personal details (emails, numbers, links) stripped.</Text>
                      <Text style={s.rowSub}>What the city sees around you, only as anonymous counts per street and hour: queues at junctions, crashes, red lights, rides by district, police stops. Some of it shows on the city's live feed by street ("Crash on Ikorodu Road"). Never you, never where you are.</Text>
                      <Text style={s.rowSub}>Nothing is kept past 180 days. It teaches WYRD the city — its hotspots, its jams — and goes into its training data.</Text>
                    </View>
                  </View>
                ) : null}
                {!calling && screen === 'wallet' ? (
                  <View style={s.body}>
                    <View style={[s.card, s.glass, { alignItems: 'center', paddingVertical: 22 }]}>
                      <Text style={s.wKicker}>BALANCE</Text>
                      <Text style={[s.wBig, { fontSize: 36 }]}>₦{wallet == null ? '—' : Math.round(wallet).toLocaleString('en-NG')}</Text>
                      <Text style={s.wSmall}>Held by WYRD · settled on the city's books</Text>
                    </View>
                    {([['WYRD Ride', '₦500'], ['WYRD Air', '₦1,500'], ['Danfo across town', '₦100'], ['Police fine', '₦2,000']] as const).map(([a, b]) => (
                      <View key={a} style={[s.listRow, s.glass]}><Text style={[s.rowMain, { flex: 1 }]}>{a}</Text><Text style={s.fare}>{b}</Text></View>
                    ))}
                  </View>
                ) : null}
              </ScrollView>
            </View>
          )}

          {/* the home bar: home from an app; closes the phone from home */}
          <Pressable onPress={() => (screen === 'home' && !calling ? onClose() : (setCalling(null), setScreen('home')))} style={s.homeBarHit} accessibilityLabel={screen === 'home' ? 'Close phone' : 'Home'}>
            <View style={s.homeBar} />
          </Pressable>
        </View>
      </View>
      <Text style={s.hint}>P or Esc to put it away</Text>
    </View>
  );
}

function AppIcon({ glyph, name, bg, onPress, badge }: { glyph: string; name: string; bg: string; onPress: () => void; badge?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.app, pressed && { transform: [{ scale: 0.92 }] }]} accessibilityLabel={name}>
      <View style={[s.appIcon, { backgroundImage: bg } as object]}>
        <Text style={[s.appGlyph, glyph === 'W' || glyph === '₦' ? { fontFamily: HEAD, fontWeight: '800', fontSize: 28, color: '#fff' } : null]}>{glyph}</Text>
        {badge ? <View style={s.badge}><Text style={s.badgeText}>!</Text></View> : null}
      </View>
      <Text style={s.appName}>{name}</Text>
    </Pressable>
  );
}

function Calls({ contacts, cop, onPick }: { contacts: Contact[]; cop: CopStatus; onPick: (c: Contact) => void }) {
  return (
    <View style={s.body}>
      {cop.stars > 0 ? (
        <View style={[s.card, s.glass, s.copWidget]}>
          <Text style={[s.wKicker, { color: '#FF6B8B' }]}>WANTED</Text>
          <Text style={s.stars}>{'★'.repeat(cop.stars)}<Text style={{ color: 'rgba(255,255,255,0.25)' }}>{'★'.repeat(5 - cop.stars)}</Text></Text>
          <Text style={s.wSmall}>{cop.chasing ? `Police on you${cop.dist != null ? ` · ${cop.dist} m off` : ''}. A call might make this go away.` : 'WYRD\'s units logged you. A call might make this go away.'}</Text>
        </View>
      ) : <Text style={[s.rowSub, { marginBottom: 4 }]}>No stars on you. Your people are a call away when you need them.</Text>}
      {contacts.map((c) => (
        <Pressable key={c.id} onPress={() => onPick(c)} style={({ pressed }) => [s.listRow, s.glass, pressed && { opacity: 0.8 }]}>
          <View style={[s.avatar, { borderColor: c.tone }]}><Text style={[s.avatarText, { color: c.tone }]}>{initials(c.name)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowMain} numberOfLines={1}>{c.name}</Text>
            <Text style={s.rowSub} numberOfLines={1}>{c.role}</Text>
            <Text style={[s.rowSub, { color: c.tone }]} numberOfLines={2}>{c.does}</Text>
          </View>
          <Text style={s.callIcon}>📞</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** a call: it rings, they pick up (or don't), and the conversation plays out a line at a time */
function Call({ who, onCall, onDone }: { who: Contact; onCall: (id: string) => Promise<CallResult>; onDone: () => void }) {
  const [res, setRes] = useState<CallResult | null>(null);
  const [shown, setShown] = useState(0);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const ring = setTimeout(() => { void onCall(who.id).then(setRes); }, 2200);
    const tick = setInterval(() => setSecs((v) => v + 1), 1000);
    return () => { clearTimeout(ring); clearInterval(tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- (once per call: the parent's handler changes every render)
  useEffect(() => {
    if (!res || shown >= res.lines.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 300 : 1300);
    return () => clearTimeout(t);
  }, [res, shown]);
  const done = !!res && shown >= res.lines.length;
  return (
    <View style={[s.body, { alignItems: 'center', paddingTop: 6 }]}>
      <View style={[s.bigAvatar, { borderColor: who.tone, boxShadow: `0 0 0 ${res ? 0 : 6}px ${who.tone}33, 0 0 30px ${who.tone}55` } as object]}>
        <Text style={[s.bigAvatarText, { color: who.tone }]}>{initials(who.name)}</Text>
      </View>
      <Text style={[s.rowMain, { fontSize: 20, textAlign: 'center' }]}>{who.name}</Text>
      <Text style={s.rowSub}>{!res ? 'calling…' : done ? 'call ended' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</Text>
      <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 8 }}>
        {res?.lines.slice(0, shown).map(([w, t], i) => (
          <View key={i} style={[s.bubble, w === 'you' ? s.bubbleYou : s.bubbleThem]}>
            <Text style={s.bubbleText}>{t}</Text>
          </View>
        ))}
      </View>
      {done ? (
        <>
          <View style={[s.outcome, { borderColor: res!.cleared ? CY.green : CY.dim }]}>
            <Text style={[s.outcomeText, { color: res!.cleared ? CY.green : CY.muted }]}>{res!.outcome}</Text>
          </View>
          <Pressable onPress={onDone} style={s.hangup} accessibilityLabel="Back to calls"><Text style={s.hangupText}>Done</Text></Pressable>
        </>
      ) : (
        <Pressable onPress={onDone} style={[s.hangup, { backgroundColor: '#E5323F' }]} accessibilityLabel="Hang up"><Text style={s.hangupText}>✕</Text></Pressable>
      )}
    </View>
  );
}

function RideCard({ ride, onOpen }: { ride: RideStatus; onOpen?: () => void }) {
  const what = ride.kind === 'air' ? 'WYRD Air' : 'WYRD Ride';
  const line = ride.phase === 'coming' ? `${what} on its way · ${eta(ride.seconds)}`
    : ride.phase === 'waiting' ? `${what} is here — walk to it and press E`
    : `To ${ride.dest} · ${(ride.metres / 1000).toFixed(1)} km · ${eta(ride.seconds)}`;
  return (
    <Pressable onPress={onOpen} style={[s.card, s.glass, { borderLeftWidth: 3, borderLeftColor: CY.yellow }]}>
      <Text style={[s.wKicker, { color: CY.yellow }]}>{ride.phase === 'riding' ? 'ON YOUR WAY' : ride.phase === 'waiting' ? 'YOUR RIDE IS HERE' : 'RIDE ORDERED'}</Text>
      <Text style={s.wMid}>{line}</Text>
    </Pressable>
  );
}

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
        <RideCard ride={ride} />
        <View style={s.actions}>
          {ride.phase !== 'riding' ? <Btn label="Cancel" tone={CY.red} onPress={onCancel} /> : null}
          <Btn label={ride.fast ? '×4 on' : 'Fast ×4'} tone={CY.cyan} onPress={onFast} />
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
          <Pressable onPress={() => setDest(null)} style={[s.listRow, s.glass, s.listOn]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowMain} numberOfLines={1}>{dest.name}</Text>
              <Text style={s.rowSub}>{dest.kind}{dest.area ? ` · ${dest.area}` : ''} · {km.toFixed(1)} km · tap to change</Text>
            </View>
          </Pressable>
          {(['road', 'air'] as const).map((k) => {
            const short = wallet != null && wallet < FARES[k];
            return (
              <Pressable key={k} disabled={short} onPress={() => onOrder(dest, k)} style={({ pressed }) => [s.listRow, s.glass, pressed && { opacity: 0.75 }, short && { opacity: 0.45 }]}>
                <Text style={s.optIcon}>{k === 'air' ? '🛸' : '🚘'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowMain}>{k === 'air' ? 'WYRD Air' : 'WYRD Ride'}</Text>
                  <Text style={s.rowSub}>{k === 'air' ? 'Flies straight there' : 'Drives you there by road'} · about {eta((km * 1000 * (k === 'air' ? 1 : 1.45)) / SPEED[k])}</Text>
                </View>
                <Text style={[s.fare, short && { color: CY.red }]}>₦{FARES[k].toLocaleString('en-NG')}</Text>
              </Pressable>
            );
          })}
        </>
      ) : (
        <>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search a street, place or landmark" placeholderTextColor="rgba(232,247,255,0.4)" style={[s.input, s.glass]} autoFocus accessibilityLabel="Ride destination" />
          {results.map((f) => (
            <Pressable key={`${f.kind}${f.name}${f.x}`} onPress={() => { setDest(f); setQuery(''); }} style={(st) => [s.listRow, (st as { hovered?: boolean }).hovered && s.glass]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowMain} numberOfLines={1}>{f.name}</Text>
                <Text style={s.rowSub}>{f.kind}{f.area ? ` · ${f.area}` : ''} · {(Math.hypot(f.x - me.x, f.z - me.z) / 1000).toFixed(1)} km</Text>
              </View>
            </Pressable>
          ))}
          {query.trim().length >= 2 && !results.length ? <Text style={s.rowSub}>{all.length ? 'Nothing by that name.' : 'Loading the map…'}</Text> : null}
        </>
      )}
    </View>
  );
}

function Btn({ label, tone, onPress }: { label: string; tone: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.pill, { borderColor: tone }, pressed && { opacity: 0.7 }]}><Text style={[s.pillText, { color: tone }]}>{label}</Text></Pressable>;
}

const eta = (sec: number) => (sec < 60 ? `${Math.max(1, Math.round(sec))} s` : `${Math.round(sec / 60)} min`);
const initials = (n: string) => n.replace(/^(Barr\.|Sgt\.|Alhaji|Uncle|Chief)\s+/, '').split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
/** Lagos time (UTC+1), as a Date whose UTC fields read as the Lagos clock */
const lagosNow = () => new Date(Date.now() + 3600_000);
const ago = (at: number) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** the two finishes: titanium with WYRD's neon wallpaper, and the heir's black-and-gold Signature */
const TI = {
  frame: 'linear-gradient(145deg,#5B6474 0%,#1A1F28 28%,#3A424F 55%,#141820 78%,#4A5262 100%)',
  edge: '#3A424F',
  shadow: '0 24px 70px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(255,255,255,0.18)',
  wall: 'radial-gradient(circle at 15% 0%, rgba(0,240,255,0.42), transparent 48%), radial-gradient(circle at 100% 85%, rgba(255,43,214,0.42), transparent 52%), radial-gradient(circle at 60% 45%, rgba(122,29,255,0.25), transparent 60%), linear-gradient(180deg,#070A14,#0B0716)',
  clock: '#F4FBFF',
};
const GOLD = {
  frame: 'linear-gradient(145deg,#F6DE8D 0%,#9C7A25 25%,#2A2112 50%,#B8902F 75%,#F2D67E 100%)',
  edge: '#B8902F',
  shadow: '0 24px 70px rgba(0,0,0,0.7), 0 0 30px rgba(230,195,92,0.25), inset 0 0 0 1px rgba(255,240,200,0.35)',
  wall: 'radial-gradient(circle at 50% -10%, rgba(230,195,92,0.45), transparent 50%), repeating-linear-gradient(45deg, rgba(230,195,92,0.05) 0 2px, transparent 2px 14px), linear-gradient(180deg,#0B0904,#151008 60%,#0A0805)',
  clock: '#F6DE8D',
};

const s = StyleSheet.create({
  wrap: { position: 'absolute', right: 22, bottom: 104, top: 84, justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  device: { width: 336, height: '100%', maxHeight: 660, borderRadius: 46, padding: 9, position: 'relative' },
  btnSide: { position: 'absolute', width: 4, borderRadius: 2 },
  screen: { flex: 1, borderRadius: 38, overflow: 'hidden', backgroundColor: '#070A14' },
  status: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 26, paddingTop: 14, height: 40 },
  statusText: { fontFamily: HEAD, fontSize: 14, fontWeight: '700', color: '#F4FBFF' },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  barCol: { width: 3, backgroundColor: '#F4FBFF', borderRadius: 1 },
  battery: { width: 22, height: 11, borderRadius: 3, borderWidth: 1.2, borderColor: 'rgba(244,251,255,0.7)', padding: 1 },
  batteryFill: { height: '100%', backgroundColor: '#F4FBFF', borderRadius: 1.5 },
  island: { position: 'absolute', top: 11, alignSelf: 'center', width: 96, height: 28, borderRadius: 14, backgroundColor: '#000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, zIndex: 2 },
  islandWide: { width: 170 },
  islandDot: { width: 8, height: 8, borderRadius: 4 },
  islandText: { fontFamily: HEAD, fontSize: 13, fontWeight: '700', color: '#F4FBFF', letterSpacing: 0.4, flexShrink: 1 },
  home: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 26, gap: 12 },
  bigClock: { fontFamily: HEAD, fontSize: 76, fontWeight: '300', lineHeight: 78, textAlign: 'center', letterSpacing: 1 },
  date: { fontFamily: HEAD, fontSize: 15, fontWeight: '600', color: 'rgba(244,251,255,0.75)', textAlign: 'center', marginTop: -6 },
  signature: { fontFamily: MONO, fontSize: 10, color: '#E6C35C', letterSpacing: 3, textAlign: 'center' },
  glass: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)' } as object,
  widgets: { flexDirection: 'row', gap: 10, marginTop: 6 },
  widget: { borderRadius: 20, padding: 12, gap: 2, minHeight: 84, justifyContent: 'center' },
  copWidget: { borderColor: 'rgba(255,60,90,0.55)', backgroundColor: 'rgba(255,0,60,0.14)' },
  wKicker: { fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: 'rgba(244,251,255,0.6)' },
  wBig: { fontFamily: HEAD, fontSize: 24, fontWeight: '700', color: '#F4FBFF', fontVariant: ['tabular-nums'] },
  wMid: { fontFamily: HEAD, fontSize: 16, fontWeight: '700', color: '#F4FBFF' },
  wSmall: { fontFamily: HEAD, fontSize: 12.5, fontWeight: '600', color: 'rgba(244,251,255,0.7)' },
  stars: { fontSize: 20, color: '#FF3C5A', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 4, marginTop: 4 },
  dock: { flexDirection: 'row', justifyContent: 'space-around', borderRadius: 28, paddingVertical: 10, paddingHorizontal: 6 },
  app: { width: 62, alignItems: 'center', gap: 5 },
  appIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)' } as object,
  appGlyph: { fontSize: 26 },
  appName: { fontFamily: HEAD, fontSize: 12.5, fontWeight: '700', color: '#F4FBFF' },
  badge: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF3C5A', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0B0716' },
  badgeText: { fontFamily: HEAD, fontSize: 11, fontWeight: '800', color: '#fff' },
  appHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 4 },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, lineHeight: 34, color: CY.cyan },
  appTitle: { fontFamily: HEAD, fontSize: 26, fontWeight: '700', color: '#F4FBFF' },
  body: { paddingHorizontal: 14, paddingTop: 4, gap: 8 },
  h1: { fontFamily: HEAD, fontSize: 18, fontWeight: '700', color: '#F4FBFF' },
  input: { fontFamily: HEAD, fontSize: 15, color: '#F4FBFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  listOn: { borderColor: 'rgba(61,255,154,0.6)', backgroundColor: 'rgba(61,255,154,0.1)' },
  freq: { fontFamily: MONO, fontSize: 15, color: 'rgba(244,251,255,0.8)', width: 52 },
  rowMain: { fontFamily: HEAD, fontSize: 16, fontWeight: '700', color: '#F4FBFF' },
  rowSub: { fontFamily: HEAD, fontSize: 12.5, fontWeight: '500', color: 'rgba(244,251,255,0.62)', lineHeight: 16 },
  optIcon: { fontSize: 26 },
  fare: { fontFamily: MONO, fontSize: 15, color: CY.yellow },
  card: { borderRadius: 18, padding: 12, gap: 3 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  pillText: { fontFamily: HEAD, fontSize: 14, fontWeight: '700' },
  feed: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, borderLeftWidth: 3, gap: 2 },
  feedWho: { fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: 'rgba(244,251,255,0.5)' },
  feedText: { fontFamily: HEAD, fontSize: 14, color: '#F4FBFF', lineHeight: 19 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  avatarText: { fontFamily: HEAD, fontSize: 16, fontWeight: '800' },
  callIcon: { fontSize: 20 },
  bigAvatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', marginTop: 8 },
  bigAvatarText: { fontFamily: HEAD, fontSize: 34, fontWeight: '800' },
  bubble: { maxWidth: '86%', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleYou: { alignSelf: 'flex-end', backgroundColor: 'rgba(0,240,255,0.22)', borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: HEAD, fontSize: 14.5, fontWeight: '500', color: '#F4FBFF', lineHeight: 19 },
  outcome: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginTop: 10 },
  outcomeText: { fontFamily: HEAD, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  hangup: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#23C268', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  hangupText: { fontFamily: HEAD, fontSize: 18, fontWeight: '800', color: '#fff' },
  toggle: { width: 46, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#23C268' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  homeBarHit: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 22, alignItems: 'center', justifyContent: 'center' },
  homeBar: { width: 124, height: 5, borderRadius: 3, backgroundColor: 'rgba(244,251,255,0.85)' },
  hint: { fontFamily: MONO, fontSize: 10.5, color: 'rgba(232,247,255,0.7)', letterSpacing: 0.8, textShadowColor: '#000', textShadowRadius: 4 },
});
