import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Chess } from 'chess.js';
import { ChessBoard } from '../../components/ChessBoard';
import { Glyph } from '../../components/glyph/Glyph';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api, ApiError } from '../../api/client';
import type { GameMatch, PlayerRating } from '../../api/types';
import { sfx } from '../../util/sound';

// the games WYRD plays; the ones still being built say so
const CATALOG = [
  { key: 'chess', name: 'Chess', blurb: 'Strategy. WYRD matches its strength to your rating.', ready: true },
  { key: 'connect4', name: 'Connect Four', blurb: 'Four in a row, before WYRD gets there.', ready: false },
  { key: 'reversi', name: 'Reversi', blurb: 'Flip the board your way.', ready: false },
  { key: 'tictactoe', name: 'Tic-tac-toe', blurb: 'Quick, and WYRD never blinks.', ready: false },
  { key: 'words', name: 'Word duel', blurb: 'Definitions, riddles and facts against what WYRD knows.', ready: false },
  { key: 'liarsdice', name: "Liar's Dice", blurb: 'Bluff WYRD. It is watching for tells.', ready: false },
] as const;

const LEVEL = ['', 'GENTLE', 'EASY', 'STEADY', 'SHARP', 'STRONG', 'FULL STRENGTH'];
const RESULT: Record<string, string> = { won: 'YOU WON', lost: 'WYRD WON', draw: 'DRAW', resigned: 'RESIGNED' };

/** GAMES: play WYRD for a rating. Chess first; the rest of the arcade joins in stages. */
export function GamesTab() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [ratings, setRatings] = useState<PlayerRating[]>([]);
  const [board, setBoard] = useState<PlayerRating[]>([]);
  const [match, setMatch] = useState<GameMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null); // the open game, or the arcade

  const refresh = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([api.gameRatings(), api.gameLeaderboard('chess')]);
      setRatings(r); setBoard(b);
    } catch { /* the arcade still shows */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const openChess = async () => {
    setView('chess'); setError(null);
    try { setMatch(await api.gameActive('chess')); } catch (e) { setError(msg(e)); }
  };

  const start = async (side: 'w' | 'b' | 'random') => {
    setBusy(true); setError(null);
    try { setMatch(await api.chessStart(side)); sfx('open'); }
    catch (e) { setError(msg(e)); }
    finally { setBusy(false); }
  };

  const move = async (from: string, to: string, promotion?: string) => {
    if (!match) return;
    // shown at once; the server's answer (with WYRD's reply) replaces it
    const local = new Chess(match.state);
    try { local.move({ from, to, promotion }); } catch { return; }
    setMatch({ ...match, state: local.fen(), moves: [...match.moves, local.history().slice(-1)[0]], remark: '…' });
    setBusy(true); setError(null);
    sfx('tick');
    try {
      const next = await api.chessMove(match.id, from, to, promotion);
      setMatch(next);
      if (next.status !== 'active') { sfx(next.status === 'won' ? 'ready' : 'alert'); void refresh(); }
      else sfx('tab');
    } catch (e) {
      setError(msg(e));
      setMatch(match);
    } finally { setBusy(false); }
  };

  const resign = async () => {
    if (!match) return;
    setBusy(true);
    try { setMatch(await api.gameResign(match.id)); void refresh(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  const chessRating = ratings.find((r) => r.game === 'chess');

  if (view === 'chess') {
    const boardSize = Math.min(wide ? 520 : width - 32, 560);
    return (
      <ScrollView contentContainerStyle={[styles.wrap, wide && styles.wrapWide]}>
        <Pressable onPress={() => setView(null)} hitSlop={8}><Mono style={styles.back}>‹ ARCADE</Mono></Pressable>
        <View style={[styles.play, wide && styles.playWide]}>
          <View style={{ gap: 10 }}>
            {match ? (
              <ChessBoard
                fen={match.state}
                side={match.playerSide}
                lastMove={lastMove(match.moves)}
                size={boardSize}
                disabled={busy || match.status !== 'active'}
                onMove={move}
              />
            ) : (
              <View style={[styles.empty, { width: boardSize, height: boardSize }]}>
                <Display style={styles.emptyTitle}>CHESS</Display>
                <Mono style={styles.muted}>Choose your side to begin.</Mono>
              </View>
            )}
          </View>

          <View style={[styles.side, wide && { width: 300 }]}>
            {match ? (
              <>
                <View style={styles.speech}>
                  <View style={[styles.liveDot, busy && styles.liveDotBusy]} />
                  <Mono style={styles.speechText}>{busy ? 'WYRD is thinking…' : match.remark ?? ''}</Mono>
                </View>
                <View style={styles.metaRow}>
                  <Mono style={styles.tag}>WYRD · {LEVEL[match.wyrdLevel]}</Mono>
                  <Mono style={styles.tag}>YOU PLAY {match.playerSide === 'w' ? 'WHITE' : 'BLACK'}</Mono>
                </View>
                {match.status !== 'active' ? (
                  <View style={styles.result}>
                    <Display style={styles.resultTitle}>{RESULT[match.status]}</Display>
                    {match.ratingAfter != null ? (
                      <Mono style={styles.resultDelta}>
                        Rating {Math.round(match.ratingAfter)} ({signed(match.ratingAfter - match.ratingBefore)})
                      </Mono>
                    ) : null}
                  </View>
                ) : null}
                <Moves moves={match.moves} />
              </>
            ) : null}

            {!match || match.status !== 'active' ? (
              <View style={{ gap: 8 }}>
                <Mono style={styles.label}>NEW GAME</Mono>
                <View style={styles.btnRow}>
                  {(['w', 'random', 'b'] as const).map((s) => (
                    <Pressable key={s} disabled={busy} onPress={() => start(s)} style={({ pressed }) => [styles.btn, s === 'random' && styles.btnPrimary, pressed && styles.pressed]}>
                      <Mono style={[styles.btnText, s === 'random' && styles.btnTextPrimary]}>{s === 'w' ? 'WHITE' : s === 'b' ? 'BLACK' : 'RANDOM'}</Mono>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <Pressable disabled={busy} onPress={resign} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
                <Mono style={styles.btnText}>RESIGN</Mono>
              </Pressable>
            )}
            {busy && !match ? <ActivityIndicator color={colors.signal} /> : null}
            {error ? <Mono style={styles.error}>{error}</Mono> : null}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.wrap, wide && styles.wrapWide]}>
      <View style={{ gap: 4 }}>
        <Mono style={styles.label}>GAMES</Mono>
        <Display style={styles.title}>Play WYRD</Display>
        <Mono style={styles.muted}>Every win and loss moves your rating. WYRD plays at your level, so every game is a real one.</Mono>
      </View>

      <View style={styles.grid}>
        {CATALOG.map((g) => {
          const r = ratings.find((x) => x.game === g.key);
          return (
            <Pressable
              key={g.key}
              disabled={!g.ready}
              onPress={g.key === 'chess' ? openChess : undefined}
              style={({ pressed }) => [styles.card, wide && styles.cardWide, !g.ready && styles.cardSoon, pressed && styles.pressed]}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardTitle}>
                  <Glyph name={g.ready ? 'games' : 'spark'} size={34} color={g.ready ? colors.signal : colors.greenDim} active={g.ready} />
                  <Display style={styles.cardName}>{g.name}</Display>
                </View>
                {g.ready ? <Mono style={styles.play_}>PLAY ›</Mono> : <Mono style={styles.soon}>SOON</Mono>}
              </View>
              <Mono style={styles.muted}>{g.blurb}</Mono>
              {r ? <Mono style={styles.cardStat}>Rating {Math.round(r.rating)} · {r.wins}W {r.losses}L {r.draws}D</Mono> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <View style={styles.cardTitle}>
          <Glyph name="trophy" size={20} color={colors.signal} />
          <Mono style={styles.label}>LEADERBOARD · CHESS</Mono>
        </View>
        {board.length ? board.map((p, i) => (
          <View key={p.id} style={[styles.boardRow, chessRating?.id === p.id && styles.boardRowMe]}>
            <Mono style={styles.rank}>{i + 1}</Mono>
            <Mono style={styles.who} numberOfLines={1}>{p.name}</Mono>
            <Mono style={styles.record}>{p.wins}W {p.losses}L</Mono>
            <Mono style={styles.score}>{Math.round(p.rating)}</Mono>
          </View>
        )) : <Mono style={styles.muted}>No one has finished a game yet. Be first.</Mono>}
      </View>
    </ScrollView>
  );
}

/** The moves so far, numbered in pairs. */
function Moves({ moves }: { moves: string[] }) {
  if (!moves.length) return null;
  const pairs: string[] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push(`${i / 2 + 1}. ${moves[i]}${moves[i + 1] ? `  ${moves[i + 1]}` : ''}`);
  return (
    <ScrollView style={styles.moves} contentContainerStyle={{ padding: 10, gap: 2 }}>
      {pairs.map((p, i) => <Mono key={i} style={styles.moveText}>{p}</Mono>)}
    </ScrollView>
  );
}

function lastMove(moves: string[]) {
  if (!moves.length) return null;
  const g = new Chess();
  try { for (const m of moves) g.move(m); } catch { return null; }
  const h = g.history({ verbose: true });
  const l = h[h.length - 1];
  return l ? { from: l.from, to: l.to } : null;
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}`;
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 22, paddingBottom: 48 },
  wrapWide: { padding: 32, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  label: { fontSize: 10, letterSpacing: 2.5, color: colors.greenDim },
  title: { fontSize: 44, lineHeight: 46, color: colors.mint },
  muted: { fontSize: 12, lineHeight: 18, color: colors.greenDim },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '100%', borderWidth: 1, borderColor: colors.greenBorderDim, padding: 14, gap: 6, backgroundColor: '#fff' },
  cardWide: { width: '32%', minWidth: 260, flexGrow: 1 },
  cardSoon: { opacity: 0.55 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 26, color: colors.mint },
  play_: { fontSize: 11, letterSpacing: 1.5, color: colors.signal },
  soon: { fontSize: 9.5, letterSpacing: 1.8, color: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 6, paddingVertical: 1 },
  cardStat: { fontSize: 11, color: colors.mint, marginTop: 4 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.greenBorderDim },
  boardRowMe: { backgroundColor: colors.signalSoft },
  rank: { width: 22, fontSize: 12, color: colors.greenDim },
  who: { flex: 1, fontSize: 13, color: colors.mint },
  record: { fontSize: 11, color: colors.greenDim },
  score: { width: 52, textAlign: 'right', fontSize: 14, color: colors.signal },
  back: { fontSize: 11, letterSpacing: 2, color: colors.greenDim },
  play: { gap: 18 },
  playWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  side: { gap: 14, flexShrink: 1 },
  empty: { borderWidth: 1, borderColor: colors.greenBorderDim, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fafafa', maxWidth: '100%' },
  emptyTitle: { fontSize: 40, color: colors.mint },
  speech: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderLeftWidth: 2, borderLeftColor: colors.signal, paddingLeft: 12, paddingVertical: 4 },
  speechText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.mint },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.greenBorderDim, marginTop: 6 },
  liveDotBusy: { backgroundColor: colors.signal },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { fontSize: 9.5, letterSpacing: 1.6, color: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 7, paddingVertical: 2 },
  result: { gap: 2 },
  resultTitle: { fontSize: 34, color: colors.signal },
  resultDelta: { fontSize: 12, color: colors.mint },
  moves: { maxHeight: 180, borderWidth: 1, borderColor: colors.greenBorderDim, backgroundColor: colors.codeBg },
  moveText: { fontSize: 12, color: colors.mint },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderWidth: 1, borderColor: colors.mint, paddingVertical: 11, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.signal, borderColor: colors.signal },
  btnText: { fontSize: 11, letterSpacing: 1.8, color: colors.mint },
  btnTextPrimary: { color: colors.onSignal },
  pressed: { opacity: 0.7 },
  error: { fontSize: 12, color: colors.danger },
});
