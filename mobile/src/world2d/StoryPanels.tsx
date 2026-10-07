import React, { useState } from 'react';
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

/** the variables where higher is worse: drawn red when high */
const BAD = new Set(['flooding', 'crime', 'displacement', 'pollution']);
type Tab = 'standing' | 'city' | 'people' | 'life';

/** Your standing (R): how Lagos sees you, how the city is doing, who remembers you, and who you are. */
export function Standing({ story, onClose, onLife, start = 'standing' }: {
  story: Story | null; onClose: () => void; onLife: (move: string) => void; start?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(start);
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
  // a 0..100 gauge, green when good for the people who live there
  const gauge = (key: string, label: string, v: number) => {
    const good = BAD.has(key) ? 100 - v : v;
    return (
      <View key={key} style={s.row}>
        <Text style={[s.rowLabel, { width: 130 }]} numberOfLines={1}>{label}</Text>
        <View style={s.track}><View style={[s.fill, { left: 0, width: `${v}%`, backgroundColor: good >= 55 ? '#3BB273' : good >= 40 ? '#E2B33C' : '#E5533D' }]} /></View>
        <Text style={[s.rowValue, { color: '#1E2A44' }]}>{v}</Text>
      </View>
    );
  };
  const f = story?.factions ?? {}, soc = story?.social ?? {};
  const districts = Object.keys(story?.rep.district ?? {}).sort((a, b) => DISTRICT_ORDER.indexOf(a) - DISTRICT_ORDER.indexOf(b));
  const city = story?.city ?? {}, vars = story?.cityVars ?? {};
  const people = Object.entries(story?.people ?? {}).sort((a, b) => Math.abs(b[1].trust) - Math.abs(a[1].trust));
  const tabs: [Tab, string][] = [['standing', 'Standing'], ['city', 'The city'], ['people', 'People'], ['life', 'Your life']];
  return (
    <View style={s.dialogueWrap}>
      <View style={[s.dialogue, { width: 560, maxHeight: '86%' }]}>
        <View style={s.tabs}>
          {tabs.map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}>
              <Text style={[s.tabText, tab === k && { color: '#FFFFFF' }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {!story ? <Text style={s.sub}>Loading…</Text> : (
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ gap: 14 }}>
            {tab === 'standing' && <>
              <Text style={s.sub}>What people think of you — it differs by street, by circle and by side. One act can win one and lose another.</Text>
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
            </>}
            {tab === 'city' && <>
              <Text style={s.sub}>How the districts you have touched are doing. Your choices move them; left alone, each drifts back to how it was.</Text>
              {Object.keys(city).length ? Object.entries(city).map(([d, v]) => (
                <View key={d} style={{ gap: 5 }}>
                  <Text style={s.group}>{d}</Text>
                  {Object.entries(vars).map(([k, label]) => gauge(k, label, v[k] ?? 50))}
                </View>
              )) : <Text style={s.sub}>Finish a mission and watch the city answer.</Text>}
              {story.bulletins?.length ? (
                <View style={{ gap: 4 }}>
                  <Text style={s.group}>WYRD's bulletins</Text>
                  {story.bulletins.slice(-5).reverse().map((b) => <Text key={b.at} style={s.memory}>• {b.text.replace(/^WYRD city bulletin: /, '')}</Text>)}
                </View>
              ) : null}
            </>}
            {tab === 'people' && <>
              <Text style={s.sub}>People remember what you did — promises, betrayals, help. Their trust opens doors, or closes them.</Text>
              {people.length ? people.map(([name, p]) => (
                <View key={name} style={s.person}>
                  {bar(name, p.trust)}
                  {p.notes.slice(-2).reverse().map((n) => <Text key={n.at} style={[s.memory, { color: '#5B6475' }]}>{n.felt === 'betrayed' ? '✗' : n.felt === 'grateful' ? '✓' : '·'} {n.what}</Text>)}
                </View>
              )) : <Text style={s.sub}>Nobody knows you well yet.</Text>}
            </>}
            {tab === 'life' && <>
              <View style={{ gap: 6 }}>
                <Text style={s.group}>Where you came from</Text>
                {story.background && story.backgrounds?.[story.background] ? (
                  <View style={[s.pick, s.pickOn]}>
                    <Text style={s.choiceLabel}>{story.backgrounds[story.background][0]}</Text>
                    <Text style={s.choiceDetail}>{story.backgrounds[story.background][1]}</Text>
                  </View>
                ) : <>
                  <Text style={s.sub}>Choose once. It changes who knows you and what you start with — never what you can become.</Text>
                  {Object.entries(story.backgrounds ?? {}).map(([k, [name, about]]) => (
                    <Pressable key={k} onPress={() => onLife(`background:${k}`)} style={({ pressed }) => [s.pick, pressed && { opacity: 0.8 }]}>
                      <Text style={s.choiceLabel}>{name}</Text>
                      <Text style={s.choiceDetail}>{about}</Text>
                    </Pressable>
                  ))}
                </>}
              </View>
              <View style={{ gap: 6 }}>
                <Text style={s.group}>Your hustle</Text>
                <Text style={s.sub}>{story.career && story.careers?.[story.career]
                  ? `${story.careers[story.career]} — ${story.careerStage ?? 'Starting out'} (${story.careerXp ?? 0} jobs' experience). Jobs of your trade pay more as you grow.`
                  : 'Pick a trade. Every job teaches you; jobs of your own trade pay more.'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(story.careers ?? {}).map(([k, name]) => (
                    <Pressable key={k} onPress={() => onLife(`career:${k}`)} style={[s.tab, story.career === k && s.tabOn]}>
                      <Text style={[s.tabText, story.career === k && { color: '#FFFFFF' }]}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>}
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
  tabs: { flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#EEF1F4' },
  tabOn: { backgroundColor: '#1E2A44' },
  tabText: { fontFamily: font, fontSize: 13, fontWeight: '800', color: '#1E2A44' },
  person: { borderWidth: 1, borderColor: '#E3E7EC', borderRadius: 12, padding: 10, gap: 4 },
  pick: { borderWidth: 1.5, borderColor: '#D5DAE1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  pickOn: { borderColor: '#C4572E', backgroundColor: '#FFF5EF' },
});
