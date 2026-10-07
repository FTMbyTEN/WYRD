import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { notify } from '../../util/dialog';
import { Display, Mono } from '../../components/ui';
import { colors, fonts } from '../../theme';
import { Glyph } from '../../components/glyph/Glyph';
import { FaceMark } from '../../components/FaceMark';
import { Avatar } from '../../components/Avatar';
import { AvatarEditor, chooseImage, listenForDrop } from '../../components/AvatarEditor';
import { wyrdStream } from '../../api/stream';
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
  /** 'all': the whole page (phones). 'you': without settings (desktop, where Settings has its own place in the rail). 'settings': only settings. */
  view?: 'all' | 'you' | 'settings';
  onOpenCop: () => void;
}

/** YOU: who you are to WYRD. Your mark and your history together, when you talk, everything
 *  it has learned about you (kept private), what you're reading, and your settings and data. */
/** Owner only: how many people have accounts, counted in each table they could live in, and the
 *  newest sign-ups -- so "where are the users?" has an answer without opening the database. */
/** For WYRD's owner only: who has come to WYRD. A headline (everyone who signed up, and how many
 *  this week), sign-ups day by day for two weeks, the tables that matter as tiles, and the newest
 *  people. The server refuses anyone else. */
function OwnerPeople() {
  type People = { counts: Record<string, number | null>; recent: { name: string; at: string }[]; daily?: { day: string; n: number }[] };
  const [s, setS] = useState<People | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.ownerUserStats().then((j) => setS(JSON.parse(j))).catch((e) => setErr(String(e?.message ?? e))); }, []);
  const n = (k: string) => s?.counts[k] ?? null;
  const daily = s?.daily ?? [];
  const week = daily.slice(-7).reduce((a, d) => a + d.n, 0);
  const peak = Math.max(1, ...daily.map((d) => d.n));
  const ago = (iso: string) => {
    const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
    return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  };
  const tiles: [string, number | null, string][] = [
    ['WYRD profiles', n('user_profile'), colors.indigo],
    ['NAIJA 2099 players', n('player_character'), colors.palm],
    ['Unfinished sign-ups', n('serverpod_auth_idp_email_account_request'), colors.ochre],
    ['Accounts (auth)', n('serverpod_auth_core_user'), colors.signal],
  ];
  return (
    <Section title="OWNER · PEOPLE" note="only you can see this">
      {err ? <Mono style={styles.muted}>{err}</Mono> : !s ? <Mono style={styles.muted}>Counting…</Mono> : (
        <View style={{ gap: 12 }}>
          {/* the headline */}
          <View style={people.hero}>
            <View style={{ flex: 1 }}>
              <Mono style={people.heroEyebrow}>PEOPLE WHO SIGNED UP</Mono>
              <Display style={people.heroNum}>{(n('serverpod_auth_idp_email_account') ?? 0).toLocaleString()}</Display>
              <Mono style={people.heroSub}>{week > 0 ? `+${week} in the last 7 days` : 'No new sign-ups this week'}</Mono>
            </View>
            {/* two weeks, a bar a day */}
            <View style={people.chart}>
              {daily.map((d, i) => (
                <View key={d.day} style={people.barCol}>
                  <View style={[people.bar, { height: 4 + (d.n / peak) * 56, opacity: d.n ? 1 : 0.25, backgroundColor: i === daily.length - 1 ? colors.ochre : colors.signal }]} />
                </View>
              ))}
            </View>
          </View>
          {/* the tables that matter */}
          <View style={people.tiles}>
            {tiles.map(([label, v, c]) => (
              <View key={label} style={people.tile}>
                <Display style={[people.tileNum, { color: c }]}>{v == null ? '—' : v.toLocaleString()}</Display>
                <Mono style={people.tileLabel}>{label}</Mono>
              </View>
            ))}
          </View>
          {/* the newest people */}
          {s.recent.length ? (
            <View style={people.list}>
              <Mono style={people.listHead}>NEWEST</Mono>
              {s.recent.slice(0, 6).map((r) => (
                <View key={r.name + r.at} style={people.row}>
                  <View style={people.avatar}><Mono style={people.avatarText}>{(r.name[0] ?? '?').toUpperCase()}</Mono></View>
                  <Mono style={people.name} numberOfLines={1}>{r.name}</Mono>
                  <Mono style={people.when}>{ago(r.at)}</Mono>
                </View>
              ))}
            </View>
          ) : null}
          {n('serverpod_user_info') != null ? <Mono style={styles.muted}>Old auth table: {n('serverpod_user_info')} rows (from before the auth upgrade).</Mono> : null}
        </View>
      )}
    </Section>
  );
}

const people = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, backgroundColor: colors.indigo, borderRadius: 22, padding: 20 },
  heroEyebrow: { fontSize: 10.5, letterSpacing: 1.2, color: colors.ochre, fontFamily: fonts.bodyBold },
  heroNum: { fontSize: 48, lineHeight: 54, color: colors.cream, fontFamily: fonts.displayBold },
  heroSub: { fontSize: 13, color: colors.sand },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 64 },
  barCol: { width: 8, height: 64, justifyContent: 'flex-end' },
  bar: { width: 8, borderRadius: 3 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 18, padding: 14, gap: 2 },
  tileNum: { fontSize: 26, lineHeight: 30, fontFamily: fonts.displayBold },
  tileLabel: { fontSize: 11.5, color: colors.greenDim, fontFamily: fonts.bodyMedium },
  list: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 18, paddingVertical: 8 },
  listHead: { fontSize: 10.5, letterSpacing: 1.2, color: colors.signal, fontFamily: fonts.bodyBold, paddingHorizontal: 14, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 7 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, color: colors.indigo, fontFamily: fonts.bodyBold },
  name: { flex: 1, fontSize: 13.5, color: colors.mint, fontFamily: fonts.bodyMedium },
  when: { fontSize: 11.5, color: colors.greenDim },
});

export function YouTab({ tts, onToggleTts, onOpenCop, view = 'all' }: Props) {
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
  const name = profile?.username || (email ?? '—').split('@')[0];
  const [editing, setEditing] = useState<string | null>(null);
  const saved = (p: unknown) => { wyrdStream.publish('profile', p); };
  // the picture: click (or drop an image on it) -> place and zoom it in the editor -> save
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const picRef = useRef<View>(null);
  useEffect(() => listenForDrop(picRef.current as unknown as HTMLElement | null, setCropSrc, setDropping), []);
  const changePicture = async () => { const url = await chooseImage(); if (url) setCropSrc(url); };
  const closeEditor = () => { if (cropSrc) URL.revokeObjectURL(cropSrc); setCropSrc(null); };
  const savePicture = async (dataUrl: string) => {
    try { saved(await api.setAvatar(dataUrl)); closeEditor(); } catch { notify('Picture not saved', 'Could not reach WYRD. Try again.'); }
  };
  const saveName = async () => {
    const n = (editing ?? '').trim();
    if (!n || n === name) return setEditing(null);
    try { saved(await api.setName(n)); setEditing(null); } catch { notify('Name not saved', 'Use 1 to 40 characters and try again.'); }
  };

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

    </>
  );

  const settings = (
    <>
      <Section title="SETTINGS">
        <Setting icon={<SpeakerIcon />} title="Spoken replies" detail="WYRD reads its chat replies aloud">
          <Switch value={tts} onValueChange={onToggleTts} trackColor={{ false: colors.greenBorderDim, true: colors.signal }} thumbColor="#FFFAF2" />
        </Setting>
        {owner ? <Setting icon={<ShieldIcon />} title="COP oversight" detail="Every change WYRD made to itself, independently reviewed" onPress={onOpenCop} /> : null}
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
        <Mono style={styles.logoutText}>Sign out</Mono>
      </Pressable>
    </>
  );

  if (view === 'settings') {
    return (
      <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide, { maxWidth: 760 }]}>
        <Mono style={styles.eyebrow}>SETTINGS</Mono>
        <View style={{ gap: 22 }}>{settings}</View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]}>
      {/* hero */}
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.markWrap}>
          <View ref={picRef}>
            <Pressable onPress={changePicture} accessibilityRole="button" accessibilityLabel="Change your picture">
              {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => (
                <View>
                  <Avatar uri={profile?.avatar} name={name} size={96} ring={dropping ? colors.ochre : colors.signal} />
                  {hovered || pressed || dropping ? (
                    <View style={styles.picOverlay}>
                      <Glyph name="camera" size={22} color="#FFFAF2" />
                      <Mono style={styles.picOverlayText}>{dropping ? 'Drop it' : profile?.avatar ? 'Change' : 'Add photo'}</Mono>
                    </View>
                  ) : (
                    <View style={styles.camBadge}><Glyph name="camera" size={16} color={colors.onSignal} /></View>
                  )}
                </View>
              )}
            </Pressable>
          </View>
          {profile?.avatar ? (
            <Pressable onPress={() => { api.setAvatar(null).then(saved).catch(() => {}); }} hitSlop={6}><Mono style={styles.removePic}>Remove</Mono></Pressable>
          ) : <Mono style={styles.removePic}>or drop an image</Mono>}
          <AvatarEditor src={cropSrc} onCancel={closeEditor} onSave={savePicture} />
        </View>
        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Mono style={styles.eyebrow}>YOU, TO WYRD</Mono>
          {editing != null ? (
            <TextInput value={editing} onChangeText={setEditing} onSubmitEditing={saveName} onBlur={saveName} autoFocus maxLength={40}
              placeholder="what should WYRD call you?" placeholderTextColor={colors.greenBorder} style={[styles.name, styles.nameInput, wide && { fontSize: 54, lineHeight: 58 }]} />
          ) : (
            <Pressable onPress={() => setEditing(name)} accessibilityRole="button" accessibilityLabel="Change what WYRD calls you">
              <Display numberOfLines={1} style={[styles.name, wide && { fontSize: 54, lineHeight: 58 }]}>{name} <Mono style={styles.editHint}>edit</Mono></Display>
            </Pressable>
          )}
          <Mono numberOfLines={1} style={styles.email}>{email ?? ''}</Mono>
          <Text style={[styles.since, { fontFamily: serif }]}>
            {profile?.firstSeen
              ? `Together since ${new Date(profile.firstSeen).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}${mind ? ` — WYRD is feeling ${mind.mood} today.` : '.'}`
              : 'Say hello in Dialogue Link and WYRD will start to know you.'}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        {stats.map(([v, k], i) => (
          <View key={k} style={[styles.stat, wide ? { flexBasis: '15%' } : { flexBasis: '31%' }]}>
            <Display style={[styles.statValue, { color: [colors.palm, colors.indigo, colors.signal][i % 3] }]}>{v}</Display>
            <Mono style={styles.statLabel}>{k}</Mono>
          </View>
        ))}
      </View>

      {wide ? (
        <View style={styles.cols}>
          <View style={{ flex: 1.2, gap: 22, minWidth: 0 }}>{left}</View>
          <View style={{ flex: 1, gap: 22, minWidth: 0 }}>{right}{view === 'all' ? settings : null}</View>
        </View>
      ) : (
        <View style={{ gap: 22 }}>{left}{right}{view === 'all' ? settings : null}</View>
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
  // a terracotta scale: pale sand for quiet days, deep terracotta for the busiest
  const shade = (n: number) => (n === 0 ? '#F0E4D0' : n / max > 0.66 ? colors.signal : n / max > 0.33 ? '#DC8A66' : '#EDC3AC');

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
            <Rect key={h} x={h * 10 + 1} y={46 - (n / hourMax) * 44} width={8} height={Math.max(1, (n / hourMax) * 44)} fill={h === peak ? colors.signal : '#E6CDB0'} />
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
  eyebrow: { fontSize: 11, letterSpacing: 1.4, color: colors.signal, fontFamily: fonts.bodyBold },
  muted: { fontSize: 11.5, lineHeight: 17, color: colors.greenDim },

  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20, paddingTop: 6 },
  heroWide: { gap: 32, paddingVertical: 12 },
  markWrap: { width: 108, height: 108, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.ochre, borderWidth: 4, borderColor: colors.signal, alignItems: 'center', justifyContent: 'center' },
  camBadge: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.signal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.cream },
  picOverlay: { position: 'absolute', inset: 0, borderRadius: 48, backgroundColor: 'rgba(42,31,23,0.55)', alignItems: 'center', justifyContent: 'center', gap: 2 } as object,
  picOverlayText: { fontSize: 11, color: '#FFFAF2', fontFamily: fonts.bodyBold },
  removePic: { fontSize: 11, color: colors.greenDim, textAlign: 'center', marginTop: 4, textDecorationLine: 'underline' },
  editHint: { fontSize: 12, color: colors.greenDim, textDecorationLine: 'underline' },
  nameInput: { borderBottomWidth: 2, borderBottomColor: colors.signal, paddingVertical: 0 },
  avatarInitial: { fontSize: 44, lineHeight: 50, color: colors.indigo, fontFamily: fonts.displayBold },
  mark: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFAF2' },
  name: { fontSize: 38, lineHeight: 42, color: colors.mint },
  email: { fontSize: 11, color: colors.greenDim },
  since: { fontSize: 15, lineHeight: 22, color: colors.greenDim, fontFamily: fonts.displayItalic, marginTop: 4 },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 18, paddingVertical: 14 },
  statValue: { fontSize: 28, lineHeight: 32, color: colors.mint, fontFamily: fonts.displayBold },
  statLabel: { marginTop: 2, fontSize: 10, letterSpacing: 0.8, color: colors.greenDim, textAlign: 'center', fontFamily: fonts.bodyMedium },

  cols: { flexDirection: 'row', gap: 32, alignItems: 'flex-start' },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.4, color: colors.signal, fontFamily: fonts.bodyBold },
  rule: { flex: 1, height: 1, backgroundColor: colors.greenBorderDim },
  note: { fontSize: 9.5, color: colors.greenDim },

  heat: { flexDirection: 'row', gap: 3, flexWrap: 'wrap' },
  heatDay: { width: 16, height: 16 },
  hourAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axis: { fontSize: 8.5, color: colors.greenDim },
  insight: { fontSize: 15, lineHeight: 22, color: colors.mint, fontStyle: 'italic' },

  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: {
    flexGrow: 1, flexBasis: 150, maxWidth: 260, backgroundColor: '#FFFAF2', borderWidth: 1, borderColor: colors.greenBorderDim,
    borderTopWidth: 3, borderTopColor: colors.mint, padding: 10, gap: 4,
    shadowColor: '#2A1F17', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
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

  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 18, padding: 14, backgroundColor: colors.card },
  settingIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 14, color: colors.mint, fontFamily: fonts.bodyMedium },
  settingDetail: { marginTop: 2, fontSize: 10.5, lineHeight: 15, color: colors.greenDim },
  chevron: { fontSize: 20, color: colors.greenDim },
  pressed: { opacity: 0.6 },

  confirm: { borderWidth: 2, borderColor: colors.danger, padding: 12, gap: 10 },
  confirmText: { fontSize: 11.5, lineHeight: 17, color: colors.danger },
  confirmRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  deleteBtn: { backgroundColor: colors.danger, paddingHorizontal: 14, paddingVertical: 11 },
  deleteText: { color: '#FFFAF2', fontSize: 10.5, letterSpacing: 1.6 },
  keepBtn: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 14, paddingVertical: 10 },
  keepText: { color: colors.mint, fontSize: 10.5, letterSpacing: 1.6 },
  logout: { borderWidth: 1.5, borderColor: colors.signal, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  logoutText: { fontSize: 14, letterSpacing: 0.4, color: colors.signal, fontFamily: fonts.bodyBold },
  footnote: { fontSize: 10, lineHeight: 15, color: colors.greenDim, textAlign: 'center' },
});
