import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import type { ReadingItem, WorkHit } from '../../api/types';
import { BookCover } from './BookCover';
import { cleanTitle, progressOf } from './ReadingRoom';
import { REGIONS, SHELF, SUBJECTS, type Region, type Subject } from './shelf';

type Open = (source: 'gutenberg' | 'openstax' | 'wikisource', id: string, key: string) => void;

interface WingProps {
  desk: ReadingItem[];
  loading: string | null;
  open: Open;
  coverW: number;
  wide: boolean;
}

// ---------------------------------------------------------------------------------------------
// THE STACKS: Project Gutenberg

export function StacksWing({ desk, loading, open, coverW, wide }: WingProps) {
  const [region, setRegion] = useState<Region | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<WorkHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setHits(await api.librarySearchBooks(q.trim()).catch(() => []));
    setSearching(false);
  };
  const shelf = useMemo(
    () => SHELF.filter((b) => (!region || b.region === region) && (!subject || b.subjects.includes(subject))),
    [region, subject],
  );

  return (
    <View style={styles.wing}>
      <WingIntro
        title="THE STACKS"
        line="Seventy-five thousand books whose copyright has run out — novels, poetry, philosophy, science and history, free forever."
        credit="Project Gutenberg · public domain"
      />
      <SearchBar value={q} onChange={setQ} onSubmit={search} busy={searching} placeholder="Any free book — title or author" />
      {hits && (
        <Results empty={`No free copy found for “${q}”. Books still under copyright can't be here yet.`} hits={hits} onClose={() => setHits(null)}>
          {hits.map((h) => (
            <Pressable key={h.id} onPress={() => open('gutenberg', h.id, h.id)} style={({ pressed }) => [styles.hitRow, pressed && { opacity: 0.7 }]}>
              <BookCover title={h.title} author={h.author ?? undefined} width={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Mono numberOfLines={2} style={styles.hitTitle}>{h.title}</Mono>
                <Mono numberOfLines={1} style={styles.muted}>{h.author ?? 'Unknown author'}</Mono>
              </View>
              {loading === h.id ? <ActivityIndicator color={colors.mint} /> : <Mono style={styles.go}>READ →</Mono>}
            </Pressable>
          ))}
        </Results>
      )}

      <Mono style={styles.shelfLabel}>THE WORLD SHELF · {shelf.length} CLASSICS FROM EVERY REGION</Mono>
      <View style={styles.chips}>
        <Chip label="ALL REGIONS" on={!region} onPress={() => setRegion(null)} />
        {REGIONS.map((r) => <Chip key={r} label={r.toUpperCase()} on={region === r} onPress={() => setRegion(region === r ? null : r)} />)}
      </View>
      <View style={styles.chips}>
        <Chip label="ALL SUBJECTS" on={!subject} onPress={() => setSubject(null)} small />
        {SUBJECTS.map((s) => <Chip key={s} label={s.toUpperCase()} on={subject === s} onPress={() => setSubject(subject === s ? null : s)} small />)}
      </View>
      <View style={styles.grid}>
        {shelf.map((b) => {
          const onDesk = desk.find((i) => cleanTitle(i.title).toLowerCase().includes(b.title.toLowerCase().slice(0, 12)));
          const busy = loading === `shelf-${b.query}`;
          return (
            <Pressable key={b.query} onPress={() => open('gutenberg', b.query, `shelf-${b.query}`)} style={({ pressed }) => [wide ? styles.cardWide : styles.card, { width: wide ? 300 : coverW }, pressed && { opacity: 0.75 }]}>
              <View>
                <BookCover title={b.title} author={b.author} width={coverW} progress={onDesk ? progressOf(onDesk) : undefined} badge={b.note?.toUpperCase()} />
                {busy && <Busy />}
              </View>
              {wide ? (
                <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                  <Mono style={styles.origin}>{b.origin.toUpperCase()} · {b.region.toUpperCase()}</Mono>
                  <Mono style={styles.cardTitle}>{b.title}</Mono>
                  <Mono style={styles.muted}>{b.author}</Mono>
                  <Mono style={styles.blurb}>{b.blurb}</Mono>
                  <Mono style={styles.subjects}>{b.subjects.join(' · ')}</Mono>
                </View>
              ) : (
                <Mono numberOfLines={1} style={styles.origin}>{b.origin.toUpperCase()}</Mono>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// LECTURE HALL: OpenStax textbooks

const PER_GROUP = 8;

const LANG_NAMES: Record<string, string> = { en: 'ENGLISH', es: 'ESPAÑOL', pl: 'POLSKI', fr: 'FRANÇAIS', de: 'DEUTSCH' };

export function LectureHall({ desk, loading, open, coverW, wide }: WingProps) {
  const [books, setBooks] = useState<WorkHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [subject, setSubject] = useState<string | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => { api.libraryTextbooks().then(setBooks).catch(() => setFailed(true)); }, []);

  const subjects = useMemo(() => {
    const n: Record<string, number> = {};
    (books ?? []).forEach((b) => b.subjects.forEach((s) => { n[s] = (n[s] ?? 0) + 1; }));
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [books]);
  const langs = useMemo(() => [...new Set((books ?? []).map((b) => b.language ?? 'en'))], [books]);
  const shown = (books ?? []).filter((b) =>
    (!subject || b.subjects.includes(subject)) &&
    (!lang || (b.language ?? 'en') === lang) &&
    (!q.trim() || b.title.toLowerCase().includes(q.trim().toLowerCase())));
  // grouped like a course catalogue when no subject is picked
  const groups: [string, WorkHit[]][] = subject || q.trim()
    ? [[subject ?? 'Results', shown]]
    : subjects.map((s) => [s, shown.filter((b) => b.subjects[0] === s)] as [string, WorkHit[]]).filter(([, l]) => l.length);

  return (
    <View style={styles.wing}>
      <WingIntro
        title="LECTURE HALL"
        line="Complete university and high-school textbooks, written by teachers and peer-reviewed — maths, sciences, economics, psychology, history and more."
        credit="OpenStax (Rice University) · CC BY 4.0"
      />
      <SearchBar value={q} onChange={setQ} placeholder="Filter textbooks — e.g. calculus, biology, economics" />
      {failed ? <Mono style={styles.error}>The Lecture Hall can't be reached right now.</Mono> : !books ? <ActivityIndicator color={colors.mint} /> : (
        <>
          <View style={styles.chips}>
            <Chip label={`ALL SUBJECTS · ${books.length}`} on={!subject} onPress={() => setSubject(null)} />
            {subjects.map((s) => <Chip key={s} label={s.toUpperCase()} on={subject === s} onPress={() => setSubject(subject === s ? null : s)} />)}
          </View>
          {langs.length > 1 && (
            <View style={styles.chips}>
              <Chip label="ALL LANGUAGES" on={!lang} onPress={() => setLang(null)} small />
              {langs.map((l) => <Chip key={l} label={LANG_NAMES[l] ?? l.toUpperCase()} on={lang === l} onPress={() => setLang(lang === l ? null : l)} small />)}
            </View>
          )}
          {groups.map(([name, list]) => (
            <View key={name} style={{ gap: 8 }}>
              <View style={styles.courseHead}>
                <Mono style={styles.course}>{name.toUpperCase()}</Mono>
                <View style={styles.rule} />
                {list.length > PER_GROUP && !subject && !q.trim() ? (
                  <Pressable onPress={() => setOpenGroups((g) => ({ ...g, [name]: !g[name] }))}>
                    <Mono style={styles.go}>{openGroups[name] ? 'SHOW FEWER' : `SHOW ALL ${list.length} →`}</Mono>
                  </Pressable>
                ) : (
                  <Mono style={styles.muted}>{list.length}</Mono>
                )}
              </View>
              <View style={styles.grid}>
                {/* a few per subject at first: every cover is a drawing, and there are over a hundred */}
                {(openGroups[name] || subject || q.trim() ? list : list.slice(0, PER_GROUP)).map((b) => {
                  const onDesk = desk.find((i) => i.url === `openstax:${b.id}`);
                  return (
                    <Pressable key={b.id} onPress={() => open('openstax', b.id, b.id)} style={({ pressed }) => [styles.card, { width: wide ? 124 : coverW }, pressed && { opacity: 0.75 }]}>
                      <View>
                        <BookCover title={b.title} author="OpenStax" width={wide ? 124 : coverW} progress={onDesk ? progressOf(onDesk) : undefined} badge={b.language && b.language !== 'en' ? b.language.toUpperCase() : 'TEXTBOOK'} />
                        {loading === b.id && <Busy />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {shown.length === 0 && <Mono style={styles.muted}>No textbook matches that yet.</Mono>}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// THE ARCHIVE: Wikisource, many languages

const LANGS: { code: string; name: string; tryIt: string[] }[] = [
  { code: 'en', name: 'English', tryIt: ['Frankenstein', 'The Time Machine', 'Leaves of Grass'] },
  { code: 'fr', name: 'Français', tryIt: ['Les Misérables', 'Candide', 'Le Petit Prince'] },
  { code: 'es', name: 'Español', tryIt: ['Don Quijote', 'La Celestina', 'Rimas'] },
  { code: 'pt', name: 'Português', tryIt: ['Os Lusíadas', 'Dom Casmurro', 'Iracema'] },
  { code: 'de', name: 'Deutsch', tryIt: ['Faust', 'Die Verwandlung', 'Grimms Märchen'] },
  { code: 'it', name: 'Italiano', tryIt: ['Divina Commedia', 'I promessi sposi', 'Pinocchio'] },
  { code: 'ru', name: 'Русский', tryIt: ['Война и мир', 'Евгений Онегин', 'Преступление и наказание'] },
  { code: 'ar', name: 'العربية', tryIt: ['ألف ليلة وليلة', 'كليلة ودمنة', 'مقدمة ابن خلدون'] },
  { code: 'zh', name: '中文', tryIt: ['紅樓夢', '論語', '西遊記'] },
  { code: 'hi', name: 'हिन्दी', tryIt: ['गोदान', 'रामचरितमानस', 'निर्मला'] },
  { code: 'bn', name: 'বাংলা', tryIt: ['গীতাঞ্জলি', 'পথের পাঁচালী', 'দেবদাস'] },
  { code: 'fa', name: 'فارسی', tryIt: ['شاهنامه', 'گلستان', 'مثنوی معنوی'] },
  { code: 'pl', name: 'Polski', tryIt: ['Pan Tadeusz', 'Lalka', 'Quo vadis'] },
  { code: 'uk', name: 'Українська', tryIt: ['Кобзар', 'Лісова пісня', 'Енеїда'] },
  { code: 'la', name: 'Latina', tryIt: ['Aeneis', 'Commentarii de Bello Gallico', 'Metamorphoses'] },
];

const RTL = /[֐-ࣿ]/;

export function ArchiveWing({ loading, open }: WingProps) {
  const [lang, setLang] = useState('en');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<WorkHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const L = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  const search = async (text = q) => {
    const t = text.trim();
    if (!t) return;
    setQ(t);
    setSearching(true);
    setHits(await api.librarySearchWikisource(lang, t).catch(() => []));
    setSearching(false);
  };

  return (
    <View style={styles.wing}>
      <WingIntro
        title="THE ARCHIVE"
        line="A library kept by volunteers in dozens of languages — epics, scripture, poetry, plays, letters and laws, each in its own words."
        credit="Wikisource · CC BY-SA 4.0"
      />
      <Mono style={styles.shelfLabel}>CHOOSE A LANGUAGE</Mono>
      <View style={styles.chips}>
        {LANGS.map((l) => (
          <Pressable key={l.code} onPress={() => { setLang(l.code); setHits(null); }} style={[styles.script, lang === l.code && styles.scriptOn]}>
            <Mono style={[styles.scriptText, lang === l.code && { color: '#fff' }]}>{l.name}</Mono>
          </Pressable>
        ))}
      </View>
      <SearchBar value={q} onChange={setQ} onSubmit={() => search()} busy={searching} placeholder={`Search the ${L.name} archive`} rtl={RTL.test(L.name)} />
      <View style={styles.chips}>
        <Mono style={styles.muted}>TRY</Mono>
        {L.tryIt.map((t) => (
          <Pressable key={t} onPress={() => search(t)} style={styles.tryChip}><Mono style={styles.tryText}>{t}</Mono></Pressable>
        ))}
      </View>
      {hits && (
        <Results empty={`Nothing in the ${L.name} archive for “${q}”.`} hits={hits} onClose={() => setHits(null)}>
          {hits.map((h) => {
            const rtl = RTL.test(h.title);
            return (
              <Pressable key={h.id} onPress={() => open('wikisource', h.id, h.id)} style={({ pressed }) => [styles.hitRow, pressed && { opacity: 0.7 }]}>
                <BookCover title={h.title} width={46} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Mono numberOfLines={2} style={[styles.hitTitle, rtl && { textAlign: 'right', writingDirection: 'rtl' }]}>{h.title}</Mono>
                  {h.blurb ? <Mono numberOfLines={2} style={[styles.muted, rtl && { textAlign: 'right', writingDirection: 'rtl' }]}>{h.blurb}</Mono> : null}
                </View>
                {loading === h.id ? <ActivityIndicator color={colors.mint} /> : <Mono style={styles.go}>READ →</Mono>}
              </Pressable>
            );
          })}
        </Results>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// shared pieces

function WingIntro({ title, line, credit }: { title: string; line: string; credit: string }) {
  return (
    <View style={styles.intro}>
      <Mono style={styles.introTitle}>{title}</Mono>
      <Mono style={styles.introLine}>{line}</Mono>
      <Mono style={styles.credit}>{credit.toUpperCase()}</Mono>
    </View>
  );
}

function SearchBar({ value, onChange, onSubmit, busy, placeholder, rtl }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void; busy?: boolean; placeholder: string; rtl?: boolean;
}) {
  return (
    <View style={styles.search}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.greenBorder}
        style={[styles.input, rtl && { textAlign: 'right' }]}
        returnKeyType="search"
      />
      {onSubmit && (
        <Pressable onPress={onSubmit} style={({ pressed }) => [styles.find, pressed && { opacity: 0.7 }]}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Mono style={styles.findText}>FIND</Mono>}
        </Pressable>
      )}
    </View>
  );
}

function Results({ hits, empty, onClose, children }: { hits: WorkHit[]; empty: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.results}>
      <View style={styles.courseHead}>
        <Mono style={styles.course}>FOUND {hits.length}</Mono>
        <View style={styles.rule} />
        <Pressable onPress={onClose}><Mono style={styles.muted}>CLEAR ✕</Mono></Pressable>
      </View>
      {hits.length === 0 ? <Mono style={styles.muted}>{empty}</Mono> : children}
    </View>
  );
}

function Chip({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, small && styles.chipSmall, on && styles.chipOn]}>
      <Mono style={[styles.chipText, small && { fontSize: 9 }, on && { color: '#fff' }]}>{label}</Mono>
    </Pressable>
  );
}

function Busy() {
  return (
    <View style={styles.busy}>
      <ActivityIndicator color={colors.mint} />
      <Mono style={styles.busyText}>FETCHING…</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  wing: { gap: 12 },
  intro: { gap: 5, paddingVertical: 4 },
  introTitle: { fontSize: 22, letterSpacing: 5, color: colors.mint },
  introLine: { fontSize: 12, lineHeight: 18, color: colors.greenDim, maxWidth: 680 },
  credit: { fontSize: 8.5, letterSpacing: 1.8, color: colors.greenBorder },
  muted: { fontSize: 11, lineHeight: 16, color: colors.greenDim },
  error: { fontSize: 11, color: colors.danger },
  search: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.mint, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.mint, backgroundColor: '#fff', fontFamily: 'ShareTechMono_400Regular',
  },
  find: { backgroundColor: colors.mint, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minWidth: 72 },
  findText: { color: '#fff', fontSize: 11, letterSpacing: 1.8 },
  results: { borderWidth: 1, borderColor: colors.mint, padding: 10, gap: 6, backgroundColor: '#fff' },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.greenBorderDim },
  hitTitle: { fontSize: 13, color: colors.mint },
  go: { fontSize: 10, letterSpacing: 1.4, color: colors.mint },
  shelfLabel: { fontSize: 9, letterSpacing: 2, color: colors.greenDim, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 4, borderColor: colors.greenBorderDim },
  chipOn: { backgroundColor: colors.mint, borderColor: colors.mint },
  chipText: { fontSize: 10, letterSpacing: 1.4, color: colors.mint },
  script: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  scriptOn: { backgroundColor: colors.mint, borderColor: colors.mint },
  scriptText: { fontSize: 14, color: colors.mint },
  tryChip: { borderBottomWidth: 1, borderBottomColor: colors.mint, paddingVertical: 2 },
  tryText: { fontSize: 12, color: colors.mint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { gap: 6 },
  cardWide: { flexDirection: 'row', gap: 14, padding: 10, borderWidth: 1, borderColor: colors.greenBorderDim, backgroundColor: '#fff' },
  cardTitle: { fontSize: 14, color: colors.mint },
  smallTitle: { fontSize: 10.5, lineHeight: 14, color: colors.mint },
  origin: { fontSize: 8.5, letterSpacing: 1.6, color: colors.greenDim },
  blurb: { fontSize: 11, lineHeight: 16, color: colors.mint },
  subjects: { fontSize: 9, letterSpacing: 1, color: colors.greenBorder, marginTop: 'auto' },
  courseHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  course: { fontSize: 10, letterSpacing: 2.2, color: colors.mint },
  rule: { flex: 1, height: 1, backgroundColor: colors.greenBorderDim },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center', gap: 6 },
  busyText: { fontSize: 8, letterSpacing: 1.4, color: colors.mint },
});
