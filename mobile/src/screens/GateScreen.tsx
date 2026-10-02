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
import { AuthPanel } from '../components/AuthPanel';
import { ScreenEffects } from '../components/ScreenEffects';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import { Glyph } from '../components/glyph/Glyph';
import { useAuth } from '../api/AuthContext';
import { GlitchWord } from '../components/GlitchWord';
import { DustField } from '../components/DustField';
import { IntroVortex } from '../components/IntroVortex';

// the liquid-chrome intro (three.js) is loaded only when the intro plays; without WebGL 2, the 2D one
const IntroChrome = React.lazy(() => import('../components/IntroChrome').then((m) => ({ default: m.IntroChrome })));
const canWebGL2 = (() => { try { return typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
import { getSound, preloadVoice, setSound, sfx, startMusic, stopMusic, unlock, useSound, voice, type VoiceLine } from '../util/sound';
import Svg, { Path } from 'react-native-svg';

// each gate word, in WYRD's own voice
const GATE_VOICE: Record<string, VoiceLine> = {
  WYRD: 'gate-wyrd', 'WHAT COMES TO BE': 'gate-what-comes', FATE: 'gate-fate', WELCOME: 'gate-welcome',
};

// WYRD is Old English for fate -- "what comes to be"
const WORDS = ['WYRD', 'WHAT COMES TO BE', 'FATE', 'WELCOME'];
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
  const [open, setOpen] = useState(false);
  const [blastKey, setBlastKey] = useState(0);
  const { resetToLogin } = useAuth();
  const sound = useSound();
  const started = useRef(false);
  const spoken = useRef(new Set<string>());
  // The first time someone arrives, WYRD's awakening plays before the gate -- once, ever: it is marked
  // seen the moment it starts, so leaving halfway or reloading doesn't bring it back. Having just
  // heard it, the gate doesn't repeat its words.
  const [intro, setIntro] = useState(() => {
    if (Platform.OS !== 'web') return false;
    try {
      if (localStorage.getItem('wyrd.intro') === '1') return false;
      localStorage.setItem('wyrd.intro', '1');
      return true;
    } catch { return false; }
  });
  const heardIntro = useRef(false);
  // the intro's last moments: the gate's vortex starts turning underneath so the hand-off is seamless
  const [introEnding, setIntroEnding] = useState(false);
  const endIntro = () => {
    heardIntro.current = true;
    try { localStorage.setItem('wyrd.intro', '1'); } catch { /* fine */ }
    setIntro(false);
    setIntroEnding(false);
  };

  // Sound starts with the first touch (browsers allow nothing before it): the music fades in. It
  // all fades as they sign in.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const first = () => {
      unlock();
      if (!getSound().music) return;
      startMusic();
      if (started.current) return;
      started.current = true;
      preloadVoice(Object.values(GATE_VOICE));
    };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
    return () => {
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
      stopMusic(2.5, true);
    };
  }, []);

  // the word breaking up crackles; the first time each word appears, WYRD says it
  const onGlitch = (next: string) => {
    sfx('glitch');
    if (!started.current || heardIntro.current || intro || !getSound().music || spoken.current.has(next)) return;
    spoken.current.add(next);
    const line = GATE_VOICE[next];
    if (line) setTimeout(() => { void voice(line, { force: true }); }, 650);
  };

  const toggleSound = () => {
    const on = !(sound.music || sound.sfx);
    setSound({ music: on, sfx: on });
    if (on) { unlock(); startMusic(); }
  };

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
    unlock();
    sfx('gateEnter');
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
      <VortexCanvas ref={vortexRef} active={!intro || introEnding} style={StyleSheet.absoluteFill} />
      <DustField />
      <ScreenEffects />

      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!open && (
          <View style={styles.closedWrap}>
            <Pressable onPress={enter} style={{ alignItems: 'center', justifyContent: 'center' }}>
              {({ pressed }) => (
                <>
                  <QuantumBlast triggerKey={blastKey} />
                  <GlitchWord words={WORDS} fitChars={7} onGlitch={onGlitch} style={[styles.wordmark, pressed && { textShadowRadius: 26 }]} />
                </>
              )}
            </Pressable>
          </View>
        )}

        {open && (
          <View style={styles.panelWrap}>
            <AuthPanel
              onClose={() => { resetToLogin(); setOpen(false); }}
              onActivity={() => vortexRef.current?.burst()}
            />
          </View>
        )}
      </KeyboardAvoidingView>

      {intro && (canWebGL2
        ? <React.Suspense fallback={<View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} />}><IntroChrome onDone={endIntro} onEnding={() => { setIntroEnding(true); vortexRef.current?.goTo(0); }} /></React.Suspense>
        : <IntroVortex onDone={endIntro} />)}

      {Platform.OS === 'web' && (
        <Pressable onPress={toggleSound} hitSlop={10} style={styles.soundBtn} accessibilityLabel={sound.music || sound.sfx ? 'Sound off' : 'Sound on'}>
          <Glyph name={sound.music || sound.sfx ? "voice" : "voiceOff"} size={18} color={colors.green} active={sound.music || sound.sfx} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  soundBtn: { position: 'absolute', top: 18, right: 18, width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.greenBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  // the auth card sits over the vortex, centred, with room on every side on any screen size
  panelWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 18 },
  closedWrap: { alignItems: 'center', gap: 18 },
  wordmark: { fontSize: 52, letterSpacing: 9, textShadowColor: colors.glow, textShadowRadius: 14 },
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
