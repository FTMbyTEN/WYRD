import React, { useState } from 'react';
import { api } from '../api/client';
import { wyrdStream } from '../api/stream';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Display, Mono } from './ui';
import { FaceMark } from './FaceMark';
import { colors } from '../theme';
import { useAuth } from '../api/AuthContext';

type Mode = 'signin' | 'signup' | 'reset';

/**
 * Sign in, create an account, or reset a forgotten password -- one card over the gate vortex.
 * Sign-up and reset are both three steps (email -> emailed code -> password); a small step
 * indicator shows where you are. Enter submits from any field.
 */
export function AuthPanel({ onClose, onActivity }: { onClose: () => void; onActivity?: () => void }) {
  const auth = useAuth();
  const { status, busy, error, clearError, resetToLogin, resetStage } = auth;
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [callMe, setCallMe] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    resetToLogin();
    setCode('');
    setPassword('');
    setMode(m);
  };

  // which step of the current flow we're on
  const signupStep = status === 'awaitingPassword' ? 3 : status === 'awaitingVerification' ? 2 : 1;
  const resetStep = resetStage === 'password' ? 3 : resetStage === 'code' ? 2 : 1;
  const step = mode === 'signup' ? signupStep : mode === 'reset' ? resetStep : 0;
  const needsEmail = mode === 'signin' || step === 1;
  const needsCode = step === 2;
  const needsPassword = mode === 'signin' || step === 3;

  const heading =
    mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password';
  const blurb =
    mode === 'signin'
      ? 'Sign in to continue your private thread with WYRD.'
      : step === 1
        ? mode === 'signup'
          ? 'Enter your email and we’ll send you a one-time code.'
          : 'Enter your account email and we’ll send you a reset code.'
        : step === 2
          ? `Enter the code we sent to ${email.trim()}.`
          : mode === 'signup'
            ? 'Choose a password for your account.'
            : 'Choose a new password. You’ll be signed in right after.';
  const action =
    mode === 'signin'
      ? 'SIGN IN'
      : step === 1
        ? 'SEND CODE'
        : step === 2
          ? 'VERIFY CODE'
          : mode === 'signup'
            ? 'CREATE ACCOUNT'
            : 'SET NEW PASSWORD';

  const submit = async () => {
    if (busy) return;
    onActivity?.();
    const e = email.trim();
    if (mode === 'signin') {
      if (e && password) await auth.login(e, password);
    } else if (mode === 'signup') {
      if (step === 1 && e) await auth.startRegister(e);
      else if (step === 2 && code.trim()) await auth.verifyCode(code.trim());
      else if (step === 3 && password && callMe.trim()) {
        const name = callMe.trim();
        // signed in: tell WYRD what to call them (the session is live once this resolves)
        if (await auth.finishRegister(password)) api.setName(name).then((p) => wyrdStream.publish('profile', p)).catch(() => {});
      }
    } else {
      if (step === 1 && e) await auth.startReset(e);
      else if (step === 2 && code.trim()) await auth.verifyResetCode(code.trim());
      else if (step === 3 && password) await auth.finishReset(password);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.accent} />
      <View style={styles.topRow}>
        <View style={styles.brand}>
          <View style={styles.face}>
            <FaceMark mode="scan" />
          </View>
          <Display style={styles.wordmark}>WYRD</Display>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Mono style={styles.close}>×</Mono>
        </Pressable>
      </View>

      {mode !== 'reset' && (
        <View style={styles.switcher}>
          {(['signin', 'signup'] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable key={m} onPress={() => switchMode(m)} style={[styles.switchBtn, on && styles.switchOn]}>
                <Mono style={[styles.switchText, on && styles.switchTextOn]}>{m === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Mono>
              </Pressable>
            );
          })}
        </View>
      )}

      <Display style={styles.heading}>{heading}</Display>
      <Mono style={styles.blurb}>{blurb}</Mono>

      {step > 0 && (
        <View style={styles.steps}>
          {['EMAIL', 'CODE', 'PASSWORD'].map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const current = n === step;
            return (
              <View key={label} style={styles.step}>
                <View style={[styles.stepDot, (done || current) && styles.stepDotOn]}>
                  <Mono style={[styles.stepNum, (done || current) && styles.stepNumOn]}>{done ? '✓' : n}</Mono>
                </View>
                <Mono style={[styles.stepLabel, current && styles.stepLabelOn]}>{label}</Mono>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.fields}>
        {needsEmail && (
          <Field label="EMAIL">
            <TextInput
              value={email}
              onChangeText={(t) => { setEmail(t); if (error) clearError(); }}
              placeholder="you@example.com"
              placeholderTextColor={colors.greenBorder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              onSubmitEditing={submit}
              returnKeyType={mode === 'signin' ? 'next' : 'go'}
              onFocus={() => setFocus('email')}
              onBlur={() => setFocus(null)}
              style={[styles.input, focus === 'email' && styles.inputFocus]}
            />
          </Field>
        )}
        {needsCode && (
          <Mono style={styles.inboxHint}>Check your inbox for a 6-digit code. Not there after a minute? Look in Spam or Promotions, and mark it "not spam" so the next one lands properly.</Mono>
        )}
        {needsCode && (
          <Field label="CODE FROM YOUR EMAIL">
            <TextInput
              value={code}
              onChangeText={(t) => { setCode(t); if (error) clearError(); }}
              placeholder="123456"
              placeholderTextColor={colors.greenBorder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              onSubmitEditing={submit}
              onFocus={() => setFocus('code')}
              onBlur={() => setFocus(null)}
              style={[styles.input, styles.codeInput, focus === 'code' && styles.inputFocus]}
            />
          </Field>
        )}
        {mode === 'signup' && step === 3 && (
          <Field label="WHAT SHOULD WYRD CALL YOU?">
            <TextInput
              value={callMe}
              onChangeText={setCallMe}
              placeholder="your name, or a nickname"
              placeholderTextColor={colors.greenBorder}
              autoComplete="nickname"
              maxLength={40}
              returnKeyType="next"
              onFocus={() => setFocus('callMe')}
              onBlur={() => setFocus(null)}
              style={[styles.input, focus === 'callMe' && styles.inputFocus]}
            />
          </Field>
        )}
        {needsPassword && (
          <Field
            label={mode === 'signin' ? 'PASSWORD' : 'NEW PASSWORD'}
            right={
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Mono style={styles.show}>{showPassword ? 'HIDE' : 'SHOW'}</Mono>
              </Pressable>
            }
          >
            <TextInput
              value={password}
              onChangeText={(t) => { setPassword(t); if (error) clearError(); }}
              placeholder={mode === 'signin' ? 'your password' : 'at least 8 characters'}
              placeholderTextColor={colors.greenBorder}
              secureTextEntry={!showPassword}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              onSubmitEditing={submit}
              returnKeyType="go"
              onFocus={() => setFocus('password')}
              onBlur={() => setFocus(null)}
              style={[styles.input, focus === 'password' && styles.inputFocus]}
            />
          </Field>
        )}
        {mode === 'signin' && (
          <Pressable onPress={() => switchMode('reset')} style={styles.forgot} hitSlop={6}>
            <Mono style={styles.link}>Forgot password?</Mono>
          </Pressable>
        )}
      </View>

      {!!error && (
        <View style={styles.error}>
          <Mono style={styles.errorText}>{error}</Mono>
        </View>
      )}

      <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.8 }]}>
        {busy ? <ActivityIndicator color={colors.black} /> : <Mono style={styles.primaryText}>{action}</Mono>}
      </Pressable>

      {mode === 'reset' ? (
        <Pressable onPress={() => switchMode('signin')} style={styles.footerLink} hitSlop={6}>
          <Mono style={styles.link}>← Back to sign in</Mono>
        </Pressable>
      ) : (
        <Mono style={styles.footnote}>Every account gets its own private conversation with WYRD.</Mono>
      )}
    </View>
  );
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View>
      <View style={styles.fieldHead}>
        <Mono style={styles.fieldLabel}>{label}</Mono>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%', maxWidth: 400, alignSelf: 'center', overflow: 'hidden',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 24,
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 22,
    shadowColor: '#5A3018', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 14 },
  },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: colors.signal },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  face: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: colors.sand },
  wordmark: { fontSize: 24, letterSpacing: 5, color: colors.indigo },
  close: { fontSize: 24, lineHeight: 24, color: colors.greenDim },

  switcher: {
    flexDirection: 'row', marginTop: 18, padding: 4,
    backgroundColor: colors.sand, borderRadius: 999,
  },
  switchBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  switchOn: { backgroundColor: colors.signal, shadowColor: '#5A3018', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  switchText: { fontSize: 11, letterSpacing: 1.8, color: colors.greenDim },
  switchTextOn: { color: colors.onSignal },

  heading: { marginTop: 20, fontSize: 36, lineHeight: 38, color: colors.mint },
  blurb: { marginTop: 4, fontSize: 12.5, lineHeight: 19, color: colors.greenDim },

  steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, padding: 10, borderRadius: 16, backgroundColor: colors.bg },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.greenBorder,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
  },
  stepDotOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  stepNum: { fontSize: 10, color: colors.greenDim },
  stepNumOn: { color: colors.onSignal },
  stepLabel: { fontSize: 9.5, letterSpacing: 1.5, color: colors.greenDim },
  stepLabelOn: { color: colors.signal },

  fields: { marginTop: 18, gap: 14 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { fontSize: 10, letterSpacing: 2, color: colors.greenDim },
  show: { fontSize: 10, letterSpacing: 1.5, color: colors.signal },
  input: {
    borderWidth: 1.5, borderColor: colors.greenBorder, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'ShareTechMono_400Regular', fontSize: 15, color: colors.mint, backgroundColor: colors.bg,
  },
  inputFocus: { borderColor: colors.signal, backgroundColor: colors.card },
  codeInput: { fontSize: 24, letterSpacing: 10, textAlign: 'center' },
  inboxHint: { fontSize: 11.5, lineHeight: 17, color: colors.indigo, backgroundColor: 'rgba(36,49,107,0.07)', borderRadius: 12, padding: 10 },
  forgot: { alignSelf: 'flex-end', marginTop: -4 },
  link: { fontSize: 12, color: colors.signal, textDecorationLine: 'underline' },

  error: { marginTop: 14, borderRadius: 12, backgroundColor: 'rgba(184,58,38,0.08)', borderWidth: 1, borderColor: 'rgba(184,58,38,0.35)', paddingHorizontal: 12, paddingVertical: 9 },
  errorText: { fontSize: 12, lineHeight: 17, color: colors.danger },

  primary: { marginTop: 18, backgroundColor: colors.signal, borderRadius: 999, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50, shadowColor: '#C4572E', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  primaryText: { fontSize: 14, letterSpacing: 2.5, color: colors.onSignal },
  footerLink: { alignSelf: 'center', marginTop: 16 },
  footnote: { marginTop: 16, fontSize: 11, lineHeight: 16, color: colors.greenDim, textAlign: 'center' },
});
