import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Display, Mono } from '../../components/ui';
import { colors, fonts } from '../../theme';
import { Glyph } from '../../components/glyph/Glyph';
import { useDiary, useMind } from '../../api/hooks';
import type { DiaryEntry } from '../../api/types';
import { FeedTab } from './FeedTab';
import { DreamsCosmos } from '../../components/DreamsCosmos';
import { NeuralReasoning } from '../../components/NeuralReasoning';

type Journal = 'DIARY' | 'DREAMS' | 'REASONING' | 'FEED';

const serif = Platform.select({ web: 'Georgia, "Iowan Old Style", "Noto Serif", "Times New Roman", serif', ios: 'Georgia', default: 'serif' });

const SECTIONS: { key: Journal; name: string; what: string; Icon: (p: { c: string }) => React.ReactElement }[] = [
  { key: 'DIARY', name: 'DIARY', what: 'what WYRD writes each day', Icon: PenIcon },
  { key: 'DREAMS', name: 'DREAMS', what: 'memories recombined at night', Icon: MoonIcon },
  { key: 'REASONING', name: 'REASONING', what: 'its mind, firing', Icon: NodesIcon },
  { key: 'FEED', name: 'FEED', what: 'everything it takes in', Icon: WaveIcon },
];

const DAY = 86400000;
const dateOf = (e: DiaryEntry) => new Date(`${e.date}T12:00:00`);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** JOURNAL: WYRD's notebook. A masthead with today's date and mood; folder tabs for the diary,
 *  dreams, reasoning and feed; and the diary itself as a ruled notebook page, with a calendar of
 *  the days it wrote and an index of every entry. */
export function JournalTab({ onOpenConcept, onOpenGrowth, onOpenGlobe }: {
  onOpenConcept: () => void;
  onOpenGrowth: () => void;
  onOpenGlobe: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [journal, setJournal] = useState<Journal>('DIARY');
  const { entries: diary } = useDiary(120);
  const { mind } = useMind();

  const first = diary.length ? dateOf(diary[diary.length - 1]) : new Date();
  const volume = Math.max(1, Math.floor((Date.now() - first.getTime()) / (DAY * 30)) + 1);
  const today = new Date();

  return (
    <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]} stickyHeaderIndices={[]}>
      {/* masthead */}
      <View style={styles.masthead}>
        <Mono style={styles.figEyebrow}>JOURNAL</Mono>
        <Text style={[styles.figTitle, { fontFamily: fonts.display }]}>What WYRD lived today</Text>
        <View style={styles.mastRule} />
        <View style={styles.mastRow}>
          <Mono style={styles.mastSide}>VOL. {volume} · NO. {diary.length}</Mono>
          <Mono style={[styles.mastSide, { textAlign: 'right' }]}>
            {today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}
          </Mono>
        </View>
        <View style={styles.mastRow}>
          <Mono style={styles.mastSide}>A MIND, KEPT IN ITS OWN WORDS</Mono>
          <Mono style={[styles.mastSide, { textAlign: 'right' }]}>
            {mind ? `MOOD · ${mind.mood.toUpperCase()}${mind.focusTopic ? ` · THINKING ABOUT ${mind.focusTopic.toUpperCase()}` : ''}` : ''}
          </Mono>
        </View>
        <View style={styles.mastRuleDouble} />
      </View>

      {/* folder tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs}>
        {SECTIONS.map(({ key, name, what, Icon }) => {
          const on = key === journal;
          return (
            <Pressable
              key={key}
              onPress={() => setJournal(key)}
              style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && !on && { opacity: 0.7 }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Icon c={on ? colors.mint : colors.greenDim} />
              <View style={{ flexShrink: 1 }}>
                <Mono style={[styles.tabName, on && { color: colors.mint }]}>{name}</Mono>
                {wide && <Mono numberOfLines={1} style={styles.tabWhat}>{what}</Mono>}
              </View>
              {key === 'DIARY' && diary.length > 0 && <Mono style={[styles.count, on && styles.countOn]}>{diary.length}</Mono>}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.sheet, !wide && { padding: 8 }]}>
        {journal === 'DIARY' && <Diary entries={diary} wide={wide} />}
        {journal === 'DREAMS' && <View style={styles.embed}><DreamsCosmos /></View>}
        {journal === 'REASONING' && <View style={styles.embed}><NeuralReasoning /></View>}
        {journal === 'FEED' && (
          <View style={[styles.embed, { maxWidth: 900, alignSelf: 'center', width: '100%' }]}>
            <FeedTab onOpenConcept={onOpenConcept} onOpenGrowth={onOpenGrowth} onOpenGlobe={onOpenGlobe} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------
// the diary

function Diary({ entries, wide }: { entries: DiaryEntry[]; wide: boolean }) {
  const [i, setI] = useState(0);
  const entry = entries[i];
  useEffect(() => { if (i >= entries.length && entries.length) setI(0); }, [entries.length, i]);

  // turning to another entry: a short fade
  const turn = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    turn.setValue(0);
    Animated.timing(turn, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [i, turn]);

  if (!entries.length) {
    return (
      <View style={styles.emptyBox}>
        <PenIcon c={colors.greenBorder} size={40} />
        <Text style={[styles.emptyTitle, { fontFamily: serif }]}>The first page is still blank.</Text>
        <Mono style={styles.muted}>WYRD writes one entry a day, once it has lived enough of one to write about.</Mono>
      </View>
    );
  }

  const index = (
    <View style={{ gap: 18 }}>
      <Calendar entries={entries} selected={entry} onPick={(e) => setI(entries.indexOf(e))} />
      <View style={{ gap: 6 }}>
        <Mono style={styles.label}>INDEX · {entries.length} ENTRIES</Mono>
        <ScrollView style={{ maxHeight: wide ? 420 : 220 }} nestedScrollEnabled>
          {entries.map((e, k) => {
            const on = k === i;
            return (
              <Pressable key={e.timestamp} onPress={() => setI(k)} style={({ pressed }) => [styles.indexRow, on && styles.indexRowOn, pressed && { opacity: 0.7 }]}>
                <Mono style={[styles.indexDate, on && { color: '#FFFAF2' }]}>{dateOf(e).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }).toUpperCase()}</Mono>
                <Text numberOfLines={1} style={[styles.indexLine, { fontFamily: serif }, on && { color: '#FFFAF2' }]}>{e.content.split(/(?<=[.!?])\s/)[0]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <View style={[styles.diary, wide && styles.diaryWide]}>
      {wide && <View style={styles.side}>{index}</View>}
      <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
        <View style={styles.days}>
          {entries.slice(0, 7).map((e, k) => {
            const on = k === i, d = dateOf(e);
            return (
              <Pressable key={e.date} onPress={() => setI(k)} style={({ pressed }) => [styles.dayChip, on && styles.dayOn, pressed && !on && { opacity: 0.7 }]} accessibilityLabel={`Diary for ${e.date}`}>
                <Mono style={[styles.dayName, on && { color: colors.ochre }]}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Mono>
                <Text style={[styles.dayNum, { fontFamily: fonts.displayBold }, on && { color: colors.cream }]}>{d.getDate()}</Text>
              </Pressable>
            );
          }).reverse()}
        </View>
        <Animated.View style={{ opacity: turn, transform: [{ translateY: turn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          <NotebookPage entry={entry} number={entries.length - i} narrow={!wide} />
        </Animated.View>
        <View style={styles.pager}>
          <Pressable disabled={i >= entries.length - 1} onPress={() => setI(i + 1)} style={({ pressed }) => [styles.pageBtn, i >= entries.length - 1 && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}>
            <Mono style={styles.pageBtnText}>← EARLIER</Mono>
          </Pressable>
          <Mono style={styles.muted}>ENTRY {entries.length - i} OF {entries.length}</Mono>
          <Pressable disabled={i === 0} onPress={() => setI(i - 1)} style={({ pressed }) => [styles.pageBtn, i === 0 && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}>
            <Mono style={styles.pageBtnText}>LATER →</Mono>
          </Pressable>
        </View>
        {!wide && index}
      </View>
    </View>
  );
}

/** One entry on a ruled notebook page: a red-less margin line, the date, and the words. */
function NotebookPage({ entry, number, narrow }: { entry: DiaryEntry; number: number; narrow?: boolean }) {
  const margin = narrow ? 30 : 54;
  const d = dateOf(entry);
  const written = new Date(entry.timestamp);
  const n = words(entry.content);
  const text = entry.content.trim();
  const sentences = text.split(/(?<=[.!?])\s+/);
  // the most striking line, pulled out: the longest sentence that isn't the first
  const pull = sentences.length > 2 ? [...sentences.slice(1)].sort((a, b) => b.length - a.length)[0] : null;
  const LINE = 30;

  return (
    <View style={[styles.notebook, narrow && { paddingLeft: 44, paddingRight: 16 }]}>
      {/* ruling */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          {[...Array(60)].map((_, k) => (
            <Line key={k} x1="0" x2="100%" y1={118 + k * LINE} y2={118 + k * LINE} stroke="#e4e4e2" strokeWidth={1} />
          ))}
          <Line x1={margin} x2={margin} y1="0" y2="100%" stroke="#bdbdbd" strokeWidth={1} />
          <Line x1={margin + 4} x2={margin + 4} y1="0" y2="100%" stroke="#dcdcdc" strokeWidth={1} />
        </Svg>
        {/* binding holes */}
        {!narrow && [0.15, 0.5, 0.85].map((t) => <View key={t} style={[styles.hole, { top: `${t * 100}%` as `${number}%` }]} />)}
      </View>

      <View style={styles.pageHead}>
        <View style={{ flex: 1 }}>
          <Mono style={styles.label}>{d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase()}</Mono>
          <Display style={[styles.bigDate, narrow && { fontSize: 26, lineHeight: 30 }]}>{d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</Display>
        </View>
        <View style={styles.stamp}>
          <Mono style={styles.stampNo}>№ {number}</Mono>
          <Mono style={styles.stampTime}>{written.toTimeString().slice(0, 5)}</Mono>
        </View>
      </View>

      <Text selectable style={[styles.entryText, { fontFamily: serif, lineHeight: LINE }, narrow && { fontSize: 16 }]}>
        <Text style={styles.dropCap}>{text.charAt(0)}</Text>
        {text.slice(1)}
      </Text>

      {pull && pull.length > 40 && (
        <View style={styles.pull}>
          <Text style={[styles.pullText, { fontFamily: serif }]}>“{pull.replace(/[.!?]$/, '')}”</Text>
        </View>
      )}

      <View style={styles.signoff}>
        <Text style={[styles.sig, { fontFamily: serif }]}>— W.</Text>
        <Mono style={styles.muted}>{n} WORDS · WRITTEN UNPROMPTED AT {written.toTimeString().slice(0, 5)}</Mono>
      </View>
    </View>
  );
}

/** Twelve weeks of days; a filled square is a day WYRD wrote. */
function Calendar({ entries, selected, onPick }: { entries: DiaryEntry[]; selected?: DiaryEntry; onPick: (e: DiaryEntry) => void }) {
  const byDay = useMemo(() => {
    const m = new Map<string, DiaryEntry>();
    for (const e of entries) if (!m.has(e.date)) m.set(e.date, e);
    return m;
  }, [entries]);
  const weeks = 12;
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end.getTime() - ((weeks * 7 - 1) - ((6 - end.getDay() + 7) % 7)) * DAY);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday
  const cols: Date[][] = [];
  for (let w = 0; w < weeks; w++) cols.push([...Array(7)].map((_, d) => new Date(start.getTime() + (w * 7 + d) * DAY)));
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const streak = (() => {
    let n = 0;
    for (let d = new Date(end); byDay.has(key(d)); d = new Date(d.getTime() - DAY)) n++;
    return n;
  })();

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Mono style={styles.label}>THE LAST 12 WEEKS</Mono>
        <Mono style={styles.label}>{streak > 1 ? `${streak}-DAY STREAK` : `${byDay.size} DAYS WRITTEN`}</Mono>
      </View>
      <View style={styles.cal}>
        {cols.map((col, w) => (
          <View key={w} style={styles.calCol}>
            {col.map((d) => {
              const e = byDay.get(key(d));
              const on = selected && e && e.date === selected.date;
              const future = d.getTime() > end.getTime();
              return (
                <Pressable
                  key={key(d)}
                  disabled={!e}
                  onPress={() => e && onPick(e)}
                  accessibilityLabel={e ? `Entry for ${key(d)}` : undefined}
                  style={[styles.calDay, e ? styles.calDayOn : null, on && styles.calDaySel, future && { opacity: 0.25 }]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={[styles.calDay, { width: 10, height: 10 }]} /><Mono style={styles.legend}>no entry</Mono>
        <View style={[styles.calDay, styles.calDayOn, { width: 10, height: 10 }]} /><Mono style={styles.legend}>an entry</Mono>
        <View style={[styles.calDay, styles.calDaySel, { width: 10, height: 10 }]} /><Mono style={styles.legend}>reading</Mono>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// icons

function PenIcon({ c, size = 18 }: { c: string; size?: number }) {
  return <Glyph name="pen" size={size} color={c} />;
}
function MoonIcon({ c }: { c: string }) {
  return <Glyph name="dream" size={18} color={c} />;
}
function NodesIcon({ c }: { c: string }) {
  return <Glyph name="concept" size={18} color={c} />;
}
function WaveIcon({ c }: { c: string }) {
  return <Glyph name="feed" size={18} color={c} />;
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 0 },
  pageWide: { maxWidth: 1120, width: '100%', alignSelf: 'center', paddingHorizontal: 28 },
  muted: { fontSize: 10, letterSpacing: 1, color: colors.greenDim },
  label: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },

  masthead: { gap: 6, marginBottom: 18 },
  figEyebrow: { fontSize: 11, letterSpacing: 1.4, color: colors.signal, fontFamily: fonts.bodyBold },
  figTitle: { fontSize: 34, lineHeight: 40, color: colors.mint, marginBottom: 8 },
  days: { flexDirection: 'row', gap: 8 },
  dayChip: { flex: 1, maxWidth: 92, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder },
  dayOn: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  dayName: { fontSize: 11, color: colors.greenDim, fontFamily: fonts.bodyMedium },
  dayNum: { fontSize: 22, lineHeight: 26, color: colors.mint },
  mastRule: { height: 3, backgroundColor: colors.mint },
  mastRuleDouble: { height: 5, borderTopWidth: 1, borderBottomWidth: 2, borderColor: colors.greenBorder },
  mastRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  mastSide: { fontSize: 9, letterSpacing: 1.8, color: colors.greenDim, flexShrink: 1 },
  mastTitle: { fontSize: 38, lineHeight: 44, color: colors.mint, textAlign: 'center', fontWeight: '700', letterSpacing: -0.5, marginVertical: 4 },

  tabs: { flexDirection: 'row', gap: 4, paddingLeft: 8, alignItems: 'flex-end' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.greenBorderDim, backgroundColor: '#f1f1ef',
    borderTopLeftRadius: 8, borderTopRightRadius: 8, marginBottom: -1, flexShrink: 1,
  },
  tabOn: { backgroundColor: '#FFFAF2', borderColor: colors.signal, zIndex: 2, paddingVertical: 12 },
  tabName: { fontSize: 10.5, letterSpacing: 2, color: colors.greenDim },
  tabWhat: { fontSize: 9, color: colors.greenBorder },
  count: { fontSize: 9, color: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 5, borderRadius: 8 },
  countOn: { color: '#FFFAF2', backgroundColor: colors.signal, borderColor: colors.signal },
  sheet: { borderWidth: 1, borderColor: colors.greenBorder, backgroundColor: '#FFFAF2', padding: 16, minHeight: 420, borderRadius: 16 },
  embed: { minHeight: 560 },

  diary: { gap: 18 },
  diaryWide: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  side: { width: 300, gap: 18 },

  notebook: {
    backgroundColor: '#fdfdfb', borderWidth: 1, borderColor: colors.greenBorderDim, paddingLeft: 76, paddingRight: 28, paddingTop: 22, paddingBottom: 26,
    overflow: 'hidden', shadowColor: '#2A1F17', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  hole: { position: 'absolute', left: 18, width: 14, height: 14, borderRadius: 7, backgroundColor: '#eeeeec', borderWidth: 1, borderColor: '#d6d6d4' },
  pageHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 90 },
  bigDate: { fontSize: 36, lineHeight: 40, color: colors.mint },
  stamp: { borderWidth: 2, borderColor: colors.greenBorder, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', transform: [{ rotate: '4deg' }] },
  stampNo: { fontSize: 13, color: colors.mint, letterSpacing: 1 },
  stampTime: { fontSize: 9, color: colors.greenDim, letterSpacing: 1.4 },
  entryText: { fontSize: 18, color: colors.mint, marginTop: 2 },
  dropCap: { fontSize: 44, fontWeight: '700' },
  pull: { marginTop: 22, borderLeftWidth: 3, borderLeftColor: colors.mint, paddingLeft: 16, paddingVertical: 6 },
  pullText: { fontSize: 20, lineHeight: 28, fontStyle: 'italic', color: colors.mint },
  signoff: { marginTop: 24, gap: 4, alignItems: 'flex-end' },
  sig: { fontSize: 22, fontStyle: 'italic', color: colors.mint },

  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pageBtn: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 14, paddingVertical: 9 },
  pageBtnText: { fontSize: 10, letterSpacing: 1.6, color: colors.mint },

  cal: { flexDirection: 'row', gap: 3 },
  calCol: { gap: 3 },
  calDay: { width: 18, height: 18, borderWidth: 1, borderColor: colors.greenBorderDim, backgroundColor: '#FFFAF2', borderRadius: 4 },
  calDayOn: { backgroundColor: '#E8A88A', borderColor: '#E8A88A' },
  calDaySel: { backgroundColor: colors.signal, borderColor: colors.signal },
  legend: { fontSize: 9, color: colors.greenDim, marginLeft: -6 },

  indexRow: { flexDirection: 'row', gap: 10, paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#efefed', alignItems: 'center' },
  indexRowOn: { backgroundColor: colors.signal },
  indexDate: { fontSize: 9.5, letterSpacing: 1, color: colors.greenDim, width: 52 },
  indexLine: { flex: 1, fontSize: 13, color: colors.mint },

  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyTitle: { fontSize: 24, color: colors.mint, fontStyle: 'italic' },
});
