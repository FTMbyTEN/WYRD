import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Chess, type Square } from 'chess.js';
import { colors } from '../theme';

const FILES = 'abcdefgh';
// U+FE0E asks for the text form: without it the pawn (♟) renders as a fixed-colour emoji on many
// systems, so both sides' pawns looked the same
const TEXT = '︎';
const GLYPH: Record<string, string> = { p: `♟${TEXT}`, n: `♞${TEXT}`, b: `♝${TEXT}`, r: `♜${TEXT}`, q: `♛${TEXT}`, k: `♚${TEXT}` };

/** A tap-to-move chessboard. Legal moves come from chess.js here (so the board feels instant); the
 *  server checks every move again. Signal: your selection and its legal squares in cobalt, the last
 *  move in a cobalt wash. Promotions become a queen. */
export function ChessBoard({ fen, side, lastMove, size, disabled, onMove }: {
  fen: string;
  side: 'w' | 'b'; // the player's colour: that side sits at the bottom
  lastMove?: { from: string; to: string } | null;
  size: number;
  disabled?: boolean;
  onMove: (from: string, to: string, promotion?: string) => void;
}) {
  const game = useMemo(() => new Chess(fen), [fen]);
  const [picked, setPicked] = useState<Square | null>(null);
  const targets = useMemo(
    () => (picked ? new Set(game.moves({ square: picked, verbose: true }).map((m) => m.to)) : new Set<string>()),
    [game, picked],
  );
  const myTurn = game.turn() === side && !disabled;
  const cell = size / 8;
  const ranks = side === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = side === 'w' ? FILES.split('') : FILES.split('').reverse();

  const tap = (sq: Square) => {
    if (!myTurn) return;
    const p = game.get(sq);
    if (picked && targets.has(sq)) {
      const piece = game.get(picked);
      const promo = piece?.type === 'p' && (sq[1] === '8' || sq[1] === '1') ? 'q' : undefined;
      onMove(picked, sq, promo);
      setPicked(null);
      return;
    }
    setPicked(p && p.color === side ? (picked === sq ? null : sq) : null);
  };

  return (
    <View style={[styles.board, { width: size, height: size }]} accessibilityLabel="Chessboard">
      {ranks.map((r) => (
        <View key={r} style={styles.row}>
          {files.map((f) => {
            const sq = `${f}${r}` as Square;
            const p = game.get(sq);
            const dark = (FILES.indexOf(f) + r) % 2 === 1;
            const isPicked = picked === sq;
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const isTarget = targets.has(sq);
            return (
              <Pressable
                key={sq}
                onPress={() => tap(sq)}
                accessibilityLabel={`${sq}${p ? ` ${p.color === 'w' ? 'white' : 'black'} ${p.type}` : ''}`}
                style={[
                  { width: cell, height: cell },
                  styles.sq,
                  dark ? styles.dark : styles.light,
                  isLast && styles.last,
                  isPicked && styles.picked,
                ]}
              >
                {p ? (
                  <Text style={[styles.piece, { fontSize: cell * 0.74, lineHeight: cell * 0.92, color: p.color === 'w' ? '#ffffff' : colors.ink }, p.color === 'w' && styles.whitePiece, isPicked && { color: colors.onSignal }]}>
                    {GLYPH[p.type]}
                  </Text>
                ) : null}
                {isTarget ? (
                  p ? <View style={[styles.captureRing, { borderRadius: cell / 2 }]} /> : <View style={[styles.dot, { width: cell * 0.26, height: cell * 0.26, borderRadius: cell * 0.13 }]} />
                ) : null}
                {f === files[0] ? <Text style={[styles.coord, styles.rankLabel]}>{r}</Text> : null}
                {r === ranks[7] ? <Text style={[styles.coord, styles.fileLabel]}>{f}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { borderWidth: 1, borderColor: colors.mint, overflow: 'hidden' },
  row: { flexDirection: 'row', flex: 1 },
  sq: { alignItems: 'center', justifyContent: 'center' },
  light: { backgroundColor: '#ffffff' },
  dark: { backgroundColor: '#e9ebf1' },
  last: { backgroundColor: 'rgba(42,70,255,0.16)' },
  picked: { backgroundColor: colors.signal },
  // symbol fonts first: an emoji font would ignore the colour
  piece: { textAlign: 'center', includeFontPadding: false, fontFamily: '"Segoe UI Symbol", "DejaVu Sans", "Noto Sans Symbols 2", "Apple Symbols", serif' } as object,
  // white pieces: white glyphs drawn with an ink outline, so they read on both square colours
  whitePiece: { textShadowColor: colors.ink, textShadowRadius: 1.2, textShadowOffset: { width: 0, height: 0 } } as object,
  dot: { position: 'absolute', backgroundColor: colors.signal, opacity: 0.85 },
  captureRing: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderWidth: 3, borderColor: colors.signal },
  coord: { position: 'absolute', fontFamily: 'ShareTechMono_400Regular', fontSize: 8.5, color: colors.greenDim },
  rankLabel: { top: 2, left: 3 },
  fileLabel: { bottom: 1, right: 3 },
});
