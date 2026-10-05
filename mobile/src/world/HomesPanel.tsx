import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Mono } from '../components/ui';
import { api } from '../api/client';
import type { CityHome, CityWallet } from '../api/types';

export const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/**
 * Your naira and a home in the city. Every home is listed by district with its weekly rent and its
 * price; rent one (first week paid now, then weekly) or buy it, if no one else lives there and you
 * can afford it. Your own home sits on top: go there, or move out.
 */
export function HomesPanel({ wallet, onWallet, onGoHome, onClose, compact }: {
  wallet: CityWallet | null;
  onWallet: (w: CityWallet) => void;
  onGoHome: (h: CityHome) => void;
  onClose: () => void;
  compact: boolean;
}) {
  const [homes, setHomes] = useState<CityHome[] | null>(null);
  const [district, setDistrict] = useState<string>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.cityHomes().then(setHomes).catch(() => setMsg("Homes can't load just now."));
  useEffect(() => { void load(); }, []);
  const districts = useMemo(() => Array.from(new Set((homes ?? []).map((h) => h.district))), [homes]);
  const list = (homes ?? []).filter((h) => district === 'all' || h.district === district).sort((a, b) => a.rent - b.rent);
  const mine = wallet?.home ?? null;

  const take = (h: CityHome, mode: 'rent' | 'own') => {
    if (busy) return;
    setBusy(true); setMsg(null);
    api.cityTakeHome(h.slug, mode)
      .then((r) => {
        if ('error' in r) setMsg(r.error);
        else { onWallet(r); setMsg(mode === 'rent' ? `Welcome home: ${h.name}. Rent is ${naira(h.rent)} a week.` : `You own ${h.name}. It's yours.`); void load(); }
      })
      .catch(() => setMsg('That did not go through. Try again.'))
      .finally(() => setBusy(false));
  };
  const leave = () => {
    setBusy(true);
    api.cityLeaveHome().then((r) => { if (!('error' in r)) { onWallet(r); setMsg('You moved out.'); void load(); } }).finally(() => setBusy(false));
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.head}>
        <Mono style={styles.eyebrow}>⌂ HOMES · LAGOS 2099</Mono>
        <Mono style={styles.balance}>{wallet ? naira(wallet.naira) : '…'}</Mono>
      </View>
      {mine ? (
        <View style={[styles.row, styles.mine]}>
          <View style={{ flex: 1 }}>
            <Mono style={styles.name}>YOUR HOME · {mine.name}</Mono>
            <Mono style={styles.meta}>{mine.mode === 'own' ? 'OWNED' : `RENTING · ${naira(mine.rent)}/WK${mine.paidUntil ? ` · PAID TO ${mine.paidUntil.slice(0, 10)}` : ''}`}</Mono>
          </View>
          <Pressable onPress={() => onGoHome(mine)} style={[styles.btn, styles.btnGo]}><Mono style={styles.btnTextDark}>GO HOME</Mono></Pressable>
          <Pressable onPress={leave} style={styles.btn}><Mono style={styles.btnText}>MOVE OUT</Mono></Pressable>
        </View>
      ) : <Mono style={styles.meta}>You don't have a home yet. Rent by the week, or buy outright.</Mono>}
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 5 }} showsHorizontalScrollIndicator={false}>
        {['all', ...districts].map((d) => (
          <Pressable key={d} onPress={() => setDistrict(d)} style={[styles.chip, district === d && styles.chipOn]}>
            <Mono style={[styles.chipText, district === d && { color: '#0d0f14' }]}>{d.toUpperCase()}</Mono>
          </Pressable>
        ))}
      </ScrollView>
      {msg ? <Mono style={styles.msg}>{msg}</Mono> : null}
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 4 }}>
        {homes === null ? <Mono style={styles.meta}>Finding homes…</Mono> : list.map((h) => {
          const rentOk = !h.taken && (wallet?.naira ?? 0) >= h.rent, buyOk = !h.taken && (wallet?.naira ?? 0) >= h.price;
          return (
            <View key={h.slug} style={[styles.row, h.mine && styles.mine]}>
              <View style={{ flex: 1 }}>
                <Mono style={styles.name} numberOfLines={1}>{h.name}</Mono>
                <Mono style={styles.meta}>{h.taken ? (h.mine ? 'YOURS' : 'TAKEN') : `${naira(h.rent)}/WK · BUY ${naira(h.price)}`}</Mono>
              </View>
              {!h.taken ? (
                <>
                  <Pressable onPress={() => take(h, 'rent')} style={[styles.btn, !rentOk && styles.off]} disabled={!rentOk}><Mono style={styles.btnText}>RENT</Mono></Pressable>
                  <Pressable onPress={() => take(h, 'own')} style={[styles.btn, !buyOk && styles.off]} disabled={!buyOk}><Mono style={styles.btnText}>BUY</Mono></Pressable>
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <Pressable onPress={onClose} style={[styles.btn, { alignSelf: 'flex-end' }]}><Mono style={styles.btnText}>CLOSE</Mono></Pressable>
    </View>
  );
}

const GOLD = '#ffc400';
const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: '8%', bottom: '8%', alignSelf: 'center', left: '50%', marginLeft: -220, width: 440, backgroundColor: 'rgba(8,10,18,0.95)', borderWidth: 1, borderColor: GOLD, padding: 12, gap: 8 },
  wrapCompact: { top: 6, bottom: 6, width: 380, marginLeft: -190, padding: 8, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: GOLD },
  balance: { fontSize: 16, color: '#1aff9c' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#1e2433', paddingHorizontal: 8, paddingVertical: 6 },
  mine: { borderColor: GOLD, backgroundColor: 'rgba(60,46,0,0.35)' },
  name: { fontSize: 11, color: '#ffffff' },
  meta: { fontSize: 8.5, letterSpacing: 1, color: '#8ea0ff' },
  msg: { fontSize: 10, color: '#ffd23d' },
  chip: { borderWidth: 1, borderColor: '#2a3a4a', paddingHorizontal: 8, paddingVertical: 5 },
  chipOn: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { fontSize: 8.5, letterSpacing: 1, color: '#d8dce6' },
  btn: { borderWidth: 1, borderColor: GOLD, paddingHorizontal: 8, paddingVertical: 6 },
  btnGo: { backgroundColor: GOLD },
  btnText: { fontSize: 9, letterSpacing: 1.2, color: GOLD },
  btnTextDark: { fontSize: 9, letterSpacing: 1.2, color: '#0d0f14' },
  off: { opacity: 0.3 },
});
