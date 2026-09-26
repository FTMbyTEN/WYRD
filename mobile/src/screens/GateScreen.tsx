import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { VortexCanvas, type VortexHandle } from '../components/VortexCanvas';
import { FaceMark } from '../components/FaceMark';
import { AuthPanel } from '../components/AuthPanel';
import { ScreenEffects } from '../components/ScreenEffects';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import { useAuth } from '../api/AuthContext';


// A single frame of a glitch burst: an instant (not tweened) cut to `o` opacity, `dx` horizontal
// tear in pixels, held for `hold` ms before the next cut. Real glitches snap between states —
// interpolating between them with easing is what makes an animation read as a smooth fade
// instead, which is the thing to avoid here.
type GlitchFrame = { o: number; dx: number; hold: number };

const GLITCH_IN: GlitchFrame[] = [
  { o: 0.6, dx: -6, hold: 30 },
  { o: 0, dx: 4, hold: 60 },
  { o: 0.8, dx: -3, hold: 25 },
  { o: 0.1, dx: 0, hold: 90 },
  { o: 1, dx: 5, hold: 20 },
  { o: 0.3, dx: -4, hold: 40 },
  { o: 1, dx: 0, hold: 0 },
];

const GLITCH_OUT: GlitchFrame[] = [
  { o: 0.4, dx: 5, hold: 25 },
  { o: 1, dx: -5, hold: 20 },
  { o: 0.1, dx: 3, hold: 60 },
  { o: 0.7, dx: 0, hold: 30 },
  { o: 0, dx: 0, hold: 0 },
];

/** Wraps the identity mark in a real glitch-in / hold-6s / glitch-out loop -- instant snap-cuts
 *  between opacity/position states (not eased tweens) so it actually reads as signal
 *  instability, not a fade. `useNativeDriver: false` throughout: Animated's native driver isn't
 *  reliably supported on the web target (Expo web / react-native-web), where it can silently
 *  stop a loop dead after one pass instead of erroring. */
function GlitchFace({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    const playBurst = (frames: GlitchFrame[]) =>
      new Promise<void>((resolve) => {
        Animated.sequence(
          frames.flatMap((f) => [
            Animated.parallel([
              Animated.timing(opacity, { toValue: f.o, duration: 0, useNativeDriver: false }),
              Animated.timing(translateX, { toValue: f.dx, duration: 0, useNativeDriver: false }),
            ]),
            Animated.delay(f.hold),
          ]),
        ).start(() => resolve());
      });

    (async function playOnce() {
      await playBurst(GLITCH_IN);
      await new Promise((r) => setTimeout(r, 6000));
      if (cancelled) return;
      await playBurst(GLITCH_OUT);
      // Stays glitched out -- no repeat.
    })();

    return () => {
      cancelled = true;
    };
  }, [opacity, translateX]);

  return (
    <Animated.View style={{ width: '100%', height: '100%', opacity, transform: [{ translateX }] }}>
      {children}
    </Animated.View>
  );
}

/** A colorless shockwave played once per [triggerKey] increment, behind the WYRD wordmark --
 *  soft, blurred, achromatic haloes (no hue) expanding and thinning out, meant to read like
 *  displaced air/a pressure wave rather than a lit-up neon ring. Several overlapping soft-edged
 *  layers at staggered delays give the expansion an uneven, fluid quality instead of a single
 *  clean circle. */
function QuantumBlast({ triggerKey }: { triggerKey: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (triggerKey === 0) return; // don't play on initial mount
    setActive(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => {
      setActive(false);
    });
  }, [triggerKey, progress]);

  if (!active) return null;

  const halo = (maxScale: number, delay: number, peakOpacity: number, size: number) => {
    const p = progress.interpolate({ inputRange: [0, Math.min(0.9, delay), 1], outputRange: [0, 0, 1] });
    return (
      <Animated.View
        style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2,
          backgroundColor: 'rgba(0,0,0,0.5)',
          opacity: p.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, peakOpacity, 0] }),
          transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.2, maxScale] }) }],
        }}
      />
    );
  };

  return (
    <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
      {halo(4.6, 0, 0.05, 160)}
      {halo(3.4, 0.08, 0.08, 120)}
      {halo(2.4, 0.05, 0.12, 90)}
      {halo(1.6, 0.15, 0.16, 60)}
    </View>
  );
}

/** Port of the `locked4` vortex gate overlay: closed (wordmark + ENTER) until tapped, then the
 *  auth panel slides up. Wired to Serverpod's email+password auth (see serverpodAuth.ts) --
 *  login is one step, registration is three (email -> emailed code -> password), unlike the
 *  old Node backend's single-step username+password register. */
export function GateScreen() {
  const { width, height } = useWindowDimensions();
  const vortexRef = useRef<VortexHandle>(null);
  const [shape, setShape] = useState('');
  const [open, setOpen] = useState(false);
  const [blastKey, setBlastKey] = useState(0);
  const { resetToLogin } = useAuth();

  // On web, some browsers treat Escape as a native "cancel" for whatever's focused (e.g. an
  // in-progress autofill), which can end up closing this panel as a side effect even though
  // nothing in our own code listens for it. Swallow it at the document level so the panel's
  // open/closed state is only ever driven by our own handlers.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) { setOpen(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [open]);

  const enter = () => {
    vortexRef.current?.burst();
    vortexRef.current?.setIntensity(1);
    setBlastKey((k) => k + 1);
    // Let the blast actually read before the panel covers it -- opening instantly made the
    // effect invisible in practice.
    setTimeout(() => {
      vortexRef.current?.setIntensity(0);
      setOpen(true);
    }, 380);
  };

  return (
    <View style={{ flex: 1, width, height, backgroundColor: '#ffffff' }}>
      <VortexCanvas ref={vortexRef} onShapeChange={setShape} style={StyleSheet.absoluteFill} />
      <ScreenEffects />

      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!open && (
          <View style={styles.closedWrap}>
            <View style={{ width: 60, height: 60 }}>
              <GlitchFace>
                <FaceMark mode="scan" />
              </GlitchFace>
            </View>
            <Pressable onPress={enter} style={{ alignItems: 'center', justifyContent: 'center' }}>
              {({ pressed }) => (
                <>
                  <QuantumBlast triggerKey={blastKey} />
                  <Display style={[styles.wordmark, pressed && { textShadowRadius: 26 }]}>WYRD</Display>
                </>
              )}
            </Pressable>
          </View>
        )}
        <Mono style={styles.imagining}>WYRD is imagining: {shape}</Mono>

        {open && (
          <View style={styles.panelWrap}>
            <AuthPanel
              onClose={() => { resetToLogin(); setOpen(false); }}
              onActivity={() => vortexRef.current?.burst()}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  // the auth card sits over the vortex, centred, with room on every side on any screen size
  panelWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 18 },
  closedWrap: { alignItems: 'center', gap: 18 },
  wordmark: { fontSize: 52, letterSpacing: 9, textShadowColor: colors.glow, textShadowRadius: 14 },
  imagining: { minHeight: 16, fontSize: 10, letterSpacing: 1, color: colors.greenDim, textAlign: 'center', marginTop: 16 },
  authPanel: {
    position: 'absolute', alignSelf: 'center', bottom: 34, width: '86%', maxWidth: 320,
    backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: colors.greenDim, borderRadius: 6,
    padding: 14,
  },
  authWordmark: { fontSize: 30, letterSpacing: 6, textAlign: 'center', textShadowColor: colors.glow, textShadowRadius: 10 },
  authSub: { marginTop: 4, textAlign: 'center', fontSize: 8, letterSpacing: 0.5, color: colors.greenDim },
  tabRow: { flexDirection: 'row', gap: 6, marginVertical: 10 },
  tabBtn: { flex: 1, borderWidth: 1, borderRadius: 2, paddingVertical: 6, alignItems: 'center' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 7, color: colors.green, fontFamily: 'ShareTechMono_400Regular', fontSize: 11.5,
  },
  errorText: { color: colors.danger, fontSize: 9.5, marginTop: 6, textAlign: 'center' },
  authBtn: {
    marginTop: 8, borderWidth: 1, borderColor: colors.green, borderRadius: 2,
    paddingVertical: 10, alignItems: 'center',
  },
  hint: { marginTop: 7, textAlign: 'center', fontSize: 8.5, color: colors.greenDim, opacity: 0.7 },
});
