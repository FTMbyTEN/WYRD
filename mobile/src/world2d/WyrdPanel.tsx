import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';

/** One line in the conversation with WYRD: something you said, its answer, or a bulletin it sent. */
export type WyrdLine = { from: 'you' | 'wyrd' | 'bulletin'; text: string; at: number; petition?: boolean };

const PROMPTS: { label: string; text: string; petition?: boolean }[] = [
  { label: 'Where should I go?', text: 'Where should I go next? What is worth doing near me?' },
  { label: "What's happening?", text: "What's happening in the city right now?" },
  { label: 'Fix this street', text: 'The street I am on needs fixing. Please look into it.', petition: true },
  { label: 'Report trouble', text: 'I want to report trouble here.', petition: true },
];

/**
 * WYRD in the game (T): talk to the city mind, or petition it. It answers in its own voice, knowing where you
 * are and what you are doing; its bulletins and asides arrive in the same conversation.
 */
export function WyrdPanel({ lines, onLine, situation, night, onClose }: {
  lines: WyrdLine[]; onLine: (l: WyrdLine) => void; situation: () => object; night: boolean; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [petition, setPetition] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rank, setRank] = useState<string | null>(null);
  const scroll = useRef<ScrollView | null>(null);
  const input = useRef<TextInput | null>(null);

  useEffect(() => { api.cityStatus().then((d) => setRank(d.rank)).catch(() => {}); setTimeout(() => input.current?.focus(), 50); }, []);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 30); }, [lines.length, busy]);

  const send = async (said: string, asPetition: boolean) => {
    const t = said.trim();
    if (!t || busy) return;
    onLine({ from: 'you', text: t, at: Date.now(), petition: asPetition });
    setText(''); setBusy(true);
    try {
      const d = await api.cityAddress(asPetition ? 'petition' : 'speak', t, situation());
      setRank(d.rank);
      onLine({ from: 'wyrd', text: d.say || '…', at: Date.now() });
    } catch (e) {
      const m = (e as Error).message ?? '';
      onLine({ from: 'wyrd', text: /401|auth|sign/i.test(m) ? 'Sign in to WYRD and I will answer you by name.' : m.length < 120 && m ? m : 'The line is busy. Try me again in a moment.', at: Date.now() });
    }
    setBusy(false);
  };

  const c = night
    ? { bg: 'rgba(16,12,40,0.96)', edge: 'rgba(160,120,255,0.55)', text: '#F2EEFF', muted: '#A99DCC', me: '#2A2260', wyrd: '#1E1840', accent: '#B79CFF', field: '#120E2E' }
    : { bg: 'rgba(255,255,255,0.98)', edge: 'rgba(110,70,220,0.25)', text: '#1E2A44', muted: '#6B7385', me: '#EEF1F6', wyrd: '#F4F0FF', accent: '#7B4FE0', field: '#F6F7FA' };

  return (
    <View style={[s.panel, { backgroundColor: c.bg, borderColor: c.edge }]}>
      <View style={s.head}>
        <View style={[s.orb, { backgroundColor: c.accent }]} />
        <View style={{ flex: 1 }}>
          <Text style={[s.name, { color: c.text }]}>WYRD</Text>
          <Text style={[s.sub, { color: c.muted }]}>The city mind{rank ? ` · it knows you as ${rank}` : ''}</Text>
        </View>
        <Pressable onPress={onClose} style={s.close}><Text style={[s.closeText, { color: c.muted }]}>Close (Esc)</Text></Pressable>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
        {!lines.length ? <Text style={[s.empty, { color: c.muted }]}>Ask WYRD anything about Lagos, or petition it to change something. It sees where you stand.</Text> : null}
        {lines.map((l, i) => l.from === 'bulletin' ? (
          <Text key={i} style={[s.bulletin, { color: c.muted, borderColor: c.edge }]}>{l.text.replace(/^WYRD city bulletin: /, 'City bulletin · ')}</Text>
        ) : (
          <View key={i} style={[s.bubble, l.from === 'you' ? { alignSelf: 'flex-end', backgroundColor: c.me } : { alignSelf: 'flex-start', backgroundColor: c.wyrd }]}>
            {l.petition ? <Text style={[s.tag, { color: c.accent }]}>PETITION</Text> : null}
            <Text style={[s.text, { color: c.text }]}>{l.text}</Text>
          </View>
        ))}
        {busy ? <Text style={[s.thinking, { color: c.accent }]}>WYRD is thinking…</Text> : null}
      </ScrollView>

      <View style={s.prompts}>
        {PROMPTS.map((p) => (
          <Pressable key={p.label} disabled={busy} onPress={() => void send(p.text, !!p.petition)} style={[s.prompt, { borderColor: c.edge }]}>
            <Text style={[s.promptText, { color: c.text }]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.row}>
        <Pressable onPress={() => setPetition((v) => !v)} style={[s.mode, { borderColor: c.edge, backgroundColor: petition ? c.accent : 'transparent' }]}>
          <Text style={[s.modeText, { color: petition ? '#FFFFFF' : c.text }]}>{petition ? 'Petition' : 'Speak'}</Text>
        </Pressable>
        <TextInput ref={input} value={text} onChangeText={setText} maxLength={600} editable={!busy}
          placeholder={petition ? 'Ask WYRD to change something…' : 'Say something to WYRD…'} placeholderTextColor={c.muted}
          onSubmitEditing={() => void send(text, petition)} blurOnSubmit={false}
          style={[s.input, { color: c.text, backgroundColor: c.field, borderColor: c.edge }]} />
        <Pressable disabled={busy || !text.trim()} onPress={() => void send(text, petition)} style={[s.send, { backgroundColor: c.accent, opacity: busy || !text.trim() ? 0.5 : 1 }]}>
          <Text style={s.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const s = StyleSheet.create({
  panel: { position: 'absolute', top: 80, right: 16, bottom: 76, width: 380, maxWidth: '92%', borderRadius: 18, borderWidth: 1, padding: 14, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orb: { width: 30, height: 30, borderRadius: 15, shadowColor: '#9B6BFF', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  name: { fontFamily: font, fontSize: 17, fontWeight: '800', letterSpacing: 1.5 },
  sub: { fontFamily: font, fontSize: 12 },
  close: { paddingHorizontal: 6, paddingVertical: 4 },
  closeText: { fontFamily: font, fontSize: 12, fontWeight: '700' },
  empty: { fontFamily: font, fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 12, paddingTop: 20 },
  bubble: { maxWidth: '86%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  tag: { fontFamily: font, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2 },
  text: { fontFamily: font, fontSize: 14, lineHeight: 20 },
  bulletin: { fontFamily: font, fontSize: 12, lineHeight: 17, borderLeftWidth: 2, paddingLeft: 8, marginVertical: 2 },
  thinking: { fontFamily: font, fontSize: 12.5, fontWeight: '700', paddingLeft: 4 },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prompt: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  promptText: { fontFamily: font, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  mode: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  modeText: { fontFamily: font, fontSize: 12.5, fontWeight: '800' },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontFamily: font, fontSize: 14, outlineStyle: 'none' } as object,
  send: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  sendText: { fontFamily: font, fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
});
