import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { createPortal } from 'react-dom';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { Chess } from 'chess.js';
import { ChessBoard } from '../../components/ChessBoard';
import { ConnectFourBoard, ReversiBoard, TicTacToeBoard, reversiCount } from '../../components/games/Boards';
import { Glyph } from '../../components/glyph/Glyph';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api, ApiError } from '../../api/client';
import type { GameMatch, PlayerRating } from '../../api/types';
import { sfx } from '../../util/sound';

type GameKey = 'chess' | 'connect4' | 'reversi' | 'tictactoe';

// the open world loads only when someone walks in: its 3D engine stays out of everyone else's download
/** On a phone the game plays landscape: fullscreen, then lock sideways (Android); iOS can't lock, so it asks. */
const isPhone = () => Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
function enterLandscape() {
  if (!isPhone()) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  Promise.resolve(el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.())
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
    .catch(() => {});
}
function leaveLandscape() {
  if (!isPhone()) return;
  try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.(); } catch { /* not locked */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
/** On the web the game is drawn straight into the page body, above the app's header and tab bar
 *  (a fixed box inside the tab navigator still sits under its tab bar). */
function OverApp({ children }: { children: React.ReactElement }) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}
const LagosWorld = lazy(() => import('../../world2d/Lagos2D').then((m) => ({ default: m.Lagos2D })));
/** If the world fails to load or crashes (an old phone, a lost connection), only the world goes:
 *  the rest of WYRD stays up, and there's a way back. */
class WorldBoundary extends React.Component<{ onExit: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[world]', e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <Display style={{ fontSize: 28, color: colors.mint }}>Lagos couldn't load</Display>
        <Mono style={{ fontSize: 12, color: colors.greenDim, textAlign: 'center' }}>Your device or connection didn't manage the 3D world this time. Try again in a moment.</Mono>
        <Pressable onPress={this.props.onExit} style={{ borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Mono style={{ fontSize: 11, letterSpacing: 2, color: colors.mint }}>BACK TO GAMES</Mono>
        </Pressable>
      </View>
    );
  }
}
const canWebGL = (() => { try { return Platform.OS === 'web' && !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();

// the games WYRD plays; the ones still being built say so
const CATALOG: { key: string; name: string; blurb: string; ready: boolean }[] = [
  { key: 'chess', name: 'Chess', blurb: 'Strategy. WYRD matches its strength to your rating.', ready: true },
  { key: 'connect4', name: 'Connect Four', blurb: 'Four in a row, before the other side gets there.', ready: true },
  { key: 'reversi', name: 'Reversi', blurb: 'Flip the board your way. Corners are everything.', ready: true },
  { key: 'tictactoe', name: 'Tic-tac-toe', blurb: 'Quick. At full strength, WYRD never loses.', ready: true },
  { key: 'words', name: 'Word duel', blurb: 'Definitions, riddles and facts against what WYRD knows.', ready: false },
  { key: 'liarsdice', name: "Liar's Dice", blurb: 'Bluff WYRD. It is watching for tells.', ready: false },
];
const NAME: Record<string, string> = Object.fromEntries(CATALOG.map((g) => [g.key, g.name]));

const LEVEL = ['', 'GENTLE', 'EASY', 'STEADY', 'SHARP', 'STRONG', 'FULL STRENGTH'];
const POLL_MS = 2500; // pvp: how often to look for the other side's move, only while waiting on it

// where you were: a refresh brings you back to the same game, mode and match instead of the arcade
const ROOM_KEY = 'wyrd.gameRoom';
type Saved = { game: GameKey; mode: 'wyrd' | 'pvp'; matchId?: number };
const loadRoom = (): Saved | null => { try { return JSON.parse(sessionStorage.getItem(ROOM_KEY) ?? 'null') as Saved | null; } catch { return null; } };
const saveRoom = (r: Saved | null) => { try { if (r) sessionStorage.setItem(ROOM_KEY, JSON.stringify(r)); else sessionStorage.removeItem(ROOM_KEY); } catch { /* fine */ } };

/** A game as the app uses it: if the server didn't say which side you are (an older server), it's
 *  worked out here -- against WYRD you always play the player's side. Without this the board
 *  thought it was never your turn after a refresh, and froze. */
function withSide(m: GameMatch | null): GameMatch | null {
  if (!m) return m;
  const mode = m.mode ?? 'wyrd';
  return { ...m, mode, viewerSide: m.viewerSide ?? (mode === 'wyrd' ? (m.playerSide as 'w' | 'b') : null) };
}

/** GAMES: play WYRD, or another person, for a rating. */
export function GamesTab() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 1000;
  const [ratings, setRatings] = useState<PlayerRating[]>([]);
  const [board, setBoard] = useState<PlayerRating[]>([]);
  const [boardGame, setBoardGame] = useState<GameKey>('chess');
  const [room, setRoom] = useState<GameKey | null>(() => loadRoom()?.game ?? null);
  const [world, setWorld] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([api.gameRatings(), api.gameLeaderboard(boardGame)]);
      setRatings(r); setBoard(b);
    } catch { /* the arcade still shows */ }
  }, [boardGame]);
  useEffect(() => { void refresh(); }, [refresh]);

  const [upright, setUpright] = useState(false);
  const wantsTurn = false && world && !upright && isPhone() && height > width; // NAIJA 2099 is PC-only now: no turning the phone
  if (world) {
    return (
      <OverApp>
      <View style={styles.worldWrap}>
        <WorldBoundary onExit={() => { leaveLandscape(); setWorld(false); }}>
          <Suspense fallback={<View style={styles.worldLoading}><ActivityIndicator color={colors.signal} /><Mono style={styles.muted}>Building Lagos…</Mono></View>}>
            <LagosWorld onExit={() => { leaveLandscape(); setWorld(false); }} />
          </Suspense>
        </WorldBoundary>
        {wantsTurn && (
          <View style={styles.turn}>
            <Mono style={styles.turnBig}>⟲</Mono>
            <Mono style={styles.turnText}>TURN YOUR PHONE SIDEWAYS</Mono>
            <Mono style={styles.muted}>NAIJA 2099 plays best in landscape.</Mono>
            <Pressable onPress={() => setUpright(true)} style={styles.turnBtn}><Mono style={styles.turnBtnText}>PLAY UPRIGHT INSTEAD</Mono></Pressable>
          </View>
        )}
      </View>
      </OverApp>
    );
  }
  if (room) return <GameRoom game={room} wide={wide} width={width} onBack={() => { saveRoom(null); setRoom(null); void refresh(); }} onRated={refresh} />;

  const mine = ratings.find((r) => r.game === boardGame);
  return (
    <ScrollView contentContainerStyle={[styles.wrap, wide && styles.wrapWide]}>
      <View style={{ gap: 4 }}>
        <Mono style={styles.label}>GAMES</Mono>
        <Display style={styles.title}>Play WYRD</Display>
        <Mono style={styles.muted}>Every win and loss moves your rating. Play WYRD at your level, or challenge another person while WYRD keeps score.</Mono>
      </View>

      {canWebGL ? (
        <Pressable onPress={() => { sfx('open'); setWorld(true); }} style={({ pressed }) => [styles.worldCard, pressed && styles.pressed]}>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Mono style={styles.worldEyebrow}>NEW · OPEN WORLD · PROTOTYPE</Mono>
            <Display style={styles.worldName}>Lagos, run by WYRD</Display>
            <Mono style={styles.worldBlurb}>Walk an Ojuelegba-inspired district. Danfos in the traffic, a market under umbrellas, and WYRD's real brain on a tower in the plaza: its mood sets the sky, and every thought it fires lights up the city.</Mono>
          </View>
          <Mono style={styles.worldGo}>ENTER ›</Mono>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        {CATALOG.map((g) => {
          const r = ratings.find((x) => x.game === g.key);
          return (
            <Pressable
              key={g.key}
              disabled={!g.ready}
              onPress={() => setRoom(g.key as GameKey)}
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
              {r && r.played > 0 ? <Mono style={styles.cardStat}>Rating {Math.round(r.rating)} · {r.wins}W {r.losses}L {r.draws}D</Mono> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <View style={styles.cardTitle}>
          <Glyph name="trophy" size={20} color={colors.signal} />
          <Mono style={styles.label}>LEADERBOARD</Mono>
        </View>
        <View style={styles.chips}>
          {(['chess', 'connect4', 'reversi', 'tictactoe'] as GameKey[]).map((g) => (
            <Pressable key={g} onPress={() => setBoardGame(g)} style={[styles.chip, boardGame === g && styles.chipOn]}>
              <Mono style={[styles.chipText, boardGame === g && styles.chipTextOn]}>{NAME[g].toUpperCase()}</Mono>
            </Pressable>
          ))}
        </View>
        {board.length ? board.map((p, i) => (
          <View key={p.id} style={[styles.boardRow, mine?.id === p.id && styles.boardRowMe]}>
            <Mono style={styles.rank}>{i + 1}</Mono>
            <Mono style={styles.who} numberOfLines={1}>{p.name}</Mono>
            <Mono style={styles.record}>{p.wins}W {p.losses}L</Mono>
            <Mono style={styles.score}>{Math.round(p.rating)}</Mono>
          </View>
        )) : <Mono style={styles.muted}>No one has finished a game of {NAME[boardGame]} yet. Be first.</Mono>}
      </View>
    </ScrollView>
  );
}

/** One game: against WYRD or another player, its board, the talk, and the moves. */
function GameRoom({ game, wide, width, onBack, onRated }: { game: GameKey; wide: boolean; width: number; onBack: () => void; onRated: () => void }) {
  const saved = useRef(loadRoom()).current;
  const [mode, setMode] = useState<'wyrd' | 'pvp'>(saved?.game === game ? saved.mode : 'wyrd');
  const [match, setMatchRaw] = useState<GameMatch | null>(null);
  const setMatch = useCallback((m: GameMatch | null) => setMatchRaw(withSide(m)), []);
  // remember where we are, so a refresh comes back here
  useEffect(() => { saveRoom({ game, mode, matchId: match?.mode === 'pvp' ? match.id : undefined }); }, [game, mode, match?.id, match?.mode]);
  const [lobby, setLobby] = useState<{ open: GameMatch[]; mine: GameMatch[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardSize = Math.min(wide ? 520 : width - 32, 560);

  // against WYRD: the game in progress, if any
  useEffect(() => {
    setMatch(null); setError(null);
    if (mode === 'wyrd') api.gameActive(game).then(setMatch).catch((e) => setError(msg(e)));
    else {
      void loadLobby();
      // a refresh during a game against a player: pick that game straight back up
      if (saved?.game === game && saved.mode === 'pvp' && saved.matchId) {
        api.gamePoll(saved.matchId, -1).then((m) => { if (m && m.status !== 'over') setMatch(m); }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, game]);

  const loadLobby = useCallback(async () => {
    try {
      const [open, mine] = await Promise.all([api.gameOpenChallenges(game), api.gameMyPvp()]);
      setLobby({ open, mine: mine.filter((m) => m.game === game) });
    } catch (e) { setError(msg(e)); }
  }, [game]);

  // pvp: while it's the other side's turn (or the challenge waits), look for news every few seconds.
  // The server answers "nothing new" from memory, so this costs it almost nothing.
  const matchRef = useRef(match);
  matchRef.current = match;
  const myTurn = match ? turnOf(match) === match.viewerSide : false;
  const waiting = !!match && match.mode === 'pvp' && (match.status === 'waiting' || (match.status === 'active' && !myTurn));
  useEffect(() => {
    if (!waiting || !match) return;
    const id = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const m = matchRef.current;
      if (!m) return;
      try {
        const next = await api.gamePoll(m.id, m.version);
        if (next) {
          setMatch(next);
          if (next.status === 'over') { sfx(resultFor(next) === 'won' ? 'ready' : 'alert'); onRated(); } else sfx('tab');
        }
      } catch { /* try again next time */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [waiting, match?.id, onRated]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (f: () => Promise<GameMatch | null | void>, after?: (m: GameMatch) => void) => {
    setBusy(true); setError(null);
    try {
      const m = await f();
      if (m) { setMatch(m); after?.(m); }
    } catch (e) { setError(msg(e)); }
    finally { setBusy(false); }
  };

  const play = (move: string) => run(() => api.gameMove(match!.id, move), (m) => {
    const over = m.status !== 'active';
    if (over) { sfx(resultFor(m) === 'won' ? 'ready' : 'alert'); onRated(); } else sfx('tick');
  });

  const mySide = (match?.viewerSide ?? 'w') === 'w' ? 0 : 1;
  const last = match?.moves.length ? match.moves[match.moves.length - 1] : null;

  return (
    <ScrollView contentContainerStyle={[styles.wrap, wide && styles.wrapWide]}>
      <View style={styles.roomHead}>
        <Pressable onPress={onBack} hitSlop={8}><Mono style={styles.back}>‹ ARCADE</Mono></Pressable>
        <Display style={styles.roomTitle}>{NAME[game]}</Display>
        <View style={styles.chips}>
          {(['wyrd', 'pvp'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.chip, mode === m && styles.chipOn]}>
              <Mono style={[styles.chipText, mode === m && styles.chipTextOn]}>{m === 'wyrd' ? 'VS WYRD' : 'VS PLAYER'}</Mono>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.play, wide && styles.playWide]}>
        <View>
          {match && match.status !== 'waiting' ? (
            <BoardFor game={game} match={match} size={boardSize} mySide={mySide} last={last} disabled={busy || match.status !== 'active' || !myTurn} onMove={play} />
          ) : (
            <View style={[styles.empty, { width: boardSize, height: game === 'connect4' ? boardSize * 6 / 7 : boardSize }]}>
              <Display style={styles.emptyTitle}>{NAME[game].toUpperCase()}</Display>
              <Mono style={styles.muted}>
                {match?.status === 'waiting' ? 'Your challenge is posted. The board opens when someone accepts.' : mode === 'wyrd' ? 'Choose your side to begin.' : 'Post a challenge, or accept one.'}
              </Mono>
              {match?.status === 'waiting' ? <ActivityIndicator color={colors.signal} /> : null}
            </View>
          )}
        </View>

        <View style={[styles.side, wide && { width: 300 }]}>
          {match ? (
            <>
              <View style={styles.speech}>
                <View style={[styles.liveDot, (busy || waiting) && styles.liveDotBusy]} />
                <Mono style={styles.speechText}>{busy && match.mode === 'wyrd' ? 'WYRD is thinking…' : match.remark ?? ''}</Mono>
              </View>
              <View style={styles.metaRow}>
                {match.mode === 'wyrd'
                  ? <Mono style={styles.tag}>WYRD · {LEVEL[match.wyrdLevel] ?? ''}</Mono>
                  : <Mono style={styles.tag}>{(match.playerName ?? '?').toUpperCase()} vs {(match.opponentName ?? '…').toUpperCase()}</Mono>}
                <Mono style={styles.tag}>YOU PLAY {sideName(game, match.viewerSide)}</Mono>
                {match.status === 'active' ? <Mono style={[styles.tag, myTurn && styles.tagOn]}>{myTurn ? 'YOUR MOVE' : 'THEIR MOVE'}</Mono> : null}
                {game === 'reversi' && match.status !== 'waiting' ? <Mono style={styles.tag}>{reversiCount(match.state).join(' : ')}</Mono> : null}
              </View>
              {['won', 'lost', 'draw', 'resigned', 'over'].includes(match.status) ? (
                <View style={{ gap: 2 }}>
                  <Display style={styles.resultTitle}>{RESULT[resultFor(match)]}</Display>
                  {match.mode === 'wyrd' && match.ratingAfter != null ? (
                    <Mono style={styles.resultDelta}>Rating {Math.round(match.ratingAfter)} ({signed(match.ratingAfter - match.ratingBefore)})</Mono>
                  ) : null}
                </View>
              ) : null}
              {game === 'chess' ? <Moves moves={match.moves} /> : null}
            </>
          ) : null}

          {mode === 'wyrd' ? (
            !match || match.status !== 'active' ? (
              <View style={{ gap: 8 }}>
                <Mono style={styles.label}>NEW GAME</Mono>
                <View style={styles.btnRow}>
                  {(['w', 'random', 'b'] as const).map((s) => (
                    <Pressable key={s} disabled={busy} onPress={() => run(() => api.gameStart(game, s), () => sfx('open'))} style={({ pressed }) => [styles.btn, s === 'random' && styles.btnPrimary, pressed && styles.pressed]}>
                      <Mono style={[styles.btnText, s === 'random' && styles.btnTextPrimary]}>{s === 'random' ? 'RANDOM' : s === 'w' ? 'GO FIRST' : 'GO SECOND'}</Mono>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null
          ) : (
            <Lobby
              game={game}
              lobby={lobby}
              match={match}
              busy={busy}
              onChallenge={() => run(() => api.gameChallenge(game), () => sfx('send'))}
              onCancel={(m) => run(async () => { await api.gameCancel(m.id); setMatch(null); await loadLobby(); })}
              onAccept={(m) => run(() => api.gameAccept(m.id), () => sfx('open'))}
              onResume={(m) => setMatch(m)}
              onRefresh={loadLobby}
            />
          )}

          {match && match.status === 'active' ? (
            <Pressable disabled={busy} onPress={() => run(() => api.gameResign(match.id), () => onRated())} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
              <Mono style={styles.btnText}>RESIGN</Mono>
            </Pressable>
          ) : null}
          {error ? <Mono style={styles.error}>{error}</Mono> : null}
        </View>
      </View>
    </ScrollView>
  );
}

/** Player vs player: post a challenge, accept someone else's, or pick up a game under way. */
function Lobby({ game, lobby, match, busy, onChallenge, onCancel, onAccept, onResume, onRefresh }: {
  game: GameKey; lobby: { open: GameMatch[]; mine: GameMatch[] } | null; match: GameMatch | null; busy: boolean;
  onChallenge: () => void; onCancel: (m: GameMatch) => void; onAccept: (m: GameMatch) => void; onResume: (m: GameMatch) => void; onRefresh: () => void;
}) {
  const waitingMine = match?.status === 'waiting' ? match : lobby?.mine.find((m) => m.status === 'waiting');
  const ongoing = (lobby?.mine ?? []).filter((m) => m.status === 'active' && m.id !== match?.id);
  return (
    <View style={{ gap: 12 }}>
      {waitingMine ? (
        <View style={styles.btnRow}>
          <View style={[styles.btn, { flex: 2 }]}><Mono style={styles.btnText}>CHALLENGE POSTED</Mono></View>
          <Pressable disabled={busy} onPress={() => onCancel(waitingMine)} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <Mono style={styles.btnText}>CANCEL</Mono>
          </Pressable>
        </View>
      ) : (
        <Pressable disabled={busy} onPress={onChallenge} style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
          <Mono style={[styles.btnText, styles.btnTextPrimary]}>POST A CHALLENGE</Mono>
        </Pressable>
      )}

      {ongoing.length ? (
        <View style={{ gap: 6 }}>
          <Mono style={styles.label}>YOUR GAMES</Mono>
          {ongoing.map((m) => (
            <Pressable key={m.id} onPress={() => onResume(m)} style={styles.lobbyRow}>
              <Mono style={styles.who} numberOfLines={1}>vs {m.viewerSide === m.playerSide ? m.opponentName : m.playerName}</Mono>
              <Mono style={[styles.tag, turnOf(m) === m.viewerSide && styles.tagOn]}>{turnOf(m) === m.viewerSide ? 'YOUR MOVE' : 'WAITING'}</Mono>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Mono style={styles.label}>OPEN CHALLENGES · {NAME[game].toUpperCase()}</Mono>
          <Pressable onPress={onRefresh} hitSlop={8}><Mono style={styles.play_}>REFRESH</Mono></Pressable>
        </View>
        {!lobby ? <ActivityIndicator color={colors.signal} /> : lobby.open.length ? lobby.open.map((m) => (
          <View key={m.id} style={styles.lobbyRow}>
            <Mono style={styles.who} numberOfLines={1}>{m.playerName ?? 'player'} · {Math.round(m.ratingBefore)}</Mono>
            <Pressable disabled={busy} onPress={() => onAccept(m)} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
              <Mono style={[styles.btnText, styles.btnTextPrimary]}>ACCEPT</Mono>
            </Pressable>
          </View>
        )) : <Mono style={styles.muted}>No open challenges right now. Post one and someone can take you on.</Mono>}
      </View>
    </View>
  );
}

function BoardFor({ game, match, size, mySide, last, disabled, onMove }: {
  game: GameKey; match: GameMatch; size: number; mySide: 0 | 1; last: string | null; disabled: boolean; onMove: (m: string) => void;
}) {
  const chessLast = useMemo(() => (game === 'chess' ? lastChessMove(match.moves) : null), [game, match.moves]);
  if (game === 'chess') {
    return (
      <ChessBoard
        fen={match.state}
        side={(match.viewerSide ?? 'w') as 'w' | 'b'}
        lastMove={chessLast}
        size={size}
        disabled={disabled}
        onMove={(from, to, promotion) => onMove(`${from}${to}${promotion ?? ''}`)}
      />
    );
  }
  const props = { state: match.state, mySide, size, disabled, last, onMove };
  if (game === 'connect4') return <ConnectFourBoard {...props} />;
  if (game === 'reversi') return <ReversiBoard {...props} />;
  return <TicTacToeBoard {...props} />;
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

function lastChessMove(moves: string[]) {
  if (!moves.length) return null;
  const g = new Chess();
  try { for (const m of moves) g.move(m); } catch { return null; }
  const h = g.history({ verbose: true });
  const l = h[h.length - 1];
  return l ? { from: l.from, to: l.to } : null;
}

/** Whose turn it is, 'w' or 'b', from the position. */
function turnOf(m: GameMatch): 'w' | 'b' {
  if (m.game === 'chess') return (m.state.split(' ')[1] as 'w' | 'b') ?? 'w';
  try { return JSON.parse(m.state).t === 0 ? 'w' : 'b'; } catch { return 'w'; }
}

/** How a finished game went for whoever is looking: won, lost or draw. */
function resultFor(m: GameMatch): 'won' | 'lost' | 'draw' | 'resigned' {
  if (m.mode === 'wyrd') return (m.status === 'active' ? 'draw' : m.status) as 'won' | 'lost' | 'draw' | 'resigned';
  const [who] = (m.result ?? 'draw').split(':');
  if (who === 'draw') return 'draw';
  const iAmStarter = m.viewerSide === m.playerSide;
  return (who === 'starter') === iAmStarter ? 'won' : 'lost';
}
const RESULT: Record<string, string> = { won: 'YOU WON', lost: 'YOU LOST', draw: 'DRAW', resigned: 'RESIGNED' };

function sideName(game: GameKey, side: string | null) {
  const first = side !== 'b';
  if (game === 'chess') return first ? 'WHITE' : 'BLACK';
  if (game === 'reversi') return first ? 'DARK' : 'LIGHT';
  if (game === 'tictactoe') return first ? 'X' : 'O';
  return first ? 'COBALT' : 'INK';
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
  // the game takes the whole screen (over the header and tab bar), as a game should on a phone
  turn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, backgroundColor: '#0d0f14', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  turnBtn: { marginTop: 14, borderWidth: 1, borderColor: '#00e5ff', paddingHorizontal: 16, paddingVertical: 11 },
  turnBtnText: { fontSize: 11, letterSpacing: 1.8, color: '#00e5ff' },
  turnBig: { fontSize: 54, color: '#00e5ff' },
  turnText: { fontSize: 16, color: '#00e5ff', letterSpacing: 2, textAlign: 'center' },
  worldWrap: Platform.OS === 'web'
    ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: '#0d0f14' } as unknown as ViewStyle)
    : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: '#0d0f14' },
  worldLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  worldCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#24316B', padding: 22, borderRadius: 24, borderLeftWidth: 6, borderLeftColor: '#E2A32B' }, // Adire indigo, a sunset edge
  worldEyebrow: { fontSize: 10.5, letterSpacing: 1.6, color: '#E2A32B' },
  worldName: { fontSize: 30, lineHeight: 32, color: '#FFFAF2' },
  worldBlurb: { fontSize: 13, lineHeight: 19, color: '#EEDFC8' },
  worldGo: { fontSize: 13, letterSpacing: 1, color: '#E2A32B' },
  card: { width: '100%', borderWidth: 1, borderColor: colors.greenBorderDim, padding: 14, gap: 6, backgroundColor: '#FFFAF2', borderRadius: 16 },
  cardWide: { width: '32%', minWidth: 260, flexGrow: 1 },
  cardSoon: { opacity: 0.55 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 26, color: colors.mint },
  play_: { fontSize: 11, letterSpacing: 1.5, color: colors.signal },
  soon: { fontSize: 9.5, letterSpacing: 1.8, color: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 6, paddingVertical: 1 },
  cardStat: { fontSize: 11, color: colors.mint, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  chipText: { fontSize: 10, letterSpacing: 1.6, color: colors.greenDim },
  chipTextOn: { color: colors.onSignal },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.greenBorderDim },
  boardRowMe: { backgroundColor: colors.signalSoft },
  rank: { width: 22, fontSize: 12, color: colors.greenDim },
  who: { flex: 1, fontSize: 13, color: colors.mint },
  record: { fontSize: 11, color: colors.greenDim },
  score: { width: 52, textAlign: 'right', fontSize: 14, color: colors.signal },
  roomHead: { gap: 8 },
  back: { fontSize: 11, letterSpacing: 2, color: colors.greenDim },
  roomTitle: { fontSize: 36, lineHeight: 38, color: colors.mint },
  play: { gap: 18 },
  playWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  side: { gap: 14, flexShrink: 1 },
  empty: { borderWidth: 1, borderColor: colors.greenBorderDim, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FAF3E8', maxWidth: '100%', padding: 16 },
  emptyTitle: { fontSize: 36, color: colors.mint },
  speech: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderLeftWidth: 2, borderLeftColor: colors.signal, paddingLeft: 12, paddingVertical: 4 },
  speechText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.mint },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.greenBorderDim, marginTop: 6 },
  liveDotBusy: { backgroundColor: colors.signal },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { fontSize: 9.5, letterSpacing: 1.6, color: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorderDim, paddingHorizontal: 7, paddingVertical: 2 },
  tagOn: { color: colors.onSignal, backgroundColor: colors.signal, borderColor: colors.signal },
  resultTitle: { fontSize: 34, color: colors.signal },
  resultDelta: { fontSize: 12, color: colors.mint },
  moves: { maxHeight: 180, borderWidth: 1, borderColor: colors.greenBorderDim, backgroundColor: colors.codeBg },
  moveText: { fontSize: 12, color: colors.mint },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderWidth: 1, borderColor: colors.greenBorder, paddingVertical: 11, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.signal, borderColor: colors.signal },
  btnText: { fontSize: 11, letterSpacing: 1.8, color: colors.mint },
  btnTextPrimary: { color: colors.onSignal },
  smallBtn: { backgroundColor: colors.signal, paddingHorizontal: 12, paddingVertical: 7 },
  lobbyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.greenBorderDim },
  pressed: { opacity: 0.7 },
  error: { fontSize: 12, color: colors.danger },
});
