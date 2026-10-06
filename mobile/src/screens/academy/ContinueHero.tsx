import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { colors, fonts } from '../../theme';
import type { ReadingItem } from '../../api/types';
import { BookCover } from './BookCover';
import { ProgressRing } from './Ornaments';
import { cleanTitle, progressOf } from './ReadingRoom';

function ago(iso: string) {
  const t = Date.parse(iso);
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

const WHERE: Record<string, string> = { openstax: 'LECTURE HALL · TEXTBOOK', wikisource: 'THE ARCHIVE', gutenberg: 'THE STACKS', page: 'FROM THE WEB' };

/** The book you were last reading, front and centre: one tap to pick up where you stopped. */
export function ContinueHero({ item, busy, wide, onContinue, onQuiz }: {
  item: ReadingItem; busy: boolean; wide: boolean; onContinue: () => void; onQuiz: () => void;
}) {
  const p = progressOf(item);
  return (
    <View style={[styles.hero, wide && styles.heroWide]}>
      <View style={styles.coverWrap}>
        <BookCover title={cleanTitle(item.title)} author={item.author ?? undefined} width={wide ? 150 : 110} progress={p} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Mono style={styles.eyebrow}>CONTINUE READING · {WHERE[item.source ?? 'gutenberg'] ?? 'THE STACKS'}</Mono>
        <Display numberOfLines={2} style={[styles.title, wide && { fontSize: 38, lineHeight: 40 }]}>{cleanTitle(item.title)}</Display>
        {item.author ? <Mono style={styles.author}>{item.author}</Mono> : null}
        {item.partTitle ? <Mono numberOfLines={1} style={styles.section}>§ {(item.partIndex ?? 0) + 1} of {item.partCount} — {item.partTitle}</Mono> : null}
        <Mono style={styles.when}>Last opened {ago(item.updatedAt)}</Mono>
        <View style={styles.actions}>
          <Pressable onPress={onContinue} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}>
            {busy ? <ActivityIndicator color="#FFFAF2" /> : <Mono style={styles.primaryText}>PICK UP WHERE I LEFT OFF →</Mono>}
          </Pressable>
          <Pressable onPress={onQuiz} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
            <Mono style={styles.secondaryText}>QUIZ ME ON IT</Mono>
          </Pressable>
        </View>
      </View>
      {wide && <ProgressRing value={p} size={96} stroke={6} />}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row', gap: 16, padding: 16, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 22, backgroundColor: '#FFFAF2', alignItems: 'center',
  },
  heroWide: { padding: 24, gap: 28 },
  coverWrap: { transform: [{ rotate: '-3deg' }] },
  eyebrow: { fontSize: 9, letterSpacing: 2, color: colors.greenDim },
  title: { fontSize: 26, lineHeight: 28, color: colors.mint },
  author: { fontSize: 12, color: colors.greenDim },
  section: { fontSize: 11, color: colors.mint },
  when: { fontSize: 10, color: colors.greenBorder },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  primary: { backgroundColor: colors.signal, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12, minWidth: 220, alignItems: 'center' },
  primaryText: { color: colors.onSignal, fontSize: 13, letterSpacing: 0.4, fontFamily: fonts.bodyBold },
  secondary: { borderWidth: 1.5, borderColor: colors.signal, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  secondaryText: { color: colors.signal, fontSize: 13, letterSpacing: 0.4, fontFamily: fonts.bodyBold },
});
