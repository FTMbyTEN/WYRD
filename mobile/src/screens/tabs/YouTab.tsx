import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { notify } from '../../util/dialog';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { Glyph } from '../../components/glyph/Glyph';
import { FaceMark } from '../../components/FaceMark';
import { api } from '../../api/client';
import { useAuth } from '../../api/AuthContext';
import { cachedFetch, useConversations, useDroneAccess, useMind, useProfile } from '../../api/hooks';
import type { QuizStats, ReadingItem } from '../../api/types';
import { sfx, voice } from '../../util/sound';

const DAY = 86400000;
const serif = Platform.select({ web: 'Georgia, "Iowan Old Style", "Noto Serif", "Times New Roman", serif', ios: 'Georgia', default: 'serif' });

function daysSince(iso: string | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

interface Props {
  tts: boolean;
  onToggleTts: () => void;
  onOpenCop: () => void;
}

/** YOU: who you are to WYRD. Your mark and your history together, when you talk, everything
 *  it has learned about you (kept private), what you're reading, and your settings and data. */
/** Owner only: how many people have accounts, counted in each table they could live in, and the
 *  newest sign-ups -- so "where are the users?" has an answer without opening the database. */
function OwnerPeople() {
  const [s, setS] = useState<{ counts: Record<string, number | null>; recent: { name: string; at: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.ownerUserStats().then((j) => setS(JSON.parse(j))).catch((e) => setErr(String(e?.message ?? e))); }, []);
  const label: Record<string, string> = {
    serverpod_auth_core_user: 'Accounts (auth)',
    serverpod_auth_idp_email_account: 'Email sign-ups',
    serverpod_auth_idp_email_account_request: 'Unfinished sign-ups',
    serverpod_user_info: 'Old auth table',
    user_profile: 'WYRD profiles',
  };
  return (
    <Section title="OWNER · PEOPLE">
      {err ? <Mono style={styles.eyebrow}>{err}</Mono> : !s ? <Mono style={styles.eyebrow}>counting…</Mono> : (
        <View style={{ gap: 6 }}>
          {Object.entries(s.counts).map(([t, n]) => (
            <View key={t} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Mono style={{ fontSize: 12, color: colors.mint }}>{label[t] ?? t}</Mono>
              <Mono style={{ fontSize: 12, color: n == null ? colors.greenDim : colors.signal }}>{n == null ? 'no table' : n}</Mono>
            </View>
          ))}
          {s.recent.length ? (
            <Mono style={[styles.eyebrow, { marginTop: 6 }]}>
              NEWEST · {s.recent.map((r) => `${r.name} (${new Date(r.at).toLocaleDateString()})`).join(' · ')}
            </Mono>
          ) : null}
        </View>
      )}
    </Section>
  );
}

export function YouTab({ tts, onToggleTts, onOpenCop }: Props) {
  const owner = useDroneAccess(); // the operator accounts are WYRD's owners
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const { email, logout } = useAuth();
  // WYRD says goodbye, then the session ends (at most ~2.5 s later, even if the line can't play)
  const [leaving, setLeaving] = useState(false);
  const signOut = () => {
    if (leaving) return;
    setLeaving(true);
    sfx('close');
    Promise.race([voice('goodbye'), new Promise((r) => setTimeout(r, 2500))]).finally(() => { void logout(); });
  };
  const { profile, reload: reloadProfile } = useProfile();
  const { turns, total: msgCount, reload: reloadTurns } = useConversations(200);
  const { mind } = useMind();
  const facts = profile?.facts ?? [];
  const days = daysSince(profile?.firstSeen);
  const name = (email ?? '—').split('@')[0];

  const [reading, setReading] = useState<ReadingItem[]>([]);
  const [quiz, setQuiz] = useState<QuizStats | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(0); // 0 closed, 1 asking, 2 working
  useEffect(() => {
    cachedFetch('libraryList', api.libraryList).then(setReading).catch(() => {});
    cachedFetch('quizStats', api.libraryQuizStats).then(setQuiz).catch(() => {});
  }, []);

  const exportData = async () => {
    try {
      const data = await api.exportAccount();
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'WYRD account export' });
    } catch {
      notify('Export failed', 'Could not reach WYRD to export your data.');
    }
  };

  const deleteData = async () => {
    setConfirmDelete(2);
    try {
      await api.deleteAccount();
      notify('Deleted', 'Everything WYRD kept about you — conversations, facts, photos, reading and quizzes — has been deleted.');
      reloadProfile(); reloadTurns(); setReading([]); setQuiz(null);
    } catch {
      notify('Delete failed', 'Could not reach WYRD. Nothing was deleted; try again.');
    } finally {
      setConfirmDelete(0);
    }
  };

  const quizPct = quiz && quiz.total ? Math.round((quiz.correct / quiz.total) * 100) : null;
  const stats: [string, string][] = [
    [msgCount.toLocaleString(), 'MESSAGES'],
    [String(facts.length), 'THINGS IT KNOWS'],
    [String(days), days === 1 ? 'DAY TOGETHER' : 'DAYS TOGETHER'],
    [String(profile?.visitCount ?? 0), 'VISITS'],
    [String(reading.length), 'ON YOUR DESK'],
    [quizPct == null ? '—' : `${quizPct}%`, 'QUIZ SCORE'],
  ];

  const left = (
    <>
      <Section title="WHEN YOU TALK" note={turns.length ? `your last ${turns.length} messages` : undefined}>
        <Activity stamps={turns.map((t) => t.timestamp)} />
      </Section>
      <Section title="WHAT WYRD KNOWS ABOUT YOU" note={`${facts.length} ${facts.length === 1 ? 'fact' : 'facts'} · private to you`}>
        <Facts facts={facts} />
      </Section>
    </>
  );

  const right = (
    <>
      <Section title="YOUR READING">
        {reading.length === 0 ? (
          <Mono style={styles.muted}>Nothing on your desk yet. The Academy has 75,000 free books, open textbooks and texts in 15 languages.</Mono>
        ) : (
          reading.slice(0, 4).map((r) => (
            <View key={r.id} style={styles.readRow}>
              <Text numberOfLines={1} style={[styles.readTitle, { fontFamily: serif }]}>{r.title.replace(/\s*\|.*$/, '')}</Text>
              <View style={styles.readTrack}><View style={[styles.readFill, { flex: progress(r) }]} /><View style={{ flex: 1 - progress(r) }} /></View>
              <Mono style={styles.readPct}>{Math.round(progress(r) * 100)}%</Mono>
            </View>
          ))
        )}
      </Section>

      <Section title="SETTINGS">
        <Setting icon={<SpeakerIcon />} title="Spoken replies" detail="WYRD reads its chat replies aloud">
          <Switch value={tts} onValueChange={onToggleTts} trackColor={{ false: colors.greenBorderDim, true: colors.mint }} thumbColor="#fff" />
        </Setting>
        <Setting icon={<ShieldIcon />} title="COP oversight" detail="Every change WYRD made to itself, independently reviewed" onPress={onOpenCop} />
      </Section>

      {owner ? <OwnerPeople /> : null}

      <Section title="YOUR DATA">
        <Setting icon={<BoxIcon />} title="Export my data" detail="Conversations, facts, photos, reading and quizzes, as a file" onPress={exportData} />
        {confirmDelete === 0 ? (
          <Setting icon={<BinIcon />} title="Delete my data" detail="Erase everything WYRD kept about you. Your login stays." onPress={() => setConfirmDelete(1)} danger />
        ) : (
          <View style={styles.confirm}>
            <Mono style={styles.confirmText}>
              This permanently deletes your conversations, the facts WYRD learned, your photos, your reading and your quizzes. It can't be undone.
            </Mono>
            <View style={styles.confirmRow}>
              <Pressable disabled={confirmDelete === 2} onPress={deleteData} style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
                <Mono style={styles.deleteText}>{confirmDelete === 2 ? 'DELETING…' : 'YES, DELETE EVERYTHING'}</Mono>
              </Pressable>
              <Pressable onPress={() => setConfirmDelete(0)} style={({ pressed }) => [styles.keepBtn, pressed && styles.pressed]}>
                <Mono style={styles.keepText}>KEEP IT</Mono>
              </Pressable>
            </View>
          </View>
        )}
      </Section>

      <Pressable onPress={signOut} disabled={leaving} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
        <Mono style={styles.logoutText}>LOG OUT</Mono>
      </Pressable>
    </>
  );

  return (
    <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]}>
      {/* hero */}
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.markWrap}>
          <Rings />
          <View style={styles.mark}><FaceMark mode="scan" /></View>
        </View>
        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Mono style={styles.eyebrow}>YOU, TO WYRD</Mono>
          <Display numberOfLines={1} style={[styles.name, wide && { fontSize: 54, lineHeight: 58 }]}>{name}</Display>
          <Mono numberOfLines={1} style={styles.email}>{email ?? ''}</Mono>
          <Text style={[styles.since, { fontFamily: serif }]}>
            {profile?.firstSeen
              ? `Together since ${new Date(profile.firstSeen).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}${mind ? ` — WYRD is feeling ${mind.mood} today.` : '.'}`
              : 'Say hello in Dialogue Link and WYRD will start to know you.'}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        {stats.map(([v, k]) => (
          <View key={k} style={[styles.stat, wide ? { flexBasis: '15%' } : { flexBasis: '31%' }]}>
            <Display style={styles.statValue}>{v}</Display>
            <Mono style={styles.statLabel}>{k}</Mono>
          </View>
        ))}
      </View>

      {wide ? (
        <View style={styles.cols}>
          <View style={{ flex: 1.2, gap: 22, minWidth: 0 }}>{left}</View>
          <View style={{ flex: 1, gap: 22, minWidth: 0 }}>{right}</View>
        </View>
      ) : (
        <View style={{ gap: 22 }}>{left}{right}</View>
      )}

      <Mono style={styles.footnote}>
        Your conversations, facts, photos and reading are private to you. WYRD's mind, diary, dreams and drone are shared by everyone.
      </Mono>
    </ScrollView>
  );
}

const inParts = (i: ReadingItem) => i.source === 'openstax' || i.source === 'wikisource';
function progress(i: ReadingItem) {
  const within = i.total ? Math.min(1, (i.nextOffset ?? i.total) / i.total) : 1;
  return inParts(i) ? Math.min(1, ((i.partIndex ?? 0) + within) / Math.max(1, i.partCount ?? 1)) : within;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Mono style={styles.sectionTitle}>{title}</Mono>
        <View style={styles.rule} />
        {note ? <Mono style={styles.note}>{note}</Mono> : null}
      </View>
      {children}
    </View>
  );
}

/** When you talk to WYRD: the last 12 weeks by day, and your hours of the day. */
function Activity({ stamps }: { stamps: string[] }) {
  const { byDay, byHour, max, peak, streak } = useMemo(() => {
    const d = new Map<string, number>();
    const h = new Array(24).fill(0) as number[];
    for (const s of stamps) {
      const t = new Date(s);
      if (Number.isNaN(t.getTime())) continue;
      const k = t.toDateString();
      d.set(k, (d.get(k) ?? 0) + 1);
      h[t.getHours()]++;
    }
    let st = 0;
    for (let t = new Date(); d.has(t.toDateString()); t = new Date(t.getTime() - DAY)) st++;
    return { byDay: d, byHour: h, max: Math.max(1, ...d.values()), peak: h.indexOf(Math.max(...h)), streak: st };
  }, [stamps]);

  if (!stamps.length) return <Mono style={styles.muted}>No conversations yet. Your rhythm with WYRD will show here.</Mono>;

  const weeks = 12;
  const end = new Date();
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY);
  start.setDate(start.getDate() - start.getDay());
  const hourMax = Math.max(1, ...byHour);
  const shade = (n: number) => (n === 0 ? '#f1f1ef' : n / max > 0.66 ? colors.mint : n / max > 0.33 ? '#6b6b6b' : '#b3b3b3');

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.heat}>
        {[...Array(weeks + 1)].map((_, w) => (
          <View key={w} style={{ gap: 3 }}>
            {[...Array(7)].map((__, dd) => {
              const t = new Date(start.getTime() + (w * 7 + dd) * DAY);
              const n = byDay.get(t.toDateString()) ?? 0;
              return <View key={dd} style={[styles.heatDay, { backgroundColor: shade(n), opacity: t > end ? 0.2 : 1 }]} />;
            })}
          </View>
        ))}
      </View>
      <View>
        <Svg width="100%" height={54} viewBox="0 0 240 54" preserveAspectRatio="none">
          {byHour.map((n, h) => (
            <Rect key={h} x={h * 10 + 1} y={46 - (n / hourMax) * 44} width={8} height={Math.max(1, (n / hourMax) * 44)} fill={h === peak ? colors.mint : '#bdbdbd'} />
          ))}
          <Rect x={0} y={47} width={240} height={1} fill="#d0d0d0" />
        </Svg>
        <View style={styles.hourAxis}>
          {['00', '06', '12', '18', '24'].map((l) => <Mono key={l} style={styles.axis}>{l}</Mono>)}
        </View>
      </View>
      <Text style={[styles.insight, { fontFamily: serif }]}>
        You talk most around {String(peak).padStart(2, '0')}:00{streak > 1 ? `, and you've talked ${streak} days running` : ''}.
      </Text>
    </View>
  );
}

/** Facts as index cards: "Name: Dana" becomes a labelled card; anything else stands on its own. */
function Facts({ facts }: { facts: string[] }) {
  const [all, setAll] = useState(false);
  if (!facts.length) {
    return <Mono style={styles.muted}>Nothing yet. Tell WYRD about yourself in Dialogue Link — your name, what you study, what you love — and it will remember, privately.</Mono>;
  }
  const shown = all ? facts : facts.slice(0, 12);
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.cards}>
        {shown.map((f, i) => {
          const m = f.match(/^([A-Za-z][\w '’-]{1,24}):\s*(.+)$/);
          return (
            <View key={`${i}-${f}`} style={[styles.factCard, i % 5 === 0 && styles.factCardTilt]}>
              <Mono style={styles.factLabel}>{m ? m[1].toUpperCase() : `NOTE ${String(i + 1).padStart(2, '0')}`}</Mono>
              <Text style={[styles.factText, { fontFamily: serif }]}>{m ? m[2] : f}</Text>
            </View>
          );
        })}
      </View>
      {facts.length > 12 && (
        <Pressable onPress={() => setAll((v) => !v)}>
          <Mono style={styles.more}>{all ? 'SHOW FEWER' : `SHOW ALL ${facts.length}`}</Mono>
        </Pressable>
      )}
    </View>
  );
}

function Setting({ icon, title, detail, onPress, danger, children }: {
  icon: React.ReactNode; title: string; detail: string; onPress?: () => void; danger?: boolean; children?: React.ReactNode;
}) {
  const body = (
    <>
      <View style={[styles.settingIcon, danger && { borderColor: colors.danger }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Mono style={[styles.settingTitle, danger && { color: colors.danger }]}>{title}</Mono>
        <Mono style={styles.settingDetail}>{detail}</Mono>
      </View>
      {children ?? <Mono style={[styles.chevron, danger && { color: colors.danger }]}>›</Mono>}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.setting, pressed && styles.pressed]}>{body}</Pressable>
  ) : (
    <View style={styles.setting}>{body}</View>
  );
}

function Rings() {
  return (
    <Svg width={128} height={128} style={StyleSheet.absoluteFill}>
      <Circle cx={64} cy={64} r={62} stroke={colors.mint} strokeWidth={1} fill="none" />
      <Circle cx={64} cy={64} r={56} stroke="#cfcfcf" strokeWidth={1} fill="none" strokeDasharray="2 4" />
      {[...Array(24)].map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <Path key={i} d={`M${64 + Math.cos(a) * 62} ${64 + Math.sin(a) * 62} L${64 + Math.cos(a) * (i % 6 === 0 ? 54 : 58)} ${64 + Math.sin(a) * (i % 6 === 0 ? 54 : 58)}`} stroke={colors.mint} strokeWidth={1} />;
      })}
    </Svg>
  );
}

function SpeakerIcon() {
  return <Glyph name="voice" size={18} color={colors.mint} />;
}
function ShieldIcon() {
  return <Glyph name="cop" size={18} color={colors.mint} />;
}
function BoxIcon() {
  return <Glyph name="box" size={18} color={colors.mint} />;
}
function BinIcon() {
  return <Glyph name="bin" size={18} color={colors.danger} />;
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 22 },
  pageWide: { maxWidth: 1120, width: '100%', alignSelf: 'center', paddingHorizontal: 28 },
  eyebrow: { fontSize: 9, letterSpacing: 2.5, color: colors.greenDim },
  muted: { fontSize: 11.5, lineHeight: 17, color: colors.greenDim },

  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20, paddingTop: 6 },
  heroWide: { gap: 32, paddingVertical: 12 },
  markWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  name: { fontSize: 38, lineHeight: 42, color: colors.mint },
  email: { fontSize: 11, color: colors.greenDim },
  since: { fontSize: 15, lineHeight: 22, color: colors.mint, fontStyle: 'italic', marginTop: 4 },

  stats: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 2, borderBottomWidth: 1, borderColor: colors.mint, paddingVertical: 12, rowGap: 12 },
  stat: { flexGrow: 1, alignItems: 'center' },
  statValue: { fontSize: 30, lineHeight: 32, color: colors.mint },
  statLabel: { marginTop: 2, fontSize: 8.5, letterSpacing: 1.5, color: colors.greenDim, textAlign: 'center' },

  cols: { flexDirection: 'row', gap: 32, alignItems: 'flex-start' },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 10.5, letterSpacing: 2.4, color: colors.mint },
  rule: { flex: 1, height: 1, backgroundColor: colors.greenBorderDim },
  note: { fontSize: 9.5, color: colors.greenDim },

  heat: { flexDirection: 'row', gap: 3, flexWrap: 'wrap' },
  heatDay: { width: 16, height: 16 },
  hourAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axis: { fontSize: 8.5, color: colors.greenDim },
  insight: { fontSize: 15, lineHeight: 22, color: colors.mint, fontStyle: 'italic' },

  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: {
    flexGrow: 1, flexBasis: 150, maxWidth: 260, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.greenBorderDim,
    borderTopWidth: 3, borderTopColor: colors.mint, padding: 10, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  factCardTilt: { transform: [{ rotate: '-1deg' }] },
  factLabel: { fontSize: 8.5, letterSpacing: 1.6, color: colors.greenDim },
  factText: { fontSize: 15, lineHeight: 21, color: colors.mint },
  more: { fontSize: 10, letterSpacing: 1.6, color: colors.mint, textDecorationLine: 'underline' },

  readRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readTitle: { flex: 1.4, fontSize: 14, color: colors.mint },
  readTrack: { flex: 1, flexDirection: 'row', height: 4, backgroundColor: colors.greenBorderDim },
  readFill: { backgroundColor: colors.signal },
  readPct: { width: 36, fontSize: 10, color: colors.greenDim, textAlign: 'right' },

  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.greenBorderDim, padding: 12, backgroundColor: '#fff' },
  settingIcon: { width: 34, height: 34, borderWidth: 1, borderColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 13, color: colors.mint },
  settingDetail: { marginTop: 2, fontSize: 10.5, lineHeight: 15, color: colors.greenDim },
  chevron: { fontSize: 20, color: colors.greenDim },
  pressed: { opacity: 0.6 },

  confirm: { borderWidth: 2, borderColor: colors.danger, padding: 12, gap: 10 },
  confirmText: { fontSize: 11.5, lineHeight: 17, color: colors.danger },
  confirmRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  deleteBtn: { backgroundColor: colors.danger, paddingHorizontal: 14, paddingVertical: 11 },
  deleteText: { color: '#fff', fontSize: 10.5, letterSpacing: 1.6 },
  keepBtn: { borderWidth: 1, borderColor: colors.mint, paddingHorizontal: 14, paddingVertical: 10 },
  keepText: { color: colors.mint, fontSize: 10.5, letterSpacing: 1.6 },

  logout: { borderWidth: 1, borderColor: colors.danger, paddingVertical: 13, alignItems: 'center' },
  logoutText: { fontSize: 11, letterSpacing: 2.5, color: colors.danger },
  footnote: { fontSize: 10, lineHeight: 15, color: colors.greenDim, textAlign: 'center' },
});
