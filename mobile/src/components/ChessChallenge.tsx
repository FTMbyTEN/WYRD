import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Display, Mono } from './ui';
import { colors, fonts, isDark } from '../theme';
import { api } from '../api/client';
import { saveRoom } from '../util/gameRoom';
import type { GameMatch } from '../api/types';

/** WYRD's open challenge on the home screen: chess at full strength, no easy mode. One tap starts
 *  the game (or carries on the one already on the board) and opens the board in Games. */
export function ChessChallenge({ onPlay }: { onPlay: () => void }) {
  const [active, setActive] = useState<GameMatch | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.gameActive('chess').then((m) => { if (live) setActive(m); }).catch(() => {});
    api.gameRatings().then((rs) => {
      const r = rs.find((x) => x.game === 'chess');
      if (live && r) setRating(Math.round(r.rating));
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  // the king breathes: a slow glow, so the card reads as a live invitation
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const resume = !!active && active.status === 'active';
  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.gameWyrdChallenge();
      saveRoom({ game: 'chess', mode: 'wyrd' });
      onPlay();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={accept}
      disabled={busy}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.card, (pressed || hovered) && styles.cardOn, busy && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={resume ? 'Resume your chess game against WYRD' : 'Accept WYRD\'s chess challenge, full strength'}
    >
      <View style={styles.kingWrap}>
        <Animated.View style={[styles.kingGlow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }] }]} />
        <Text style={styles.king}>♚</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Mono style={styles.eyebrow}>{resume ? 'YOUR GAME IS ON · WYRD IS WAITING' : 'OPEN CHALLENGE · FROM WYRD'}</Mono>
        <Display style={styles.title}>{resume ? 'Finish what you started.' : 'Beat me at chess.'}</Display>
        <Mono style={styles.sub} numberOfLines={2}>
          {error ?? `Full strength. No easy mode.${rating != null ? ` You: ${rating} · me: 1900.` : ''}`}
        </Mono>
      </View>
      <View style={styles.go}>
        <Mono style={styles.goText}>{busy ? '…' : resume ? 'RESUME →' : 'ACCEPT ♟'}</Mono>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: isDark ? '#221B2E' : '#2A1F17', borderWidth: 1, borderColor: isDark ? 'rgba(199,146,234,0.35)' : '#2A1F17',
  },
  cardOn: { backgroundColor: isDark ? '#2A2138' : '#3A2C21' },
  kingWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  kingGlow: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: colors.signal },
  king: { fontSize: 30, lineHeight: 34, color: '#FFF6EA', fontFamily: '"Segoe UI Symbol", "DejaVu Sans", "Noto Sans Symbols 2", "Apple Symbols", serif' },
  eyebrow: { fontSize: 8.5, letterSpacing: 1.8, color: '#E8A88A' },
  title: { fontSize: 18, lineHeight: 21, color: '#FFF6EA', fontFamily: fonts.displayBold, marginTop: 2 },
  sub: { fontSize: 11.5, color: '#CDBBA6', marginTop: 2 },
  go: { backgroundColor: colors.signal, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  goText: { fontSize: 10.5, letterSpacing: 1.2, color: colors.onSignal },
});
