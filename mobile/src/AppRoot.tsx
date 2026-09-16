import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './api/AuthContext';
import { GateScreen } from './screens/GateScreen';
import { AppShell } from './screens/AppShell';
import { colors } from './theme';

function Root() {
  const { status } = useAuth();
  if (status === 'checking') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }
  return status === 'signedIn' ? <AppShell /> : <GateScreen />;
}

// Split out from App.tsx so the web build can defer *importing* this (and everything it pulls
// in, including every screen that touches @shopify/react-native-skia) until after CanvasKit has
// loaded — Skia's web binding (`Skia.web.ts`) reads `global.CanvasKit` once, synchronously, at
// module-evaluation time, so the whole subtree has to be evaluated after that global is set, not
// just rendered after. See App.tsx's `AppRootLazy` for the web-only dynamic import that does this.
export default function AppRoot() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
});
