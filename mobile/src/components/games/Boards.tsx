import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Mono } from '../ui';
import { colors } from '../../theme';

/** A board game position as the server sends it: cells -1 (empty), 0 (first player) or 1 (second),
 *  and whose turn it is. The server checks every move; the boards only offer the plausible ones. */
export type BoardState = { b: number[]; t: number };
export const parseBoard = (state: string): BoardState => JSON.parse(state) as BoardState;

type BoardProps = { state: string; mySide: 0 | 1; size: number; disabled?: boolean; last?: string | null; onMove: (move: string) => void };

// ---- Tic-tac-toe -------------------------------------------------------------------------------

export function TicTacToeBoard({ state, mySide, size, disabled, last, onMove }: BoardProps) {
  const s = useMemo(() => parseBoard(state), [state]);
  const myTurn = s.t === mySide && !disabled;
  const cell = size / 3;
  return (
    <View style={[styles.grid3, { width: size, height: size }]}>
      {s.b.map((v, i) => (
        <Pressable
          key={i}
          disabled={!myTurn || v !== -1}
          onPress={() => onMove(String(i))}
          accessibilityLabel={`square ${i + 1}${v === -1 ? '' : v === 0 ? ' X' : ' O'}`}
          style={[styles.ttt, { width: cell, height: cell }, last === String(i) && styles.lastCell]}
        >
          {v === 0 ? <Mono style={[styles.mark, { fontSize: cell * 0.6, color: colors.signal }]}>X</Mono> : null}
          {v === 1 ? <Mono style={[styles.mark, { fontSize: cell * 0.6, color: colors.ink }]}>O</Mono> : null}
        </Pressable>
      ))}
    </View>
  );
}

// ---- Connect Four ------------------------------------------------------------------------------

export function ConnectFourBoard({ state, mySide, size, disabled, last, onMove }: BoardProps) {
  const s = useMemo(() => parseBoard(state), [state]);
  const myTurn = s.t === mySide && !disabled;
  const cell = size / 7;
  return (
    <View style={[styles.c4, { width: size, height: cell * 6 }]}>
      {Array.from({ length: 7 }, (_, c) => (
        <Pressable
          key={c}
          disabled={!myTurn || s.b[c] !== -1}
          onPress={() => onMove(String(c))}
          accessibilityLabel={`column ${c + 1}`}
          style={(state) => [{ width: cell, height: cell * 6 }, (state as { hovered?: boolean }).hovered && myTurn && styles.colHover]}
        >
          {Array.from({ length: 6 }, (_, r) => {
            const v = s.b[r * 7 + c];
            return (
              <View key={r} style={[styles.hole, { width: cell, height: cell }]}>
                <View
                  style={[
                    styles.disc,
                    { width: cell * 0.78, height: cell * 0.78, borderRadius: cell * 0.39 },
                    v === 0 && { backgroundColor: colors.signal, borderColor: colors.signal },
                    v === 1 && { backgroundColor: colors.ink, borderColor: colors.ink },
                  ]}
                />
              </View>
            );
          })}
          {last === String(c) ? <View style={styles.lastMark} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

// ---- Reversi -----------------------------------------------------------------------------------

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
/** Squares where [t] can play (each must flip at least one disc). */
export function reversiMoves(b: number[], t: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 64; i++) {
    if (b[i] !== -1) continue;
    const r0 = Math.floor(i / 8), c0 = i % 8;
    for (const [dr, dc] of DIRS) {
      let r = r0 + dr, c = c0 + dc, n = 0;
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === 1 - t) { r += dr; c += dc; n++; }
      if (n > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === t) { out.add(i); break; }
    }
  }
  return out;
}

export function ReversiBoard({ state, mySide, size, disabled, last, onMove }: BoardProps) {
  const s = useMemo(() => parseBoard(state), [state]);
  const myTurn = s.t === mySide && !disabled;
  const moves = useMemo(() => (myTurn ? reversiMoves(s.b, mySide) : new Set<number>()), [s, myTurn, mySide]);
  const cell = size / 8;
  return (
    <View style={[styles.rev, { width: size, height: size }]}>
      {s.b.map((v, i) => (
        <Pressable
          key={i}
          disabled={!moves.has(i)}
          onPress={() => onMove(String(i))}
          accessibilityLabel={`square ${i}`}
          style={[styles.revCell, { width: cell, height: cell }, last === String(i) && styles.lastCell]}
        >
          {v !== -1 ? (
            <View style={[styles.revDisc, { width: cell * 0.8, height: cell * 0.8, borderRadius: cell * 0.4 }, v === 0 ? styles.dark : styles.light]} />
          ) : moves.has(i) ? (
            <View style={{ width: cell * 0.22, height: cell * 0.22, borderRadius: cell * 0.11, backgroundColor: colors.signal, opacity: 0.8 }} />
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Disc counts for a Reversi position: [first player, second]. */
export function reversiCount(state: string): [number, number] {
  const b = parseBoard(state).b;
  return [b.filter((v) => v === 0).length, b.filter((v) => v === 1).length];
}

const styles = StyleSheet.create({
  grid3: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.mint },
  ttt: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.greenBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  mark: { fontWeight: '700' },
  lastCell: { backgroundColor: colors.signalSoft },
  c4: { flexDirection: 'row', backgroundColor: '#eef0f5', borderWidth: 1, borderColor: colors.mint, overflow: 'hidden' },
  colHover: { backgroundColor: colors.signalSoft },
  hole: { alignItems: 'center', justifyContent: 'center' },
  disc: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.greenBorderDim },
  lastMark: { position: 'absolute', top: 2, left: '40%', width: '20%', height: 3, backgroundColor: colors.signal },
  rev: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.mint, backgroundColor: '#e9ebf1' },
  revCell: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#c9cdd8', alignItems: 'center', justifyContent: 'center' },
  revDisc: { borderWidth: 1 },
  dark: { backgroundColor: colors.ink, borderColor: colors.ink },
  light: { backgroundColor: '#fff', borderColor: colors.ink },
});
