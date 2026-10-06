import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { Display, Mono } from '../../components/ui';
import { colors, fonts } from '../../theme';
import { api } from '../../api/client';
import { cachedFetch } from '../../api/hooks';
import type { QuizStats, ReadingItem, ReadingSlice } from '../../api/types';
import { BookCover } from '../academy/BookCover';
import { ReadingRoom, cleanTitle, isFinished, progressOf } from '../academy/ReadingRoom';
import { WINGS, type Wing } from '../academy/Skyline';
import { ArchiveWing, LectureHall, StacksWing } from '../academy/Wings';
import { WELCOMES } from '../academy/shelf';
import { ContinueHero } from '../academy/ContinueHero';
import { LibraryCard } from '../academy/Ornaments';
import { useAuth } from '../../api/AuthContext';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Late-night reading';
}

const BADGE: Record<string, string> = { openstax: 'TEXTBOOK', wikisource: 'ARCHIVE', page: 'PAGE' };

/** The Academy: a campus of the world's free knowledge. Step into the Stacks (75,000 classics),
 *  the Lecture Hall (open university textbooks) or the Archive (texts in 15 languages); your desk
 *  keeps everything you're reading, with your place. Nothing here calls an AI. */
// the reading desk from the last visit, shown at once when the Academy opens again
let lastDesk: ReadingItem[] | null = null;
/** Fetched ahead while the app is idle, so even the first visit shows the desk at once. */
export function warmDesk() {
  return api.libraryList().then((d) => { lastDesk ??= d; }).catch(() => {});
}

export function AcademyTab({ focus, onAsk }: { focus?: { id: number; at: number } | null; onAsk?: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const scroll = useRef<ScrollView>(null);
  const roomY = useRef(0);
  const scrollToRoom = useRef(false);
  const { email } = useAuth();
  const [quizNonce, setQuizNonce] = useState(0);

  const [wing, setWing] = useState<Wing>('stacks');
  const [items, setItems] = useState<ReadingItem[] | null>(lastDesk); // the desk as it was last time, at once; refreshed below
  const [open, setOpen] = useState<ReadingSlice | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quizStats, setQuizStats] = useState<QuizStats | null>(null);
  useEffect(() => { cachedFetch('quizStats', api.libraryQuizStats).then(setQuizStats).catch(() => {}); }, []);

  // a book Dialogue Link pulled up: show the passage it just shared, without moving on
  useEffect(() => {
    if (!focus) return;
    run(`item-${focus.id}`, () => api.libraryCurrent(focus.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.at]);

  const load = useCallback(() => api.libraryList().then((d) => { lastDesk = d; setItems(d); }).catch(() => setItems((cur) => cur ?? [])), []);
  useEffect(() => { load(); }, [load]);
  const show = (slice: ReadingSlice) => {
    setOpen(slice);
    setItems((xs) => [slice.item, ...(xs ?? []).filter((x) => x.id !== slice.item.id)]);
    // bring the reading room into view (it sits under the campus and your card)
    scrollToRoom.current = true;
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, roomY.current - 12), animated: true }), 120);
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
      <View style={[styles.gate, wide && styles.gateWide]}>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Mono style={styles.eyebrow}>ACADEMY · {greeting().toUpperCase()}</Mono>
          <Welcome wide={wide} />
          <Mono style={styles.lede}>
            Classics, open textbooks and texts in fifteen languages — free for every student, everywhere. Read a passage at a time; WYRD keeps your place, quizzes you, and talks it through with you.
          </Mono>
        </View>
        <LibraryCard
          name={(email ?? 'student').split('@')[0]}
          id={email ?? 'student'}
          stats={[
            [String(reading.length), 'READING'],
            [String(finished.length), 'FINISHED'],
            [String(textbooks), 'TEXTBOOKS'],
            [quizStats && quizStats.total ? `${Math.round((quizStats.correct / quizStats.total) * 100)}%` : '—', quizStats?.rounds ? `QUIZ · ${quizStats.rounds}` : 'QUIZ'],
          ]}
        />
      </View>

      {/* the campus: three wings, one to step into */}
      <View style={[styles.wings, !wide && { flexDirection: 'column' }]}>
        {WINGS.map((w) => {
          const on = w.key === wing;
          return (
            <Pressable key={w.key} onPress={() => setWing(w.key)} style={({ pressed }) => [styles.wingCard, on && styles.wingOn, pressed && !on && { opacity: 0.8 }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <View style={[styles.wingIcon, on && styles.wingIconOn]}>
                <WingIcon wing={w.key} color={on ? colors.onSignal : colors.indigo} />
              </View>
              <View style={{ flex: 1 }}>
                <Display style={[styles.wingName, on && { color: colors.onSignal }]}>{w.name}</Display>
                <Mono style={[styles.wingWhat, on && { color: '#FBE3D6' }]}>{w.what}</Mono>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!open && reading[0] && (() => {
        const quiz = () => { const it = reading[0]; run(`item-${it.id}`, () => api.libraryCurrent(it.id)).then(() => setQuizNonce(Date.now())); };
        const pct = quizStats && quizStats.total ? Math.round((quizStats.correct / quizStats.total) * 100) : null;
        return (
          <View style={[styles.readRow, !wide && { flexDirection: 'column' }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ContinueHero item={reading[0]} wide={wide} busy={loading === `item-${reading[0].id}`} onContinue={() => readOn(reading[0])} onQuiz={quiz} />
            </View>
            {/* today's quiz: on what you're reading */}
            <View style={[styles.quizCard, wide && { width: 320 }]}>
              <Mono style={styles.quizEyebrow}>TODAY'S QUIZ</Mono>
              <View style={styles.quizRow}>
                <View style={styles.quizRing}><Display style={styles.quizPct}>{pct == null ? '—' : `${pct}%`}</Display></View>
                <Display style={styles.quizLine} numberOfLines={3}>Can you out-think WYRD on {cleanTitle(reading[0].title).split(/[:,(]/)[0].trim()}?</Display>
              </View>
              <Pressable onPress={quiz} style={({ pressed }) => [styles.quizBtn, pressed && { opacity: 0.85 }]}>
                <Mono style={styles.quizBtnText}>START · 10 QUESTIONS</Mono>
              </Pressable>
              {quizStats?.rounds ? <Mono style={styles.quizNote}>{quizStats.rounds} {quizStats.rounds === 1 ? 'round' : 'rounds'} so far</Mono> : null}
            </View>
          </View>
        );
      })()}

      {error && (
        <Pressable onPress={() => setError(null)}><Mono style={styles.error}>{error}  ✕</Mono></Pressable>
      )}

      {open && (
        <View
          onLayout={(e) => {
            roomY.current = e.nativeEvent.layout.y;
            if (scrollToRoom.current) {
              scrollToRoom.current = false;
              scroll.current?.scrollTo({ y: Math.max(0, roomY.current - 12), animated: true });
            }
          }}
        >
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
          quizNonce={quizNonce}
        />
        </View>
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

const NON_LATIN = /[Ͱ-ϿЀ-ӿ֐-ࣿऀ-෿฀-࿿　-鿿가-힯]/;
const welcomeSerif = Platform.select({ web: 'Georgia, "Noto Serif", "Noto Sans", "Times New Roman", serif', ios: 'Georgia', default: 'serif' });

/** "Welcome, scholar" in sixteen languages, one after another. Kept in its own component so the
 *  change every few seconds redraws only this line (not the reading room below it), in a box of
 *  fixed height so nothing below it moves, and in a font that has every script: the pixel
 *  display font has no Arabic, Devanagari or Chinese, so those fell back to mismatched fonts. */
function Welcome({ wide }: { wide: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setI((w) => (w + 1) % WELCOMES.length);
    }, 3200);
    return () => clearInterval(t);
  }, []);
  const [text, lang] = WELCOMES[i];
  const size = wide ? 44 : 32;
  const other = NON_LATIN.test(text);
  return (
    <View style={{ height: size * 1.3 + 16, justifyContent: 'flex-end', gap: 4 }}>
      {other ? (
        <Text numberOfLines={1} style={{ fontFamily: welcomeSerif, fontSize: size * 0.82, lineHeight: size * 1.15, color: colors.mint }}>{text}</Text>
      ) : (
        <Display numberOfLines={1} style={{ fontSize: size, lineHeight: size * 1.15, color: colors.mint }}>{text}</Display>
      )}
      <Mono style={styles.lang}>{lang.toUpperCase()} · {i + 1}/{WELCOMES.length}</Mono>
    </View>
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

/** The wings, drawn: a shelf of books, a columned hall, a globe. */
function WingIcon({ wing, color, size = 28 }: { wing: Wing; color: string; size?: number }) {
  const sw = 1.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      {wing === 'stacks' ? (
        <>
          <Rect x={4} y={6} width={4} height={16} rx={1} stroke={color} strokeWidth={sw} fill="none" />
          <Rect x={10} y={4} width={4} height={18} rx={1} stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M17 7.5 L20.6 6.4 L24.4 21 L20.8 22 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Path d="M3 24.5 H25" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </>
      ) : wing === 'hall' ? (
        <>
          <Path d="M3.5 10 L14 4 L24.5 10 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Path d="M7 12 V21 M11.7 12 V21 M16.3 12 V21 M21 12 V21" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M4 23.5 H24" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx={14} cy={14} r={10} stroke={color} strokeWidth={sw} fill="none" />
          <Ellipse cx={14} cy={14} rx={4.5} ry={10} stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M4.5 10.5 H23.5 M4.5 17.5 H23.5" stroke={color} strokeWidth={sw} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 18 },
  pageWide: { maxWidth: 1120, width: '100%', alignSelf: 'center', paddingHorizontal: 28 },
  eyebrow: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  muted: { fontSize: 11, lineHeight: 16, color: colors.greenDim },
  error: { fontSize: 11, color: colors.danger },

  gate: { gap: 14 },
  gateWide: { flexDirection: 'row', alignItems: 'center', gap: 32 },
  lede: { fontSize: 12, lineHeight: 18, color: colors.greenDim, maxWidth: 520, marginTop: 4 },
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
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,250,242,0.85)', alignItems: 'center', justifyContent: 'center' },

  footnote: { fontSize: 10, lineHeight: 15, color: colors.greenBorder, textAlign: 'center', marginTop: 8 },
  wings: { flexDirection: 'row', gap: 16 },
  wingCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 18, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder },
  wingOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  wingIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  wingIconOn: { backgroundColor: '#D9744E' },
  wingGlyph: { fontSize: 24, color: colors.indigo },
  wingName: { fontSize: 26, lineHeight: 28, color: colors.mint },
  wingWhat: { fontSize: 12, color: colors.greenDim },
  readRow: { flexDirection: 'row', gap: 18, alignItems: 'stretch' },
  quizCard: { backgroundColor: colors.palm, borderRadius: 22, padding: 20, gap: 12, justifyContent: 'center' },
  quizEyebrow: { fontSize: 12, letterSpacing: 1.6, color: colors.ochre },
  quizRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  quizRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 6, borderColor: '#F7E7C0', alignItems: 'center', justifyContent: 'center' },
  quizPct: { fontSize: 22, color: colors.cream },
  quizLine: { flex: 1, fontSize: 24, lineHeight: 26, color: colors.cream },
  quizBtn: { backgroundColor: colors.cream, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  quizBtnText: { fontSize: 13, letterSpacing: 1.6, color: colors.palm, fontFamily: fonts.bodyBold },
  quizNote: { fontSize: 11, color: '#D9E8DE', textAlign: 'center' },
});
