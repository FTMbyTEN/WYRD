import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import type { QuizStats, ReadingItem, ReadingSlice } from '../../api/types';
import { BookCover } from '../academy/BookCover';
import { ReadingRoom, cleanTitle, isFinished, progressOf } from '../academy/ReadingRoom';
import { Skyline, WingDoors, type Wing } from '../academy/Skyline';
import { ArchiveWing, LectureHall, StacksWing } from '../academy/Wings';
import { WELCOMES } from '../academy/shelf';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Late-night reading';
}

const BADGE: Record<string, string> = { openstax: 'TEXTBOOK', wikisource: 'ARCHIVE', page: 'PAGE' };

/** The Academy: a campus of the world's free knowledge. Step into the Stacks (75,000 classics),
 *  the Lecture Hall (open university textbooks) or the Archive (texts in 15 languages); your desk
 *  keeps everything you're reading, with your place. Nothing here calls an AI. */
export function AcademyTab({ focus, onAsk }: { focus?: { id: number; at: number } | null; onAsk?: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const scroll = useRef<ScrollView>(null);

  const [wing, setWing] = useState<Wing>('stacks');
  const [items, setItems] = useState<ReadingItem[] | null>(null);
  const [open, setOpen] = useState<ReadingSlice | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(0);
  const [quizStats, setQuizStats] = useState<QuizStats | null>(null);
  useEffect(() => { api.libraryQuizStats().then(setQuizStats).catch(() => {}); }, []);

  // a book Dialogue Link pulled up: show the passage it just shared, without moving on
  useEffect(() => {
    if (!focus) return;
    run(`item-${focus.id}`, () => api.libraryCurrent(focus.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.at]);

  const load = useCallback(() => api.libraryList().then(setItems).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setWelcome((w) => (w + 1) % WELCOMES.length), 3200);
    return () => clearInterval(t);
  }, []);

  const show = (slice: ReadingSlice) => {
    setOpen(slice);
    setItems((xs) => [slice.item, ...(xs ?? []).filter((x) => x.id !== slice.item.id)]);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const run = async (key: string, fn: () => Promise<ReadingSlice | null>, notFound = 'That one isn’t available right now.') => {
    setLoading(key); setError(null);
    try {
      const slice = await fn();
      if (slice) show(slice); else setError(notFound);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Exception:\s*/, '') : 'The campus is out of reach just now.');
    } finally {
      setLoading(null);
    }
  };

  const readOn = (item: ReadingItem, restart = false, part?: number) =>
    run(`item-${item.id}`, () => api.libraryReadOn(item.id, restart, part));
  const openWork = (source: 'gutenberg' | 'openstax' | 'wikisource', id: string, key: string) =>
    run(key, () => api.libraryOpenWork(source, id));
  const remove = async (item: ReadingItem) => {
    await api.libraryRemove(item.id).catch(() => {});
    setOpen(null);
    load();
  };

  const desk = items ?? [];
  const reading = desk.filter((i) => !isFinished(i));
  const finished = desk.filter(isFinished);
  const textbooks = desk.filter((i) => i.source === 'openstax').length;
  const coverW = wide ? 124 : Math.min(112, (width - 32 - 32) / 3);
  const wingProps = { desk, loading, open: openWork, coverW, wide };

  return (
    <ScrollView ref={scroll} contentContainerStyle={[styles.page, wide && styles.pageWide]}>
      {/* the campus */}
      <View>
        <Skyline wing={wing} onWing={setWing} lit={reading.length} />
        <WingDoors wing={wing} onWing={setWing} />
      </View>

      <View style={[styles.gate, wide && styles.gateWide]}>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Mono style={styles.eyebrow}>ACADEMY · {greeting().toUpperCase()}</Mono>
          <Display style={[styles.welcome, wide && { fontSize: 44, lineHeight: 48 }]} numberOfLines={2}>{WELCOMES[welcome][0]}</Display>
          <Mono style={styles.lang}>{WELCOMES[welcome][1].toUpperCase()} · {welcome + 1}/{WELCOMES.length}</Mono>
        </View>
        <View style={styles.stats}>
          <Stat v={reading.length} k="ON YOUR DESK" />
          <Stat v={finished.length} k="FINISHED" />
          <Stat v={textbooks} k="TEXTBOOKS" />
          <Stat v={quizStats && quizStats.total ? `${Math.round((quizStats.correct / quizStats.total) * 100)}%` : '—'} k={quizStats?.rounds ? `QUIZ SCORE · ${quizStats.rounds}` : 'QUIZ SCORE'} />
        </View>
      </View>

      {error && (
        <Pressable onPress={() => setError(null)}><Mono style={styles.error}>{error}  ✕</Mono></Pressable>
      )}

      {open && (
        <ReadingRoom
          slice={open}
          busy={loading === `item-${open.item.id}`}
          onNext={() => readOn(open.item)}
          onRestart={() => readOn(open.item, true)}
          onJump={(p) => readOn(open.item, false, p)}
          onClose={() => setOpen(null)}
          onRemove={() => remove(open.item)}
          onAsk={onAsk}
          onQuizStats={setQuizStats}
        />
      )}

      {/* your desk: a shelf of what you're reading */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Mono style={styles.sectionTitle}>YOUR DESK</Mono>
          <View style={styles.rule} />
          {desk.length > 0 && <Mono style={styles.muted}>{desk.length} {desk.length === 1 ? 'title' : 'titles'}</Mono>}
        </View>
        {items == null ? <ActivityIndicator color={colors.mint} /> : desk.length === 0 ? (
          <Mono style={styles.muted}>Your desk is clear. Step into a building above and pick something — or tell WYRD “find the book …” in chat.</Mono>
        ) : (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deskRow}>
              {desk.map((item) => {
                const done = isFinished(item);
                const busy = loading === `item-${item.id}`;
                return (
                  <Pressable key={item.id} onPress={() => (open?.item.id === item.id ? setOpen(null) : readOn(item, done))} style={({ pressed }) => [styles.deskBook, pressed && { transform: [{ translateY: 3 }] }]}>
                    <View>
                      <BookCover title={cleanTitle(item.title)} author={item.author ?? undefined} width={wide ? 108 : coverW * 0.9} progress={progressOf(item)} badge={done ? 'FINISHED' : BADGE[item.source ?? '']} />
                      {busy && <View style={styles.busy}><ActivityIndicator color={colors.mint} /></View>}
                    </View>
                    <Mono style={styles.deskMeta}>{done ? 'READ AGAIN' : `${Math.round(progressOf(item) * 100)}%`}</Mono>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.plank} />
            <View style={styles.plankShadow} />
          </View>
        )}
      </View>

      {/* the building you're in */}
      {wing === 'stacks' && <StacksWing {...wingProps} />}
      {wing === 'hall' && <LectureHall {...wingProps} />}
      {wing === 'archive' && <ArchiveWing {...wingProps} />}

      <Mono style={styles.footnote}>
        Free for every student, everywhere: public-domain books from Project Gutenberg, open textbooks from OpenStax (CC BY 4.0) and texts from Wikisource (CC BY-SA 4.0). Reading here never uses an AI.
      </Mono>
    </ScrollView>
  );
}

function Stat({ v, k }: { v: number | string; k: string }) {
  return (
    <View style={styles.stat}>
      <Display style={styles.statV}>{v}</Display>
      <Mono style={styles.statK}>{k}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 18 },
  pageWide: { maxWidth: 1120, width: '100%', alignSelf: 'center', paddingHorizontal: 28 },
  eyebrow: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  muted: { fontSize: 11, lineHeight: 16, color: colors.greenDim },
  error: { fontSize: 11, color: colors.danger },

  gate: { gap: 14 },
  gateWide: { flexDirection: 'row', alignItems: 'flex-end' },
  welcome: { fontSize: 34, lineHeight: 38, minHeight: 76, color: colors.mint },
  lang: { fontSize: 9, letterSpacing: 2.4, color: colors.greenBorder },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  stat: { minWidth: 64 },
  statV: { fontSize: 30, color: colors.mint },
  statK: { fontSize: 8.5, letterSpacing: 1.6, color: colors.greenDim },

  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 11, letterSpacing: 2.4, color: colors.mint },
  rule: { flex: 1, height: 1, backgroundColor: colors.greenBorderDim },
  deskRow: { gap: 14, paddingHorizontal: 10, paddingTop: 6, alignItems: 'flex-end' },
  deskBook: { gap: 4, alignItems: 'center' },
  deskMeta: { fontSize: 9, letterSpacing: 1.4, color: colors.mint, marginBottom: 4 },
  plank: { height: 7, backgroundColor: colors.mint },
  plankShadow: { height: 5, marginHorizontal: 8, backgroundColor: colors.greenBorderDim },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },

  footnote: { fontSize: 10, lineHeight: 15, color: colors.greenBorder, textAlign: 'center', marginTop: 8 },
});
