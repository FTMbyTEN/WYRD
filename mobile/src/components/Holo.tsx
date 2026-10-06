import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Display, Mono } from './ui';
import { colors } from '../theme';

/** Shared sci-fi holographic-projection language: a thin beam rising into a glass panel, lit from
 *  underneath — used for every "readout" across the app (WYRD tab's
 *  brain-orbiting stats, YOU's identity/facts, FEED's vocabulary) instead of plain bordered boxes.
 *  `glow` (0..1) drives border/shadow/light intensity — pass a real percentage where one exists
 *  (curiosity, digest) so brightness itself carries information, or a fixed value otherwise. */
export function HoloFrame({
  children, glow = 0.45, style, beam = true,
}: {
  children: React.ReactNode; glow?: number; style?: StyleProp<ViewStyle>; beam?: boolean;
}) {
  const g = Math.max(0.15, Math.min(1, glow));
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      {beam && (
        <>
          <View style={{ width: 1, height: 16, backgroundColor: 'rgba(42,31,23,0.27)' }} />
          <View style={{
            width: 5, height: 5, borderRadius: 3, marginBottom: -2, backgroundColor: colors.green,
            shadowColor: colors.green, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
          }} />
        </>
      )}
      <View style={{
        width: '100%', marginTop: beam ? 2 : 0, borderRadius: 6, borderWidth: 1,
        backgroundColor: 'rgba(255,250,242,0.38)', borderColor: `rgba(42,31,23,${g})`,
        shadowColor: colors.green, shadowOpacity: g, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
      }}>
        {children}
      </View>
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
          fontSize: big ? 30 : 18, marginTop: 3, textShadowColor: colors.glow, textShadowRadius: 10 + g * 14,
        }}>
          {value}
        </Display>
        {pct !== undefined && (
          <View style={{ marginTop: 6, height: 4, borderRadius: 2, backgroundColor: 'rgba(42,31,23,0.15)', overflow: 'hidden' }}>
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
      backgroundColor: 'rgba(255,250,242,0.38)', shadowColor: color, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    }}>
      <Mono style={{ fontSize: 9.5, letterSpacing: 1, color: tone === 'danger' ? colors.danger : colors.greenDim }}>{label}</Mono>
    </Pressable>
  );
}
