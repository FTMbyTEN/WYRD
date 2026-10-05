import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Mono } from '../components/ui';
import { colors } from '../theme';
import { api } from '../api/client';
import type { CityDesignNote } from '../api/types';

/**
 * The design studio: the owner and WYRD design the open world together. Talk the game through;
 * WYRD answers as a co-designer and writes proposals into the design log. Approve or reject each.
 * Approved missions, NPC lines, street tuning and city events go live in the world at once;
 * ideas and rules become the backlog to build next.
 */
const KIND_LABEL: Record<CityDesignNote['kind'], string> = {
  idea: 'IDEA · TO BUILD', rule: 'RULE · TO BUILD', mission: 'MISSION · LIVE', npc_lines: 'NPC LINES · LIVE', tuning: 'STREETS · LIVE', event: 'CITY EVENT · LIVE',
};

export function DesignStudio({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [log, setLog] = useState<{ who: 'you' | 'wyrd'; text: string }[]>([]);
  const [notes, setNotes] = useState<CityDesignNote[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'talk' | 'log'>('talk');
  const scroll = useRef<ScrollView>(null);

  const refresh = () => api.cityDesignNotes().then(setNotes).catch(() => {});
  useEffect(() => { void refresh(); }, []);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setLog((l) => [...l, { who: 'you', text }]);
    setBusy(true);
    try {
      const r = await api.cityDesignChat(text);
      setLog((l) => [...l, { who: 'wyrd', text: r.reply + (r.proposals.length ? `\n\n→ ${r.proposals.length} proposal${r.proposals.length > 1 ? 's' : ''} in the log` : '') }]);
      await refresh();
    } catch (e) {
      setLog((l) => [...l, { who: 'wyrd', text: `(I couldn't answer: ${e instanceof Error ? e.message : 'try again'})` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const decide = async (n: CityDesignNote, approve: boolean) => {
    try {
      const updated = await api.cityDesignDecide(n.id, approve);
      setNotes((all) => all.map((x) => (x.id === n.id ? updated : x)));
      if (approve) onApplied();
    } catch { /* stays as it was */ }
  };

  const pending = notes.filter((n) => n.author === 'wyrd' && n.status === 'proposed');
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Mono style={styles.eyebrow}>DESIGN STUDIO · YOU AND WYRD</Mono>
        <View style={styles.tabs}>
          <Pressable onPress={() => setTab('talk')} style={[styles.tab, tab === 'talk' && styles.tabOn]}><Mono style={[styles.tabText, tab === 'talk' && styles.tabTextOn]}>TALK</Mono></Pressable>
          <Pressable onPress={() => setTab('log')} style={[styles.tab, tab === 'log' && styles.tabOn]}>
            <Mono style={[styles.tabText, tab === 'log' && styles.tabTextOn]}>DESIGN LOG{pending.length ? ` · ${pending.length} TO DECIDE` : ''}</Mono>
          </Pressable>
          <Pressable onPress={onClose} style={styles.tab}><Mono style={styles.tabText}>CLOSE ✕</Mono></Pressable>
        </View>
      </View>

      {tab === 'talk' ? (
        <>
          <ScrollView ref={scroll} style={styles.body}>
            {log.length === 0 ? (
              <Mono style={styles.hint}>
                Design the game with WYRD. Ask what it wants as the Authority, pitch a mechanic, ask for missions, NPC voices, a Friday-evening
                rush on Ojuelegba Road… It answers as your co-designer and writes proposals into the log for you to approve.
              </Mono>
            ) : null}
            {log.map((m, i) => (
              <View key={i} style={[styles.msg, m.who === 'wyrd' ? styles.msgWyrd : styles.msgYou]}>
                <Mono style={styles.who}>{m.who === 'wyrd' ? 'WYRD' : 'YOU'}</Mono>
                <Mono style={m.who === 'wyrd' ? styles.textWyrd : styles.textYou}>{m.text}</Mono>
              </View>
            ))}
            {busy ? <Mono style={styles.hint}>WYRD is thinking about the design…</Mono> : null}
          </ScrollView>
          <View style={styles.row}>
            <TextInput
              value={draft} onChangeText={setDraft} onSubmitEditing={send} maxLength={2000} returnKeyType="send"
              placeholder="What should we build into the city next?" placeholderTextColor="#8a8f99" style={styles.input}
            />
            <Pressable onPress={send} style={[styles.send, busy && { opacity: 0.5 }]}><Mono style={styles.sendText}>SEND</Mono></Pressable>
          </View>
        </>
      ) : (
        <ScrollView style={styles.body}>
          {notes.filter((n) => n.author === 'wyrd').length === 0 ? <Mono style={styles.hint}>No proposals yet. Talk to WYRD about the game.</Mono> : null}
          {notes.filter((n) => n.author === 'wyrd').map((n) => (
            <View key={n.id} style={styles.note}>
              <Mono style={styles.kind}>{KIND_LABEL[n.kind]} · {n.status.toUpperCase()}</Mono>
              <Mono style={styles.title}>{n.title}</Mono>
              <Mono style={styles.text}>{n.body}</Mono>
              {n.payload ? <Mono style={styles.payload}>{summarise(n)}</Mono> : null}
              {n.status === 'proposed' ? (
                <View style={styles.decide}>
                  <Pressable onPress={() => decide(n, false)} style={styles.reject}><Mono style={styles.rejectText}>REJECT</Mono></Pressable>
                  <Pressable onPress={() => decide(n, true)} style={styles.approve}><Mono style={styles.approveText}>APPROVE</Mono></Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** A proposal's settings, in a line. */
function summarise(n: CityDesignNote): string {
  const p = n.payload as Record<string, unknown>;
  switch (n.kind) {
    case 'npc_lines': return (p.lines as string[]).map((l) => `“${l}”`).join('  ');
    case 'tuning': return [p.traffic != null ? `traffic ×${p.traffic}` : '', p.crowd != null ? `crowd ×${p.crowd}` : ''].filter(Boolean).join(' · ');
    case 'event': return `${p.startHour}:00–${p.endHour}:00 Lagos time${p.weather ? ` · ${p.weather}` : ''}${p.traffic ? ` · traffic ${p.traffic}` : ''}${p.broadcast ? ` · “${p.broadcast}”` : ''}`;
    case 'mission': return `${p.kind} · ${p.street} · +${p.reward} standing`;
    default: return '';
  }
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 70, bottom: 70, alignSelf: 'center', width: 640, maxWidth: '96%', backgroundColor: 'rgba(22,23,26,0.97)', padding: 16, gap: 10 },
  head: { gap: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 2.2, color: '#8ea0ff' },
  tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderColor: '#3a3d45', paddingHorizontal: 10, paddingVertical: 6 },
  tabOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  tabText: { fontSize: 10, letterSpacing: 1.6, color: '#c9ccd3' },
  tabTextOn: { color: colors.onSignal },
  body: { flex: 1 },
  hint: { fontSize: 12, color: '#9aa0aa', lineHeight: 19, marginVertical: 8 },
  msg: { marginVertical: 5, padding: 10, gap: 3 },
  msgWyrd: { backgroundColor: 'rgba(42,70,255,0.16)', borderLeftWidth: 3, borderLeftColor: colors.signal },
  msgYou: { backgroundColor: 'rgba(255,255,255,0.06)' },
  who: { fontSize: 9, letterSpacing: 1.8, color: '#8ea0ff' },
  textWyrd: { fontSize: 13, color: '#ffffff', lineHeight: 20 },
  textYou: { fontSize: 13, color: '#d9dbe0', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#ffffff', color: '#16171a', fontSize: 14, paddingHorizontal: 10, paddingVertical: 8 },
  send: { backgroundColor: colors.signal, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { fontSize: 11, letterSpacing: 1.8, color: colors.onSignal },
  note: { marginVertical: 6, padding: 12, backgroundColor: 'rgba(255,255,255,0.06)', gap: 4 },
  kind: { fontSize: 9, letterSpacing: 1.8, color: '#f2c200' },
  title: { fontSize: 14, color: '#ffffff' },
  text: { fontSize: 12, color: '#c9ccd3', lineHeight: 18 },
  payload: { fontSize: 11, color: '#8ea0ff', lineHeight: 17 },
  decide: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  reject: { borderWidth: 1, borderColor: '#5a5e68', paddingHorizontal: 12, paddingVertical: 6 },
  rejectText: { fontSize: 10, letterSpacing: 1.6, color: '#c9ccd3' },
  approve: { backgroundColor: colors.signal, paddingHorizontal: 12, paddingVertical: 6 },
  approveText: { fontSize: 10, letterSpacing: 1.6, color: colors.onSignal },
});
