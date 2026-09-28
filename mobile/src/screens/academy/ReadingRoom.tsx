import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import type { ReadingItem, ReadingSlice, WorkPartInfo } from '../../api/types';
import { BookCover } from './BookCover';
import { Passage } from './Passage';
import { QuizPanel } from './QuizPanel';
import type { QuizStats } from '../../api/types';

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

function Attribution({ item }: { item: ReadingItem }) {
  const url = item.partUrl ?? (item.url.startsWith('http') ? item.url : null);
  const who = item.source === 'openstax'
    ? 'OpenStax · CC BY 4.0 · free at openstax.org'
    : item.source === 'wikisource'
      ? `Wikisource · CC BY-SA 4.0 · ${item.url.split(':')[1] ?? ''}.wikisource.org`
      : item.source === 'page' ? 'From the web' : 'Public domain · Project Gutenberg';
  return (
    <Pressable onPress={() => url && Linking.openURL(url)} disabled={!url}>
      <Mono style={styles.attrib}>SOURCE — {who}{url ? '  ↗' : ''}</Mono>
    </Pressable>
  );
}

/** Where reading happens: the passage in a book face, a thread of sections you can jump
 *  along, paper or night pages, and a focus mode that fills the screen. */
export function ReadingRoom({ slice, busy, onNext, onRestart, onJump, onClose, onRemove, onAsk, onQuizStats }: {
  slice: ReadingSlice;
  busy: boolean;
  onNext: () => void;
  onRestart: () => void;
  onJump: (part: number) => void;
  onClose: () => void;
  onRemove: () => void;
  onAsk?: () => void;
  onQuizStats?: (s: QuizStats) => void;
}) {
  const item = slice.item;
  const narrow = useWindowDimensions().width < 600;
  const [size, setSize] = useState(18);
  const [night, setNight] = useState(false);
  const [focus, setFocus] = useState(false);
  const [toc, setToc] = useState<WorkPartInfo[] | null>(null);
  const [showToc, setShowToc] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const parts = inParts(item);

  useEffect(() => { setToc(null); setShowToc(false); }, [item.id]);
  useEffect(() => { setQuiz(false); }, [slice.offset, item.id, item.partIndex]);
  const openToc = async () => {
    setShowToc((v) => !v);
    if (!toc) setToc(await api.libraryContents(item.id).catch(() => []));
  };

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
  const paper = night ? '#101010' : '#ffffff';
  const ink = night ? '#e9e9e9' : colors.mint;
  const count = item.partCount ?? 1;
  const index = item.partIndex ?? 0;
  // the section thread: one tick per section (grouped when there are many)
  const ticks = Math.min(count, 72);

  const body = (
    <View style={[styles.room, { backgroundColor: paper, borderColor: night ? '#333' : colors.mint }, focus && styles.roomFocus]}>
      <View style={styles.head}>
        {!focus && <BookCover title={cleanTitle(item.title)} author={item.author ?? undefined} width={60} progress={progressOf(item)} />}
        <View style={{ flex: 1, minWidth: narrow ? 160 : 0, gap: 3 }}>
          <Mono style={[styles.eyebrow, night && { color: '#999' }]}>READING ROOM{item.source === 'openstax' ? ' · LECTURE HALL' : item.source === 'wikisource' ? ' · ARCHIVE' : ' · STACKS'}</Mono>
          <Mono numberOfLines={2} style={[styles.title, { color: ink }]}>{cleanTitle(item.title)}</Mono>
          {parts && item.partTitle ? <Mono numberOfLines={1} style={[styles.part, night && { color: '#aaa' }]}>§ {index + 1}/{count} — {item.partTitle}</Mono> : null}
          <Mono style={[styles.pct, night && { color: '#999' }]}>{Math.round(progressOf(item) * 100)}% through{slice.finished ? ' · the end' : ''}</Mono>
        </View>
        <View style={[styles.tools, narrow && styles.toolsNarrow]}>
          <Tool label="A−" onPress={() => setSize((s) => Math.max(13, s - 2))} night={night} />
          <Tool label="A+" onPress={() => setSize((s) => Math.min(28, s + 2))} night={night} />
          <Tool label={night ? '☀' : '☾'} onPress={() => setNight((v) => !v)} night={night} />
          <Tool label={focus ? '⤡' : '⤢'} onPress={() => setFocus((v) => !v)} night={night} />
        </View>
      </View>

      {parts ? (
        <Pressable onPress={openToc} style={styles.thread} accessibilityLabel="Sections">
          {[...Array(ticks)].map((_, i) => {
            const from = Math.floor((i * count) / ticks);
            const to = Math.floor(((i + 1) * count) / ticks) - 1;
            const here = index >= from && index <= Math.max(from, to);
            const done = to < index;
            return <View key={i} style={[styles.tick, { backgroundColor: here ? ink : done ? (night ? '#777' : '#555') : night ? '#2a2a2a' : colors.greenBorderDim }, here && { height: 12 }]} />;
          })}
        </Pressable>
      ) : (
        <View style={[styles.track, { backgroundColor: night ? '#2a2a2a' : colors.greenBorderDim }]}>
          <View style={{ flex: progressOf(item), backgroundColor: ink }} />
          <View style={{ flex: 1 - progressOf(item) }} />
        </View>
      )}

      {showToc && (
        <View style={[styles.toc, { borderColor: night ? '#333' : colors.greenBorderDim }]}>
          <Mono style={[styles.eyebrow, night && { color: '#999' }]}>CONTENTS · TAP A SECTION TO GO THERE</Mono>
          {!toc ? <ActivityIndicator color={ink} /> : (
            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
              {toc.map((p) => (
                <Pressable key={p.index} onPress={() => { setShowToc(false); onJump(p.index); }} style={({ pressed }) => [styles.tocRow, pressed && { opacity: 0.6 }]}>
                  <Mono style={[styles.tocN, { color: night ? '#888' : colors.greenDim }]}>{String(p.index + 1).padStart(3, '0')}</Mono>
                  <Mono numberOfLines={1} style={[styles.tocT, { color: p.index === index ? ink : night ? '#bbb' : colors.greenDim }, p.index === index && { textDecorationLine: 'underline' }]}>{p.title}</Mono>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <ScrollView style={focus ? { flex: 1 } : undefined} contentContainerStyle={styles.paper}>
        {slice.text ? (
          <Passage text={slice.text} font={serif} size={size} color={ink} muted={night ? '#999' : colors.greenDim} rtl={rtl} />
        ) : (
          <Mono style={[styles.pct, { textAlign: 'center' }]}>You've read all of it. Start over, or pick something new.</Mono>
        )}
      </ScrollView>

      {quiz && slice.text ? (
        <QuizPanel itemId={item.id} passage={slice.text} night={night} onClose={() => setQuiz(false)} onNext={slice.finished ? undefined : () => { setQuiz(false); onNext(); }} onStats={onQuizStats} />
      ) : null}

      <View style={styles.bar}>
        {!slice.finished ? (
          <Pressable onPress={onNext} style={({ pressed }) => [styles.solid, { backgroundColor: ink }, pressed && { opacity: 0.7 }]}>
            {busy ? <ActivityIndicator size="small" color={paper} /> : <Mono style={[styles.solidText, { color: paper }]}>NEXT PASSAGE →</Mono>}
          </Pressable>
        ) : (
          <Mono style={[styles.pct, { color: ink }]}>Finished. Well read.</Mono>
        )}
        {slice.text ? <Ghost label={quiz ? 'HIDE QUIZ' : 'QUIZ ME'} onPress={() => setQuiz((v) => !v)} night={night} strong /> : null}
        {onAsk && !focus && <Ghost label="ASK WYRD ABOUT THIS" onPress={onAsk} night={night} />}
        {parts && <Ghost label="CONTENTS" onPress={openToc} night={night} />}
        <Ghost label="START OVER" onPress={onRestart} night={night} />
        {!focus && <Ghost label="CLOSE" onPress={onClose} night={night} />}
        {!focus && <Ghost label="REMOVE" onPress={onRemove} night={night} danger />}
        {Platform.OS === 'web' && <Mono style={[styles.keys, night && { color: '#777' }]}>→ next · esc {focus ? 'leave focus' : 'close'}</Mono>}
      </View>
      <Attribution item={item} />
    </View>
  );

  if (!focus) return body;
  return (
    <Modal visible animationType="fade" onRequestClose={() => setFocus(false)}>
      <View style={[styles.focusWrap, { backgroundColor: paper }]}>{body}</View>
    </Modal>
  );
}

function Tool({ label, onPress, night }: { label: string; onPress: () => void; night: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, { borderColor: night ? '#444' : colors.greenBorder }, pressed && { opacity: 0.6 }]}>
      <Mono style={[styles.toolText, { color: night ? '#eee' : colors.mint }]}>{label}</Mono>
    </Pressable>
  );
}

function Ghost({ label, onPress, night, danger, strong }: { label: string; onPress: () => void; night: boolean; danger?: boolean; strong?: boolean }) {
  const c = danger ? colors.danger : night ? '#ddd' : colors.mint;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghost, { borderColor: danger ? colors.danger : strong ? c : night ? '#444' : colors.greenBorder }, strong && { borderWidth: 2 }, pressed && { opacity: 0.6 }]}>
      <Mono style={[styles.ghostText, { color: c }]}>{label}</Mono>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  room: { borderWidth: 1, padding: 16, gap: 12 },
  roomFocus: { flex: 1, borderWidth: 0, maxWidth: 820, width: '100%', alignSelf: 'center' },
  focusWrap: { flex: 1, padding: 16 },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' },
  eyebrow: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  title: { fontSize: 16 },
  part: { fontSize: 11, color: colors.greenDim },
  pct: { fontSize: 11, color: colors.greenDim },
  tools: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 170 },
  toolsNarrow: { width: '100%', maxWidth: undefined, justifyContent: 'flex-start' },
  tool: { borderWidth: 1, width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  toolText: { fontSize: 13 },
  thread: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 14 },
  tick: { flex: 1, height: 6 },
  track: { flexDirection: 'row', height: 3 },
  toc: { borderWidth: 1, padding: 10, gap: 6 },
  tocRow: { flexDirection: 'row', gap: 10, paddingVertical: 5 },
  tocN: { fontSize: 10, width: 30 },
  tocT: { fontSize: 12, flex: 1 },
  paper: { paddingVertical: 20, paddingHorizontal: 4 },
  passage: { maxWidth: 680, alignSelf: 'center', width: '100%' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  solid: { paddingHorizontal: 16, paddingVertical: 10, minWidth: 150, alignItems: 'center' },
  solidText: { fontSize: 11, letterSpacing: 1.8 },
  ghost: { borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  ghostText: { fontSize: 10, letterSpacing: 1.4 },
  keys: { fontSize: 10, color: colors.greenBorder, marginLeft: 'auto' },
  attrib: { fontSize: 9, letterSpacing: 1.2, color: colors.greenBorder },
});
