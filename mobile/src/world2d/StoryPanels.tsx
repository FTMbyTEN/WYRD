import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Story } from '../api/client';
import type { Choice } from './story';

/** A conversation in the street: who is speaking, what they say, and what you can answer. */
export function Dialogue({ who, line, choices, busy, onChoose, onClose }: {
  who: string; line: string; choices: Choice[]; busy: boolean; onChoose: (c: Choice) => void; onClose: () => void;
}) {
  return (
    <View style={s.dialogueWrap}>
      <View style={s.dialogue}>
        <Text style={s.who}>{who}</Text>
        <Text style={s.line}>{line}</Text>
        <View style={{ gap: 8, marginTop: 4 }}>
          {choices.map((c) => (
            <Pressable key={c.move} disabled={busy} onPress={() => onChoose(c)} style={({ pressed }) => [s.choice, pressed && { opacity: 0.85 }, busy && { opacity: 0.5 }]}>
              <Text style={s.choiceLabel}>{c.label}</Text>
              {c.detail ? <Text style={s.choiceDetail}>{c.detail}</Text> : null}
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} style={s.later}><Text style={s.laterText}>Not now</Text></Pressable>
      </View>
    </View>
  );
}

const DISTRICT_ORDER = ['Lagos Island', 'Mile 12', 'Ikoyi', 'Victoria Island', 'Yaba', 'Surulere', 'Ikeja'];

/** Your standing (R): how each faction, district and circle of Lagos sees you, and what the city remembers. */
export function Standing({ story, onClose }: { story: Story | null; onClose: () => void }) {
  const bar = (label: string, v: number) => (
    <View key={label} style={s.row}>
      <Text style={s.rowLabel} numberOfLines={1}>{label}</Text>
      <View style={s.track}>
        <View style={s.mid} />
        <View style={[s.fill, v >= 0 ? { left: '50%', width: `${v / 2}%`, backgroundColor: '#3BB273' } : { right: '50%', width: `${-v / 2}%`, backgroundColor: '#E5533D' }]} />
      </View>
      <Text style={[s.rowValue, { color: v > 0 ? '#2E8B57' : v < 0 ? '#C0392B' : '#8A93A3' }]}>{v > 0 ? `+${v}` : v}</Text>
    </View>
  );
  const f = story?.factions ?? {}, soc = story?.social ?? {};
  const districts = Object.keys(story?.rep.district ?? {}).sort((a, b) => DISTRICT_ORDER.indexOf(a) - DISTRICT_ORDER.indexOf(b));
  return (
    <View style={s.dialogueWrap}>
      <View style={[s.dialogue, { width: 520, maxHeight: '86%' }]}>
        <Text style={s.title}>Your standing in Lagos</Text>
        <Text style={s.sub}>What people think of you — it differs by street, by circle and by side. One act can win one and lose another.</Text>
        {!story ? <Text style={s.sub}>Loading…</Text> : (
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.group}>Factions</Text>
              {Object.entries(f).map(([k, name]) => bar(name, story.rep.faction[k] ?? 0))}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={s.group}>Circles</Text>
              {Object.entries(soc).map(([k, name]) => bar(name, story.rep.social[k] ?? 0))}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={s.group}>Neighbourhoods</Text>
              {districts.length ? districts.map((d) => bar(d, story.rep.district[d] ?? 0)) : <Text style={s.sub}>No neighbourhood knows you yet.</Text>}
            </View>
            {story.memory.length ? (
              <View style={{ gap: 4 }}>
                <Text style={s.group}>The city remembers</Text>
                {story.memory.slice(-6).reverse().map((m) => <Text key={m.at} style={s.memory}>• {m.what.replace(/^(\w+): /, '').replace(':', ' — ')}</Text>)}
              </View>
            ) : null}
          </ScrollView>
        )}
        <Pressable onPress={onClose} style={s.later}><Text style={s.laterText}>Close (R)</Text></Pressable>
      </View>
    </View>
  );
}

const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const s = StyleSheet.create({
  dialogueWrap: { position: 'absolute', inset: 0, backgroundColor: 'rgba(10,14,22,0.35)', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 90 } as object,
  dialogue: { width: 560, maxWidth: '94%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 8 },
  who: { fontFamily: font, fontSize: 13, fontWeight: '800', color: '#C4572E', letterSpacing: 0.3 },
  line: { fontFamily: font, fontSize: 16, lineHeight: 23, color: '#1E2A44' },
  choice: { borderWidth: 1.5, borderColor: '#1E2A44', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  choiceLabel: { fontFamily: font, fontSize: 15, fontWeight: '800', color: '#1E2A44' },
  choiceDetail: { fontFamily: font, fontSize: 12.5, color: '#5B6475' },
  later: { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 6 },
  laterText: { fontFamily: font, fontSize: 13, color: '#8A93A3', fontWeight: '700' },
  title: { fontFamily: font, fontSize: 22, fontWeight: '800', color: '#1E2A44' },
  sub: { fontFamily: font, fontSize: 13, color: '#5B6475', lineHeight: 18 },
  group: { fontFamily: font, fontSize: 12, fontWeight: '800', color: '#8A93A3', letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontFamily: font, fontSize: 13, color: '#1E2A44', width: 190 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#EEF1F4', overflow: 'hidden' },
  mid: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#C9CED6' },
  fill: { position: 'absolute', top: 0, bottom: 0 },
  rowValue: { fontFamily: font, fontSize: 13, fontWeight: '800', width: 34, textAlign: 'right' },
  memory: { fontFamily: font, fontSize: 13, color: '#1E2A44' },
});
