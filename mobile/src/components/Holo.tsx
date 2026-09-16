import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Display, Mono } from './ui';
import { colors } from '../theme';

/** One soft, wavering tongue of ethereal flame — three fully-round, overlapping blobs (never a
 *  hard rectangular edge) tapering from a wide base to a soft point, quietly breathing in size,
 *  opacity, and a few degrees of sway on its own independent, never-repeating-in-sync loop. */
function Flame({ deg, delayMs, size, glow }: { deg: number; delayMs: number; size: number; glow: number }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1400 + delayMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1600 + delayMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const start = setTimeout(() => loop.start(), delayMs);
    return () => { clearTimeout(start); loop.stop(); };
  }, [t, delayMs]);

  const sway = t.interpolate({ inputRange: [0, 1], outputRange: [`${deg - 4}deg`, `${deg + 4}deg`] });
  const scaleY = t.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.15] });
  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [glow * 0.55, glow * 0.95] });

  return (
    <Animated.View
      style={{
        position: 'absolute', bottom: 0, alignItems: 'center',
        transform: [{ rotate: sway }, { scaleY }],
        transformOrigin: 'bottom',
        opacity,
      }}
    >
      <View style={{
        width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, marginBottom: -size * 0.12,
        backgroundColor: colors.mint, shadowColor: colors.green, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
      }} />
      <View style={{
        width: size * 0.65, height: size * 0.65, borderRadius: size * 0.33, marginBottom: -size * 0.2,
        backgroundColor: colors.green, shadowColor: colors.green, shadowOpacity: 1, shadowRadius: 9, shadowOffset: { width: 0, height: 0 },
      }} />
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: colors.green, shadowColor: colors.green, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
      }} />
    </Animated.View>
  );
}

/** A soft, ethereal light burning up from the ground under a panel — like a low, quiet flame, not
 *  a bar or a rigid beam. Three flame tongues, each built from overlapping circles only (no
 *  straight edges anywhere) and flickering on its own independent loop, sitting over one soft
 *  round bed of light at the very base. Every shape is round; the "burn" comes entirely from each
 *  flame's own untied breathing animation, so the whole thing never moves as one rigid unit. */
export function GroundLight({ glow = 0.5, width = 92, height = 46 }: { glow?: number; width?: number; height?: number }) {
  const g = Math.max(0.15, Math.min(1, glow));
  const flames = [
    { deg: -14, delayMs: 120, size: 15 },
    { deg: 0, delayMs: 380, size: 20 },
    { deg: 13, delayMs: 640, size: 14 },
  ];
  return (
    <View style={{ width, height, alignItems: 'center' }}>
      <View style={{
        position: 'absolute', bottom: -6, width: 22, height: 22, borderRadius: 11,
        backgroundColor: colors.green, opacity: g * 0.5, transform: [{ scaleX: 1.7 }],
        shadowColor: colors.green, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
      }} />
      {flames.map((f) => <Flame key={f.deg} {...f} glow={g} />)}
    </View>
  );
}

/** Shared sci-fi holographic-projection language: a thin beam rising into a glass panel, lit from
 *  underneath by a soft ground light — used for every "readout" across the app (WYRD tab's
 *  brain-orbiting stats, YOU's identity/facts, FEED's vocabulary) instead of plain bordered boxes.
 *  `glow` (0..1) drives border/shadow/light intensity — pass a real percentage where one exists
 *  (curiosity, digest) so brightness itself carries information, or a fixed value otherwise. */
export function HoloFrame({
  children, glow = 0.45, style, beam = true, groundLight = true,
}: {
  children: React.ReactNode; glow?: number; style?: StyleProp<ViewStyle>; beam?: boolean; groundLight?: boolean;
}) {
  const g = Math.max(0.15, Math.min(1, glow));
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      {beam && (
        <>
          <View style={{ width: 1, height: 16, backgroundColor: 'rgba(0,255,65,0.45)' }} />
          <View style={{
            width: 5, height: 5, borderRadius: 3, marginBottom: -2, backgroundColor: colors.green,
            shadowColor: colors.green, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
          }} />
        </>
      )}
      <View style={{
        width: '100%', marginTop: beam ? 2 : 0, borderRadius: 6, borderWidth: 1,
        backgroundColor: 'rgba(0,15,4,0.38)', borderColor: `rgba(0,255,65,${g})`,
        shadowColor: colors.green, shadowOpacity: g, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
      }}>
        {children}
      </View>
      {groundLight && <GroundLight glow={g} />}
    </View>
  );
}

/** A compact labeled readout inside a HoloFrame — label on top, value, optional meter. */
export function HoloReadout({ label, value, pct, glow, style, big }: {
  label: string; value: string; pct?: number; glow?: number; style?: StyleProp<ViewStyle>; big?: boolean;
}) {
  const g = glow ?? (pct !== undefined ? 0.25 + Math.min(1, Math.max(0, pct / 100)) * 0.55 : 0.45);
  return (
    <HoloFrame glow={g} style={style}>
      <View style={{ padding: big ? 14 : 9, alignItems: big ? 'center' : undefined }}>
        <Mono style={{ fontSize: big ? 9 : 8, letterSpacing: 1.5, color: colors.greenDim }}>{label}</Mono>
        <Display style={{
          fontSize: big ? 30 : 18, marginTop: 3, textShadowColor: colors.green, textShadowRadius: 10 + g * 14,
        }}>
          {value}
        </Display>
        {pct !== undefined && (
          <View style={{ marginTop: 6, height: 4, borderRadius: 2, backgroundColor: 'rgba(10,156,47,0.25)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.green, opacity: 0.6 + g * 0.4 }} />
          </View>
        )}
      </View>
    </HoloFrame>
  );
}

/** A holo-styled pressable — same glass/glow language as HoloFrame, no beam (it's a control, not
 *  a projection). `tone` swaps the glow color for destructive actions (logout). */
export function HoloButton({ label, onPress, tone = 'green' }: { label: string; onPress: () => void; tone?: 'green' | 'danger' }) {
  const color = tone === 'danger' ? colors.danger : colors.green;
  return (
    <Pressable onPress={onPress} style={{
      flex: 1, borderWidth: 1, borderColor: `${color}99`, borderRadius: 6, paddingVertical: 11, alignItems: 'center',
      backgroundColor: 'rgba(0,15,4,0.38)', shadowColor: color, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    }}>
      <Mono style={{ fontSize: 9.5, letterSpacing: 1, color: tone === 'danger' ? colors.danger : colors.greenDim }}>{label}</Mono>
    </Pressable>
  );
}
