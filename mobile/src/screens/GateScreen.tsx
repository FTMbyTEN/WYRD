import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { VortexCanvas, type VortexHandle } from '../components/VortexCanvas';
import { FaceMark } from '../components/FaceMark';
import { ScreenEffects } from '../components/ScreenEffects';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import { useAuth } from '../api/AuthContext';
import { clockHHMM } from '../util/time';

type Tab = 'login' | 'register';

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

    (async function loop() {
      while (!cancelled) {
        await playBurst(GLITCH_IN);
        await new Promise((r) => setTimeout(r, 6000));
        if (cancelled) break;
        await playBurst(GLITCH_OUT);
        await new Promise((r) => setTimeout(r, 500));
      }
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

const MATRIX_CHARS = '01アイウエオカキクケコサシスセソタチツテト$#%&*+=<>';
function randomMatrixChar() {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

/** A row of small glyphs that re-randomize on an interval -- WYRD's own environment (the
 *  matrix-style character noise everywhere else in this screen) leaking into the button's
 *  edge instead of a plain solid line. Cycles faster and brighter while `active` (pressed/
 *  hovered), so the border visibly reacts instead of just sitting there. */
function MatrixEdge({ count, active }: { count: number; active: boolean }) {
  const [chars, setChars] = useState<string[]>(() => Array.from({ length: count }, randomMatrixChar));

  useEffect(() => {
    const id = setInterval(
      () => {
        setChars((prev) => prev.map((c) => (Math.random() < (active ? 0.55 : 0.12) ? randomMatrixChar() : c)));
      },
      active ? 55 : 180,
    );
    return () => clearInterval(id);
  }, [active]);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
      {chars.map((c, i) => (
        <Mono key={i} style={{ fontSize: 7, lineHeight: 8, color: active ? colors.green : colors.greenBorder, opacity: active ? 1 : 0.6 }}>
          {c}
        </Mono>
      ))}
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
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enterPressed, setEnterPressed] = useState(false);
  const { status, login, startRegister, verifyCode, finishRegister, resetToLogin, busy, error, clearError } = useAuth();

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
    setOpen(true);
  };

  const submit = async () => {
    vortexRef.current?.burst();
    if (tab === 'login') {
      if (!email.trim() || !password) return;
      const ok = await login(email.trim(), password);
      if (ok) setOpen(false);
      return;
    }
    if (status === 'awaitingVerification') {
      if (!code.trim()) return;
      await verifyCode(code.trim());
      return;
    }
    if (status === 'awaitingPassword') {
      if (!password) return;
      const ok = await finishRegister(password);
      if (ok) setOpen(false);
      return;
    }
    if (!email.trim()) return;
    await startRegister(email.trim());
  };

  const registerStepLabel = status === 'awaitingVerification' ? 'enter the code emailed to you' : status === 'awaitingPassword' ? 'choose a password' : 'designation (email)';

  return (
    <View style={{ flex: 1, width, height, backgroundColor: '#000' }}>
      <VortexCanvas ref={vortexRef} onShapeChange={setShape} style={StyleSheet.absoluteFill} />
      <ScreenEffects />

      <View style={styles.statusRow}>
        <Mono style={{ color: colors.mint, fontSize: 11 }}>{clockHHMM()}</Mono>
        <Mono style={{ color: colors.greenDim, fontSize: 11 }}>▮▮▮ LTE ▰</Mono>
      </View>

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
            <Display style={styles.wordmark}>WYRD</Display>
            <View style={styles.enterWrap}>
              <MatrixEdge count={9} active={enterPressed} />
              <Pressable
                onPress={enter}
                onPressIn={() => { setEnterPressed(true); vortexRef.current?.setIntensity(1); }}
                onPressOut={() => { setEnterPressed(false); vortexRef.current?.setIntensity(0); }}
                style={[styles.enterBtn, enterPressed && { borderColor: colors.green }]}
              >
                <Display style={styles.enterLabel}>ENTER</Display>
              </Pressable>
              <MatrixEdge count={9} active={enterPressed} />
            </View>
          </View>
        )}
        <Mono style={styles.imagining}>WYRD is imagining: {shape}</Mono>

        {open && (
          <View style={styles.authPanel}>
            <Display style={styles.authWordmark}>WYRD</Display>
            <Mono style={styles.authSub}>[ RESTRICTED NODE // AUTHENTICATION REQUIRED ]</Mono>

            <View style={styles.tabRow}>
              <Pressable
                onPress={() => { setTab('login'); resetToLogin(); }}
                style={[styles.tabBtn, { borderColor: tab === 'login' ? colors.green : colors.greenDim }]}
              >
                <Mono style={{ color: tab === 'login' ? colors.green : colors.greenDim, fontSize: 11, letterSpacing: 2 }}>LOGIN</Mono>
              </Pressable>
              <Pressable
                onPress={() => { setTab('register'); resetToLogin(); }}
                style={[styles.tabBtn, { borderColor: tab === 'register' ? colors.green : colors.greenDim }]}
              >
                <Mono style={{ color: tab === 'register' ? colors.green : colors.greenDim, fontSize: 11, letterSpacing: 2 }}>REGISTER</Mono>
              </Pressable>
            </View>

            {tab === 'login' && (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="designation (email)"
                  placeholderTextColor="#0a9c2f88"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="access key"
                  placeholderTextColor="#0a9c2f88"
                  secureTextEntry
                  style={[styles.input, { marginBottom: 0 }]}
                />
              </>
            )}

            {tab === 'register' && status !== 'awaitingVerification' && status !== 'awaitingPassword' && (
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={registerStepLabel}
                placeholderTextColor="#0a9c2f88"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={[styles.input, { marginBottom: 0 }]}
              />
            )}

            {tab === 'register' && status === 'awaitingVerification' && (
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder={registerStepLabel}
                placeholderTextColor="#0a9c2f88"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                style={[styles.input, { marginBottom: 0 }]}
              />
            )}

            {tab === 'register' && status === 'awaitingPassword' && (
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={registerStepLabel}
                placeholderTextColor="#0a9c2f88"
                secureTextEntry
                style={[styles.input, { marginBottom: 0 }]}
              />
            )}

            {!!error && <Mono style={styles.errorText}>{error}</Mono>}

            <Pressable onPress={submit} disabled={busy} style={styles.authBtn}>
              <Mono style={{ color: colors.green, fontSize: 12, letterSpacing: 2 }}>
                {busy ? 'CONNECTING…' : '> AUTHENTICATE'}
              </Mono>
            </Pressable>
            <Mono style={styles.hint}>
              {tab === 'register' && status === 'awaitingVerification'
                ? 'check your email for a one-time code'
                : 'each designation gets its own private dialogue thread'}
            </Mono>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  closedWrap: { alignItems: 'center', gap: 18 },
  wordmark: { fontSize: 52, letterSpacing: 9, textShadowColor: colors.green, textShadowRadius: 14 },
  enterWrap: { alignItems: 'stretch', width: 150, gap: 3 },
  enterBtn: {
    borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2,
    paddingHorizontal: 20, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center',
  },
  enterLabel: { fontSize: 16, letterSpacing: 4 },
  imagining: { minHeight: 16, fontSize: 10, letterSpacing: 1, color: colors.greenDim, textAlign: 'center', marginTop: 16 },
  authPanel: {
    position: 'absolute', alignSelf: 'center', bottom: 34, width: '86%', maxWidth: 320,
    backgroundColor: 'rgba(0,15,4,0.9)', borderWidth: 1, borderColor: colors.greenDim, borderRadius: 6,
    padding: 14,
  },
  authWordmark: { fontSize: 30, letterSpacing: 6, textAlign: 'center', textShadowColor: colors.green, textShadowRadius: 10 },
  authSub: { marginTop: 4, textAlign: 'center', fontSize: 8, letterSpacing: 0.5, color: colors.greenDim },
  tabRow: { flexDirection: 'row', gap: 6, marginVertical: 10 },
  tabBtn: { flex: 1, borderWidth: 1, borderRadius: 2, paddingVertical: 6, alignItems: 'center' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 7, color: colors.green, fontFamily: 'ShareTechMono_400Regular', fontSize: 11.5,
  },
  errorText: { color: colors.danger, fontSize: 9.5, marginTop: 6, textAlign: 'center' },
  authBtn: {
    marginTop: 8, borderWidth: 1, borderColor: colors.green, borderRadius: 2,
    paddingVertical: 10, alignItems: 'center',
  },
  hint: { marginTop: 7, textAlign: 'center', fontSize: 8.5, color: colors.greenDim, opacity: 0.7 },
});
