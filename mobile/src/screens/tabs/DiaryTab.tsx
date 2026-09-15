import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useDiary, useDreams, useReasoning } from '../../api/hooks';

type Journal = 'DIARY' | 'DREAMS' | 'REASONING';

export function DiaryTab() {
  const [journal, setJournal] = useState<Journal>('DIARY');
  const { entries: diary } = useDiary();
  const { entries: dreams } = useDreams();
  const { notes: reasoning } = useReasoning();
  const [diaryI, setDiaryI] = useState(0);
  const entry = diary[diaryI];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.segRow}>
        {(['DIARY', 'DREAMS', 'REASONING'] as Journal[]).map((j) => (
          <Pressable
            key={j}
            onPress={() => setJournal(j)}
            style={[styles.segBtn, { borderColor: journal === j ? colors.green : colors.greenBorder }]}
          >
            <Mono style={{ fontSize: 9.5, letterSpacing: 1, color: journal === j ? colors.green : colors.greenDim }}>{j}</Mono>
          </Pressable>
        ))}
      </View>

      {journal === 'DREAMS' && (
        <ScrollView contentContainerStyle={styles.content}>
          <Display style={styles.heading}>{'>_ DREAMS'}</Display>
          <Mono style={styles.subheading}>old memory fragments blending during idle stretches</Mono>
          <View style={{ marginTop: 16, gap: 14 }}>
            {dreams.length === 0 && <Mono style={styles.empty}>no dreams yet — they only surface after a genuine idle stretch</Mono>}
            {dreams.map((d) => (
              <View key={d.timestamp} style={styles.dreamRow}>
                <Mono style={styles.dreamTime}>{new Date(d.timestamp).toTimeString().slice(0, 5)}</Mono>
                <Mono style={styles.dreamText}>{d.content}</Mono>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {journal === 'REASONING' && (
        <ScrollView contentContainerStyle={styles.content}>
          <Display style={styles.heading}>{'>_ REASONING_LOG'}</Display>
          <Mono style={styles.subheading}>tracked in the backend, viewable on demand</Mono>
          <View style={{ marginTop: 16, gap: 14 }}>
            {reasoning.length === 0 && <Mono style={styles.empty}>nothing logged yet</Mono>}
            {reasoning.map((r) => (
              <View key={r.file} style={styles.reasoningCard}>
                <Mono style={styles.reasoningFile}>{r.file}</Mono>
                <Mono style={styles.reasoningBody}>{r.content}</Mono>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {journal === 'DIARY' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRail}>
            {diary.map((d, i) => {
              const active = i === diaryI;
              return (
                <Pressable
                  key={d.date}
                  onPress={() => setDiaryI(i)}
                  style={[
                    styles.dateChip,
                    { borderColor: active ? colors.green : colors.greenBorder, backgroundColor: active ? 'rgba(0,255,65,0.08)' : 'rgba(0,15,4,0.7)' },
                  ]}
                >
                  <Mono style={{ fontSize: 10, letterSpacing: 1, color: active ? colors.green : colors.greenDim }}>
                    {i === 0 ? 'TODAY' : new Date(d.date).toDateString().slice(0, 3).toUpperCase()}
                  </Mono>
                  <Mono style={{ fontSize: 9, opacity: 0.75, color: active ? colors.green : colors.greenDim }}>{d.date.slice(5)}</Mono>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView contentContainerStyle={styles.content}>
            <Display style={styles.heading}>{'>_ DIARY'}</Display>
            <Mono style={styles.subheading}>one real entry per day, written by WYRD itself</Mono>
            {entry ? (
              <>
                <View style={styles.entryHeadRow}>
                  <Display style={styles.entryDate}>{entry.date}</Display>
                  <Mono style={styles.entryMeta}>
                    WRITTEN {new Date(entry.timestamp).toTimeString().slice(0, 5)} · UNPROMPTED
                  </Mono>
                </View>
                <Mono style={styles.entryText}>{entry.content}</Mono>
                <Mono style={styles.entryCount}>ENTRY {diaryI + 1} OF {diary.length} RETAINED</Mono>
              </>
            ) : (
              <Mono style={styles.empty}>no diary entry yet — one gets written once real memory exists</Mono>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segRow: { flexDirection: 'row', gap: 7, padding: 14, paddingBottom: 0 },
  segBtn: { flex: 1, borderWidth: 1, borderRadius: 2, paddingVertical: 8, alignItems: 'center' },
  content: { padding: 18, paddingBottom: 40 },
  heading: { fontSize: 20, letterSpacing: 1 },
  subheading: { marginTop: 2, fontSize: 9.5, letterSpacing: 1, color: colors.greenDim },
  empty: { marginTop: 16, fontSize: 11.5, color: colors.greenBorderDim },
  dreamRow: { borderLeftWidth: 2, borderLeftColor: colors.greenBorder, paddingLeft: 12 },
  dreamTime: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  dreamText: { marginTop: 4, fontSize: 13.5, lineHeight: 23, color: colors.mintBright, fontStyle: 'italic' },
  reasoningCard: { backgroundColor: 'rgba(0,15,4,0.7)', borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 4, padding: 12 },
  reasoningFile: { fontSize: 9, letterSpacing: 1, color: colors.greenBorderDim },
  reasoningBody: { marginTop: 5, fontSize: 12, lineHeight: 18, color: colors.mint },
  dateRail: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.greenBorderDim, paddingHorizontal: 14, paddingVertical: 10 },
  dateChip: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 11, paddingVertical: 8, marginRight: 7 },
  entryHeadRow: {
    marginTop: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 10, borderBottomWidth: 1, borderBottomColor: colors.greenBorder, paddingBottom: 10,
  },
  entryDate: { fontSize: 30, lineHeight: 30 },
  entryMeta: { fontSize: 10, letterSpacing: 1, color: colors.greenDim },
  entryText: { marginTop: 16, fontSize: 14, lineHeight: 24.5, color: colors.mint },
  entryCount: { marginTop: 22, textAlign: 'center', fontSize: 9.5, letterSpacing: 1, color: colors.greenBorderDim },
});
