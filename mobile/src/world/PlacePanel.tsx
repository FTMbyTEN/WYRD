import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Mono } from '../components/ui';
import { api } from '../api/client';
import type { CityActivity, CityWallet } from '../api/types';
import { PLACE_STYLE, type PlaceKind } from './places';
import { naira } from './HomesPanel';

/**
 * Inside a place: its name and kind, the things you can do here with what each costs or pays, and
 * what happened when you did one. The server decides the money and standing; health comes back here.
 */
export function PlacePanel({ kind, name, wallet, onResult, onClose, compact }: {
  kind: PlaceKind;
  name: string;
  wallet: CityWallet | null;
  onResult: (w: CityWallet, heal: number, delta: number) => void;
  onClose: () => void;
  compact: boolean;
}) {
  const st = PLACE_STYLE[kind];
  const [acts, setActs] = useState<CityActivity[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.cityPlaceActivities(kind).then(setActs).catch(() => setActs([])); }, [kind]);

  const go = (a: CityActivity) => {
    if (busy) return;
    setBusy(true);
    api.cityVisit(kind, a.id, name)
      .then((r) => {
        if ('error' in r) { setMsg(r.error); return; }
        onResult(r, r.heal ?? 0, r.delta ?? 0);
        const money = r.delta ? ` ${r.delta > 0 ? '+' : '−'}${naira(Math.abs(r.delta))}.` : '';
        setMsg(`${r.text}${money}${r.heal ? ` +${r.heal} health.` : ''}`);
      })
      .catch(() => setMsg('Sign in to do things in the city.'))
      .finally(() => setBusy(false));
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, { borderColor: st.css }]}>
      <View style={styles.head}>
        <Mono style={[styles.eyebrow, { color: st.css }]}>{st.icon} {st.label}</Mono>
        <Mono style={styles.balance}>{wallet ? naira(wallet.naira) : ''}</Mono>
      </View>
      <Mono style={styles.title} numberOfLines={2}>{name}</Mono>
      {acts === null ? <Mono style={styles.meta}>Walking in…</Mono> : acts.length === 0 ? <Mono style={styles.meta}>Nothing to do here yet.</Mono> : acts.map((a) => (
        <Pressable key={a.id} onPress={() => go(a)} style={[styles.act, { borderColor: st.css }]}>
          <Mono style={styles.actLabel}>{a.label}</Mono>
          <Mono style={[styles.actCost, { color: a.naira > 0 ? '#1aff9c' : a.naira < 0 ? '#ffc400' : '#8ea0ff' }]}>
            {a.naira > 0 ? `+${naira(a.naira)}` : a.naira < 0 ? naira(-a.naira) : 'FREE'}
            {a.heal ? ` · +${a.heal}♥` : ''}{a.standing ? ` · +${a.standing} standing` : ''}
          </Mono>
        </Pressable>
      ))}
      {msg ? <Mono style={styles.msg}>{msg}</Mono> : null}
      <Pressable onPress={onClose} style={[styles.leave, { borderColor: st.css }]}><Mono style={[styles.leaveText, { color: st.css }]}>LEAVE</Mono></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: '50%', marginLeft: -170, top: '18%', width: 340, backgroundColor: 'rgba(8,10,18,0.95)', borderWidth: 1, padding: 14, gap: 8 },
  wrapCompact: { top: 10, padding: 10, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, letterSpacing: 2 },
  balance: { fontSize: 13, color: '#1aff9c' },
  title: { fontSize: 16, color: '#ffffff' },
  meta: { fontSize: 10, color: '#8ea0ff' },
  act: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 2, backgroundColor: 'rgba(20,24,36,0.7)' },
  actLabel: { fontSize: 12, color: '#ffffff' },
  actCost: { fontSize: 9.5, letterSpacing: 0.8 },
  msg: { fontSize: 10.5, lineHeight: 15, color: '#ffd23d' },
  leave: { alignSelf: 'flex-end', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  leaveText: { fontSize: 9.5, letterSpacing: 1.4 },
});
