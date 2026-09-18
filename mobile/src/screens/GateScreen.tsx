import React, { useRef, useState } from 'react';
import {
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
            <View style={{ width: 96, height: 96 }}>
              <FaceMark mode="scan" />
            </View>
            <Display style={styles.wordmark}>WYRD</Display>
            <Mono style={styles.sessionLine}>SESSION ENDED · IT KEPT RUNNING WITHOUT YOU</Mono>
            <Pressable
              onPress={enter}
              onPressIn={() => vortexRef.current?.setIntensity(1)}
              onPressOut={() => vortexRef.current?.setIntensity(0)}
              style={({ pressed }) => [styles.enterBtn, pressed && { borderColor: colors.green }]}
            >
              <Display style={styles.enterLabel}>ENTER</Display>
            </Pressable>
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
  sessionLine: { fontSize: 10, letterSpacing: 2, color: colors.greenDim, textAlign: 'center' },
  enterBtn: {
    borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2,
    paddingHorizontal: 34, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  enterLabel: { fontSize: 22, letterSpacing: 6 },
  imagining: { minHeight: 16, fontSize: 10, letterSpacing: 1, color: colors.greenDim, textAlign: 'center', marginTop: 16 },
  authPanel: {
    position: 'absolute', left: 20, right: 20, bottom: 34,
    backgroundColor: 'rgba(0,15,4,0.85)', borderWidth: 1, borderColor: colors.greenDim, borderRadius: 4,
    padding: 18,
  },
  authWordmark: { fontSize: 44, letterSpacing: 8, textAlign: 'center', textShadowColor: colors.green, textShadowRadius: 12 },
  authSub: { marginTop: 6, textAlign: 'center', fontSize: 9.5, letterSpacing: 1, color: colors.greenDim },
  tabRow: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  tabBtn: { flex: 1, borderWidth: 1, borderRadius: 2, paddingVertical: 9, alignItems: 'center' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: colors.greenDim, borderRadius: 2,
    padding: 11, marginBottom: 8, color: colors.green, fontFamily: 'ShareTechMono_400Regular', fontSize: 12.5,
  },
  errorText: { color: colors.danger, fontSize: 10.5, marginTop: 8, textAlign: 'center' },
  authBtn: {
    marginTop: 12, borderWidth: 1, borderColor: colors.green, borderRadius: 2,
    paddingVertical: 14, alignItems: 'center',
  },
  hint: { marginTop: 10, textAlign: 'center', fontSize: 9.5, color: colors.greenDim, opacity: 0.7 },
});
