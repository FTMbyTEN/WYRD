import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './api/AuthContext';
import { colors } from './theme';

// The entry screen (with its vortex) and the app itself are loaded separately: someone already
// signed in never downloads the gate, and the gate never waits for the whole app.
const GateScreen = lazy(() => import('./screens/GateScreen').then((m) => ({ default: m.GateScreen })));
const AppShell = lazy(() => import('./screens/AppShell').then((m) => ({ default: m.AppShell })));

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.green} />
    </View>
  );
}

function Root() {
  const { status } = useAuth();
  if (status === 'checking') return <Loading />;
  return (
    <Suspense fallback={<Loading />}>
      {status === 'signedIn' ? <AppShell /> : <GateScreen />}
    </Suspense>
  );
}

// Split out from App.tsx so the web build can defer *importing* this (and everything it pulls
// in, including every screen that touches @shopify/react-native-skia) until after CanvasKit has
// loaded — Skia's web binding (`Skia.web.ts`) reads `global.CanvasKit` once, synchronously, at
// module-evaluation time, so the whole subtree has to be evaluated after that global is set, not
// just rendered after. See App.tsx for the web-only dynamic import that does this.
export default function AppRoot() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
