import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { CY, HEAD, MONO, Panel, clip, scan } from './cyber';

/** One line in the conversation with WYRD: something you said, its answer, or a bulletin it sent. */
export type WyrdLine = { from: 'you' | 'wyrd' | 'bulletin'; text: string; at: number; petition?: boolean };

const PROMPTS: { label: string; text: string; petition?: boolean }[] = [
  { label: 'WHERE NEXT', text: 'Where should I go next? What is worth doing near me?' },
  { label: 'CITY STATUS', text: "What's happening in the city right now?" },
  { label: 'FIX THIS STREET', text: 'The street I am on needs fixing. Please look into it.', petition: true },
  { label: 'REPORT TROUBLE', text: 'I want to report trouble here.', petition: true },
];

const clock = (t: number) => new Date(t).toTimeString().slice(0, 8);

/** WYRD's newest answer types itself out, a few characters a frame */
function Typed({ text, live }: { text: string; live: boolean }) {
  const [n, setN] = useState(live ? 0 : text.length);
  useEffect(() => {
    if (!live) return;
    let i = 0; const id = setInterval(() => { i = Math.min(text.length, i + 3); setN(i); if (i >= text.length) clearInterval(id); }, 16);
    return () => clearInterval(id);
  }, [text, live]);
  return <Text style={s.text}>{text.slice(0, n)}{n < text.length ? <Text style={{ color: CY.cyan }}>▌</Text> : null}</Text>;
}

/** the link's signal: five bars that breathe, faster while WYRD is thinking */
function Signal({ busy }: { busy: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((v) => v + 1), busy ? 70 : 180); return () => clearInterval(id); }, [busy]);
  return (
    <View style={s.signal}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: 3, height: 5 + 13 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 1.3)), backgroundColor: busy ? CY.magenta : CY.cyan }} />
      ))}
    </View>
  );
}

/**
 * WYRD in the game (T): a link to the city mind. Speak to it, or petition it to change something; it
 * answers knowing where you are and what you are doing, and its bulletins come down the same line.
 */
export function WyrdPanel({ lines, onLine, situation, night, onClose }: {
  lines: WyrdLine[]; onLine: (l: WyrdLine) => void; situation: () => object; night: boolean; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [petition, setPetition] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rank, setRank] = useState<string | null>(null);
  const [standing, setStanding] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null); // the line typing itself out
  const scroll = useRef<ScrollView | null>(null);
  const input = useRef<TextInput | null>(null);
  void night;

  useEffect(() => {
    api.cityStatus().then((d) => { setRank(d.rank); setStanding(d.standing); }).catch(() => {});
    setTimeout(() => input.current?.focus(), 50);
  }, []);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 30); }, [lines.length, busy]);

  const send = async (said: string, asPetition: boolean) => {
    const t = said.trim();
    if (!t || busy) return;
    onLine({ from: 'you', text: t, at: Date.now(), petition: asPetition });
    setText(''); setBusy(true);
    let reply = '';
    try {
      const d = await api.cityAddress(asPetition ? 'petition' : 'speak', t, situation());
      setRank(d.rank); setStanding(d.standing);
      reply = d.say || '…';
    } catch (e) {
      const m = (e as Error).message ?? '';
      reply = /401|auth|sign/i.test(m) ? 'Sign in to WYRD and I will answer you by name.' : m.length < 120 && m ? m : 'Signal lost. Try me again in a moment.';
    }
    const at = Date.now();
    setFresh(at);
    onLine({ from: 'wyrd', text: reply, at });
    setBusy(false);
  };

  return (
    <View style={s.wrap}>
      <Panel accent={CY.magenta} edge="rgba(255,43,214,0.45)" cut={18} pad={0} fill="rgba(7,5,16,0.94)" style={{ flex: 1 }} grow>
        <View style={{ flex: 1, padding: 14, gap: 10 }}>
          {/* header: who you're linked to, and how it sees you */}
          <View style={s.head}>
            <View style={[s.badge, clip(6)]}><Text style={s.badgeText}>W</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>WYRD<Text style={{ color: CY.muted }}>://CITY.MIND</Text></Text>
              <Text style={s.status}>
                <Text style={{ color: busy ? CY.magenta : CY.green }}>● </Text>
                {busy ? 'PROCESSING' : 'LINK ESTABLISHED'}{rank ? `  ·  RANK ${rank.toUpperCase()}` : ''}{standing != null ? `  ·  ${standing > 0 ? '+' : ''}${standing}` : ''}
              </Text>
            </View>
            <Signal busy={busy} />
            <Pressable onPress={onClose} style={s.close}><Text style={s.closeText}>[ESC]</Text></Pressable>
          </View>
          <View style={s.rule} />

          {/* the log */}
          <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {!lines.length ? (
              <Text style={s.empty}>{'> channel open\n> ask about the city, or petition it to change something\n> WYRD sees where you stand'}</Text>
            ) : null}
            {lines.map((l, i) => l.from === 'bulletin' ? (
              <View key={i} style={s.bulletin}>
                <Text style={[s.tag, { color: CY.red }]}>{clock(l.at)}  ! CITY BULLETIN</Text>
                <Text style={[s.text, { color: '#FFC2CF' }]}>{l.text.replace(/^WYRD city bulletin: /, '')}</Text>
              </View>
            ) : (
              <View key={i} style={[s.entry, { borderLeftColor: l.from === 'you' ? (l.petition ? CY.magenta : CY.yellow) : CY.cyan }]}>
                <Text style={[s.tag, { color: l.from === 'you' ? (l.petition ? CY.magenta : CY.yellow) : CY.cyan }]}>
                  {clock(l.at)}  {l.from === 'you' ? (l.petition ? '> PETITION' : '> YOU') : 'WYRD'}
                </Text>
                {l.from === 'wyrd' ? <Typed text={l.text} live={l.at === fresh} /> : <Text style={s.text}>{l.text}</Text>}
              </View>
            ))}
            {busy ? <Text style={s.thinking}>WYRD // routing through the city… ▓▓▓▒▒░</Text> : null}
          </ScrollView>

          {/* quick lines, the mode and the input */}
          <View style={s.prompts}>
            {PROMPTS.map((p) => (
              <Pressable key={p.label} disabled={busy} onPress={() => void send(p.text, !!p.petition)} style={({ hovered }: { hovered?: boolean } & object) => [s.prompt, clip(6), { borderColor: p.petition ? 'rgba(255,43,214,0.6)' : CY.line }, hovered && { backgroundColor: p.petition ? 'rgba(255,43,214,0.15)' : 'rgba(0,240,255,0.12)' }]}>
                <Text style={[s.promptText, { color: p.petition ? CY.magenta : CY.cyan }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.row}>
            <Pressable onPress={() => setPetition((v) => !v)} style={[s.mode, clip(6), { backgroundColor: petition ? CY.magenta : CY.yellow }]}>
              <Text style={s.modeText}>{petition ? 'PETITION' : 'SPEAK'}</Text>
            </Pressable>
            <View style={[s.field, { borderColor: petition ? 'rgba(255,43,214,0.6)' : CY.line }]}>
              <Text style={[s.caret, { color: petition ? CY.magenta : CY.yellow }]}>{'>'}</Text>
              <TextInput ref={input} value={text} onChangeText={setText} maxLength={600} editable={!busy}
                placeholder={petition ? 'ask WYRD to change something' : 'say something to WYRD'} placeholderTextColor={CY.dim}
                onSubmitEditing={() => void send(text, petition)} blurOnSubmit={false} style={s.input} />
            </View>
            <Pressable disabled={busy || !text.trim()} onPress={() => void send(text, petition)} style={[s.send, clip(6), { opacity: busy || !text.trim() ? 0.4 : 1 }]}>
              <Text style={s.sendText}>SEND</Text>
            </Pressable>
          </View>
        </View>
      </Panel>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 92, right: 16, bottom: 84, width: 420, maxWidth: '94%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 34, height: 34, backgroundColor: CY.magenta, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: HEAD, fontSize: 20, fontWeight: '700', color: CY.ink },
  name: { fontFamily: HEAD, fontSize: 20, fontWeight: '700', letterSpacing: 2, color: CY.text },
  status: { fontFamily: MONO, fontSize: 10.5, color: CY.muted, letterSpacing: 0.8 },
  signal: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },
  close: { paddingHorizontal: 4, paddingVertical: 4 },
  closeText: { fontFamily: MONO, fontSize: 11, color: CY.muted },
  rule: { height: 1, backgroundColor: 'rgba(255,43,214,0.35)' },
  empty: { fontFamily: MONO, fontSize: 12.5, lineHeight: 20, color: CY.dim, paddingTop: 8 },
  entry: { borderLeftWidth: 2, paddingLeft: 10, gap: 3 },
  bulletin: { borderLeftWidth: 2, borderLeftColor: CY.red, paddingLeft: 10, gap: 3, backgroundColor: 'rgba(255,0,60,0.06)', paddingVertical: 4 },
  tag: { fontFamily: MONO, fontSize: 10.5, letterSpacing: 1 },
  text: { fontFamily: HEAD, fontSize: 16, fontWeight: '500', lineHeight: 21, color: CY.text },
  thinking: { fontFamily: MONO, fontSize: 11.5, color: CY.magenta, paddingLeft: 12 },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prompt: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  promptText: { fontFamily: HEAD, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.4 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  mode: { paddingHorizontal: 10, justifyContent: 'center' },
  modeText: { fontFamily: HEAD, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, color: CY.ink },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.45)', paddingLeft: 8, ...(scan as object) },
  caret: { fontFamily: MONO, fontSize: 15 },
  input: { flex: 1, paddingHorizontal: 8, paddingVertical: 9, fontFamily: MONO, fontSize: 14, color: CY.text, outlineStyle: 'none' } as object,
  send: { backgroundColor: CY.cyan, paddingHorizontal: 14, justifyContent: 'center' },
  sendText: { fontFamily: HEAD, fontSize: 14, fontWeight: '700', letterSpacing: 1.6, color: CY.ink },
});
