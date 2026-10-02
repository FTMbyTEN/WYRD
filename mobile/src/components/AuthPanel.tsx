import React, { useState } from 'react';
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
  const [showPassword, setShowPassword] = useState(false);

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
      else if (step === 3 && password) await auth.finishRegister(password);
    } else {
      if (step === 1 && e) await auth.startReset(e);
      else if (step === 2 && code.trim()) await auth.verifyResetCode(code.trim());
      else if (step === 3 && password) await auth.finishReset(password);
    }
  };

  return (
    <View style={styles.card}>
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
              style={styles.input}
            />
          </Field>
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
              style={[styles.input, styles.codeInput]}
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
              style={styles.input}
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
    width: '100%', maxWidth: 380, alignSelf: 'center',
    backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  face: { width: 26, height: 26 },
  wordmark: { fontSize: 20, letterSpacing: 5, color: colors.green },
  close: { fontSize: 22, lineHeight: 22, color: colors.greenDim },

  switcher: {
    flexDirection: 'row', marginTop: 16, padding: 3,
    borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999,
  },
  switchBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  switchOn: { backgroundColor: colors.signal },
  switchText: { fontSize: 10, letterSpacing: 1.8, color: colors.greenDim },
  switchTextOn: { color: colors.black },

  heading: { marginTop: 18, fontSize: 28, lineHeight: 30, color: colors.green },
  blurb: { marginTop: 4, fontSize: 11.5, lineHeight: 17, color: colors.greenDim },

  steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.greenBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  stepNum: { fontSize: 9.5, color: colors.greenDim },
  stepNumOn: { color: colors.black },
  stepLabel: { fontSize: 8.5, letterSpacing: 1.5, color: colors.greenBorder },
  stepLabelOn: { color: colors.signal },

  fields: { marginTop: 16, gap: 12 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  fieldLabel: { fontSize: 8.5, letterSpacing: 2, color: colors.greenDim },
  show: { fontSize: 8.5, letterSpacing: 1.5, color: colors.green },
  input: {
    borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: 'ShareTechMono_400Regular', fontSize: 14, color: colors.green, backgroundColor: colors.black,
  },
  codeInput: { fontSize: 20, letterSpacing: 8, textAlign: 'center' },
  forgot: { alignSelf: 'flex-end', marginTop: -4 },
  link: { fontSize: 11, color: colors.signal, textDecorationLine: 'underline' },

  error: { marginTop: 12, borderWidth: 1, borderColor: colors.danger, paddingHorizontal: 10, paddingVertical: 8 },
  errorText: { fontSize: 11, lineHeight: 16, color: colors.danger },

  primary: { marginTop: 16, backgroundColor: colors.signal, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  primaryText: { fontSize: 12, letterSpacing: 2.5, color: colors.black },
  footerLink: { alignSelf: 'center', marginTop: 14 },
  footnote: { marginTop: 14, fontSize: 10, lineHeight: 15, color: colors.greenDim, textAlign: 'center' },
});
