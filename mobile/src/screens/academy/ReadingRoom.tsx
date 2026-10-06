import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View,
} from 'react-native';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import type { QuizStats, ReadingItem, ReadingSlice, WorkPartInfo } from '../../api/types';
import { BookCover } from './BookCover';
import { ProgressRing } from './Ornaments';
import { Passage } from './Passage';
import { QuizPanel } from './QuizPanel';

export const serif = Platform.select({ web: 'Georgia, "Iowan Old Style", "Noto Serif", "Times New Roman", serif', ios: 'Georgia', default: 'serif' });

export const cleanTitle = (t: string) => t.replace(/\s*\|.*$/, '').replace(/\.txt$/, '');

const inParts = (i: ReadingItem) => i.source === 'openstax' || i.source === 'wikisource';

export function progressOf(i: ReadingItem) {
  const within = i.total ? Math.min(1, (i.nextOffset ?? i.total) / i.total) : 1;
  if (!inParts(i)) return within;
  return Math.min(1, ((i.partIndex ?? 0) + within) / Math.max(1, i.partCount ?? 1));
}

export function isFinished(i: ReadingItem) {
  return i.nextOffset == null && (!inParts(i) || (i.partIndex ?? 0) >= (i.partCount ?? 1) - 1);
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

const WING: Record<string, string> = { openstax: 'LECTURE HALL', wikisource: 'THE ARCHIVE', gutenberg: 'THE STACKS', page: 'THE WEB' };

function source(item: ReadingItem): [string, string | null] {
  const url = item.partUrl ?? (item.url.startsWith('http') ? item.url : null);
  const who = item.source === 'openstax'
    ? 'OpenStax · CC BY 4.0'
    : item.source === 'wikisource'
      ? `Wikisource · CC BY-SA 4.0 · ${item.url.split(':')[1] ?? ''}`
      : item.source === 'page' ? 'From the web' : 'Public domain · Project Gutenberg';
  return [who, url];
}

/** Where reading happens. The passage is set like a book page (running head, drop cap, page
 *  turn); around it, on wide screens, a sidebar with the book, how far you've got, its contents,
 *  Quiz me, Ask WYRD and the reading controls. Paper or night pages, and a focus mode. */
export function ReadingRoom({ slice, busy, onNext, onRestart, onJump, onClose, onRemove, onAsk, onQuizStats, quizNonce }: {
  slice: ReadingSlice;
  busy: boolean;
  onNext: () => void;
  onRestart: () => void;
  onJump: (part: number) => void;
  onClose: () => void;
  onRemove: () => void;
  onAsk?: () => void;
  onQuizStats?: (s: QuizStats) => void;
  quizNonce?: number; // changes when someone asked for a quiz from outside (the Continue card)
}) {
  const item = slice.item;
  const { width } = useWindowDimensions();
  const [size, setSize] = useState(18);
  const [night, setNight] = useState(false);
  const [focus, setFocus] = useState(false);
  const [toc, setToc] = useState<WorkPartInfo[] | null>(null);
  const [showToc, setShowToc] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const wide = width >= 1000 && !focus;
  const parts = inParts(item);

  useEffect(() => { setToc(null); setShowToc(false); setConfirmRemove(false); }, [item.id]);
  useEffect(() => { setQuiz(false); }, [slice.offset, item.id, item.partIndex]);
  useEffect(() => { if (quizNonce) setQuiz(true); }, [quizNonce]);

  const loadToc = async () => { if (!toc) setToc(await api.libraryContents(item.id).catch(() => [])); };
  const toggleToc = () => { setShowToc((v) => !v); loadToc(); };
  // the sidebar shows the contents from the start
  useEffect(() => { if (wide && parts) loadToc(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [wide, parts, item.id]);

  // the page turns: a short fade and rise whenever a new passage arrives
  const turn = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    turn.setValue(0);
    Animated.timing(turn, { toValue: 1, duration: 380, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [slice.offset, item.partIndex, item.id, turn]);

  // web: → reads on, Esc leaves focus / closes
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' && !slice.finished && !busy) onNext();
      if (e.key === 'Escape') { if (focus) setFocus(false); else onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const rtl = RTL.test(slice.text.slice(0, 400));
  const paper = night ? '#2A1F17' : '#FFFAF2';
  const desk = night ? '#070707' : '#f3f3f1';
  const ink = night ? '#e9e9e9' : colors.mint;
  const dim = night ? '#8f8f8f' : colors.greenDim;
  const rule = night ? '#2c2c2c' : colors.greenBorderDim;
  const count = item.partCount ?? 1;
  const index = item.partIndex ?? 0;
  const p = progressOf(item);
  const [who, url] = source(item);
  const title = cleanTitle(item.title);

  const tocList = (maxHeight: number) => (
    <View style={{ gap: 6 }}>
      <Mono style={[styles.eyebrow, { color: dim }]}>CONTENTS · {count} SECTIONS</Mono>
      {!toc ? <ActivityIndicator color={ink} /> : (
        <ScrollView style={{ maxHeight }} nestedScrollEnabled>
          {toc.map((t) => {
            const here = t.index === index;
            return (
              <Pressable key={t.index} onPress={() => { setShowToc(false); onJump(t.index); }} style={({ pressed }) => [styles.tocRow, here && { backgroundColor: ink }, pressed && { opacity: 0.6 }]}>
                <Mono style={[styles.tocN, { color: here ? paper : dim }]}>{String(t.index + 1).padStart(3, '0')}</Mono>
                <Mono numberOfLines={2} style={[styles.tocT, { color: here ? paper : t.index < index ? dim : ink }]}>{t.title}</Mono>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const page = (
    <View style={[styles.sheet, { backgroundColor: paper, borderColor: rule }, wide && styles.sheetWide, focus && styles.sheetFocus]}>
      {/* running head */}
      <View style={[styles.runningHead, { borderBottomColor: rule }]}>
        <Mono numberOfLines={1} style={[styles.runTitle, { color: dim }]}>{title.toUpperCase()}</Mono>
        <Mono numberOfLines={1} style={[styles.runPart, { color: dim }]}>
          {parts && item.partTitle ? `§ ${index + 1} · ${item.partTitle}` : `${Math.round(p * 100)}%`}
        </Mono>
      </View>

      <Animated.View style={{ opacity: turn, transform: [{ translateY: turn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        <ScrollView style={focus ? { flex: 1 } : undefined} contentContainerStyle={[styles.pageBody, wide && { paddingHorizontal: 44 }]}>
          {slice.text ? (
            <Passage text={slice.text} font={serif} size={size} color={ink} muted={dim} rtl={rtl} dropCap={slice.offset === 0 && !rtl} />
          ) : (
            <Mono style={[styles.pct, { textAlign: 'center', color: dim }]}>You've read all of it. Start over, or pick something new.</Mono>
          )}
        </ScrollView>
      </Animated.View>

      {/* folio */}
      <View style={styles.folio}>
        <View style={[styles.folioRule, { backgroundColor: rule }]} />
        <Mono style={[styles.folioText, { color: dim }]}>{slice.finished ? 'THE END' : `${Math.round(p * 100)}%`}</Mono>
        <View style={[styles.folioRule, { backgroundColor: rule }]} />
      </View>
    </View>
  );

  const quizBox = quiz && slice.text ? (
    <QuizPanel itemId={item.id} passage={slice.text} night={night} onClose={() => setQuiz(false)} onNext={slice.finished ? undefined : () => { setQuiz(false); onNext(); }} onStats={onQuizStats} />
  ) : null;

  const nextBtn = !slice.finished ? (
    <Pressable onPress={onNext} style={({ pressed }) => [styles.solid, { backgroundColor: ink }, pressed && { opacity: 0.75 }]}>
      {busy ? <ActivityIndicator size="small" color={paper} /> : <Mono style={[styles.solidText, { color: paper }]}>NEXT PASSAGE →</Mono>}
    </Pressable>
  ) : (
    <Pressable onPress={onRestart} style={({ pressed }) => [styles.solid, { backgroundColor: ink }, pressed && { opacity: 0.75 }]}>
      <Mono style={[styles.solidText, { color: paper }]}>FINISHED · READ AGAIN</Mono>
    </Pressable>
  );

  const removeBtn = confirmRemove ? (
    <View style={styles.row}>
      <Mono style={[styles.pct, { color: colors.danger }]}>Take it off your desk?</Mono>
      <Ghost label="YES, REMOVE" onPress={onRemove} night={night} danger />
      <Ghost label="KEEP" onPress={() => setConfirmRemove(false)} night={night} />
    </View>
  ) : <Ghost label="REMOVE FROM DESK" onPress={() => setConfirmRemove(true)} night={night} danger />;

  const textTools = (
    <View style={styles.row}>
      <Tool label="A−" onPress={() => setSize((s) => Math.max(13, s - 2))} night={night} hint="Smaller text" />
      <Tool label="A+" onPress={() => setSize((s) => Math.min(28, s + 2))} night={night} hint="Larger text" />
      <Tool label={night ? '☀' : '☾'} onPress={() => setNight((v) => !v)} night={night} hint={night ? 'Paper page' : 'Night page'} />
      <Tool label={focus ? '⤡' : '⤢'} onPress={() => setFocus((v) => !v)} night={night} hint={focus ? 'Leave focus' : 'Focus mode'} />
    </View>
  );

  const credit = (
    <Pressable onPress={() => url && Linking.openURL(url)} disabled={!url}>
      <Mono style={[styles.attrib, { color: dim }]}>SOURCE — {who}{url ? '  ↗' : ''}</Mono>
    </Pressable>
  );

  let body: React.ReactNode;
  if (wide) {
    body = (
      <View style={[styles.room, styles.roomWide, { backgroundColor: desk, borderColor: night ? '#2F241B' : colors.mint }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
          {page}
          {quizBox}
        </View>
        <View style={[styles.sidebar, { borderLeftColor: rule }]}>
          <Mono style={[styles.eyebrow, { color: dim }]}>READING ROOM · {WING[item.source ?? 'gutenberg']}</Mono>
          <View style={styles.sideTop}>
            <BookCover title={title} author={item.author ?? undefined} width={84} />
            <ProgressRing value={p} size={84} stroke={6} color={ink} track={rule} />
          </View>
          <Mono numberOfLines={3} style={[styles.sideTitle, { color: ink }]}>{title}</Mono>
          {item.author ? <Mono style={[styles.pct, { color: dim }]}>{item.author}</Mono> : null}
          {nextBtn}
          <View style={styles.row}>
            {slice.text ? <Ghost label={quiz ? 'HIDE QUIZ' : 'QUIZ ME'} onPress={() => setQuiz((v) => !v)} night={night} strong /> : null}
            {onAsk ? <Ghost label="ASK WYRD" onPress={onAsk} night={night} /> : null}
          </View>
          {parts ? tocList(300) : null}
          {textTools}
          <View style={styles.row}>
            <Ghost label="START OVER" onPress={onRestart} night={night} />
            <Ghost label="CLOSE" onPress={onClose} night={night} />
          </View>
          {removeBtn}
          {Platform.OS === 'web' && <Mono style={[styles.keys, { color: dim }]}>→ next passage · esc close</Mono>}
          {credit}
        </View>
      </View>
    );
  } else {
    body = (
      <View style={[styles.room, { backgroundColor: desk, borderColor: night ? '#2F241B' : colors.mint }, focus && styles.roomFocus]}>
        {!focus && (
          <View style={styles.head}>
            <ProgressRing value={p} size={52} stroke={4} color={ink} track={rule} />
            <View style={{ flex: 1, minWidth: 150, gap: 2 }}>
              <Mono style={[styles.eyebrow, { color: dim }]}>READING ROOM · {WING[item.source ?? 'gutenberg']}</Mono>
              <Mono numberOfLines={2} style={[styles.title, { color: ink }]}>{title}</Mono>
              {parts && item.partTitle ? <Mono numberOfLines={1} style={[styles.pct, { color: dim }]}>§ {index + 1}/{count} — {item.partTitle}</Mono> : null}
            </View>
          </View>
        )}
        {!focus && textTools}
        {showToc && parts ? <View style={[styles.tocBox, { borderColor: rule, backgroundColor: paper }]}>{tocList(260)}</View> : null}
        {page}
        {quizBox}
        <View style={styles.row}>
          {nextBtn}
          {slice.text ? <Ghost label={quiz ? 'HIDE QUIZ' : 'QUIZ ME'} onPress={() => setQuiz((v) => !v)} night={night} strong /> : null}
          {onAsk && !focus ? <Ghost label="ASK WYRD" onPress={onAsk} night={night} /> : null}
          {parts ? <Ghost label="CONTENTS" onPress={toggleToc} night={night} /> : null}
          <Ghost label="START OVER" onPress={onRestart} night={night} />
          {!focus && <Ghost label="CLOSE" onPress={onClose} night={night} />}
          {focus && <Ghost label="LEAVE FOCUS" onPress={() => setFocus(false)} night={night} />}
        </View>
        {!focus && removeBtn}
        {credit}
      </View>
    );
  }

  if (!focus) return body;
  return (
    <Modal visible animationType="fade" onRequestClose={() => setFocus(false)}>
      <View style={[styles.focusWrap, { backgroundColor: desk }]}>{body}</View>
    </Modal>
  );
}

function Tool({ label, onPress, night, hint }: { label: string; onPress: () => void; night: boolean; hint: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={hint} style={({ pressed }) => [styles.tool, { borderColor: night ? '#5A4636' : colors.greenBorder, backgroundColor: night ? '#2A1F17' : '#FFFAF2' }, pressed && { opacity: 0.6 }]}>
      <Mono style={[styles.toolText, { color: night ? '#F0E4D0' : colors.mint }]}>{label}</Mono>
    </Pressable>
  );
}

function Ghost({ label, onPress, night, danger, strong }: { label: string; onPress: () => void; night: boolean; danger?: boolean; strong?: boolean }) {
  const c = danger ? colors.danger : night ? '#E5D6BE' : colors.mint;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghost, { borderColor: danger ? colors.danger : strong ? c : night ? '#5A4636' : colors.greenBorder, backgroundColor: night ? '#2A1F17' : '#FFFAF2' }, strong && { borderWidth: 2 }, pressed && { opacity: 0.6 }]}>
      <Mono style={[styles.ghostText, { color: c }]}>{label}</Mono>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  room: { borderWidth: 1, padding: 14, gap: 12 },
  roomWide: { flexDirection: 'row', padding: 22, gap: 22, alignItems: 'flex-start' },
  roomFocus: { flex: 1, borderWidth: 0, maxWidth: 860, width: '100%', alignSelf: 'center' },
  focusWrap: { flex: 1, padding: 16 },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  eyebrow: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  title: { fontSize: 16 },
  pct: { fontSize: 11, color: colors.greenDim },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },

  sheet: {
    borderWidth: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14,
    shadowColor: '#2A1F17', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  sheetWide: { paddingTop: 16 },
  sheetFocus: { flex: 1 },
  runningHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, paddingBottom: 8 },
  runTitle: { fontSize: 9, letterSpacing: 2.2, flexShrink: 1 },
  runPart: { fontSize: 9, letterSpacing: 1.2, flexShrink: 1, textAlign: 'right' },
  pageBody: { paddingVertical: 26, paddingHorizontal: 6 },
  folio: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  folioRule: { flex: 1, height: 1 },
  folioText: { fontSize: 10, letterSpacing: 2 },

  sidebar: { width: 290, gap: 12, borderLeftWidth: 1, paddingLeft: 20 },
  sideTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  sideTitle: { fontSize: 15, lineHeight: 20 },

  tool: { borderWidth: 1, width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
  toolText: { fontSize: 13 },
  tocBox: { borderWidth: 1, padding: 10 },
  tocRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, paddingHorizontal: 6 },
  tocN: { fontSize: 10, width: 28 },
  tocT: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  solid: { paddingHorizontal: 18, paddingVertical: 12, minWidth: 170, alignItems: 'center' },
  solidText: { fontSize: 11, letterSpacing: 1.8 },
  ghost: { borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  ghostText: { fontSize: 10, letterSpacing: 1.4 },
  keys: { fontSize: 10 },
  attrib: { fontSize: 9, letterSpacing: 1.2 },
});
