import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './api/AuthContext';
import { colors } from './theme';

// The entry screen (with its vortex) and the app itself are loaded separately: someone already
// signed in never downloads the gate, and the gate never waits for the whole app.
const GateScreen = lazy(() => import('./screens/GateScreen').then((m) => ({ default: m.GateScreen })));
const loadShell = () => import('./screens/AppShell');
const AppShell = lazy(() => loadShell().then((m) => ({ default: m.AppShell })));

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.green} />
    </View>
  );
}

// a direct link to the game: wryd00.serverpod.space/#play opens NAIJA 2099 full screen, no tabs on the way
const DirectGame = lazy(() => import('./world/LagosWorld').then((m) => ({ default: m.LagosWorld })));
function Root() {
  const { status } = useAuth();
  const [play, setPlay] = useState(() => typeof location !== 'undefined' && /^#(play|naija)/i.test(location.hash));
  // while someone is on the gate typing their details, fetch the app in the background so
  // signing in opens it at once instead of waiting on a download after the server says yes
  useEffect(() => {
    if (status === 'checking' || status === 'signedIn') return;
    const t = setTimeout(() => { void loadShell().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [status]);
  if (play) {
    return (
      <View style={styles.game}>
        <Suspense fallback={<Loading />}>
          <DirectGame onExit={() => { history.replaceState(null, '', location.pathname); setPlay(false); }} />
        </Suspense>
      </View>
    );
  }
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
  game: { flex: 1, backgroundColor: '#0d0f14' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
