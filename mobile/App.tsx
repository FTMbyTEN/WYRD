import React, { Suspense } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { useFonts, VT323_400Regular } from '@expo-google-fonts/vt323';
import { ShareTechMono_400Regular } from '@expo-google-fonts/share-tech-mono';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/theme';

// Web: fill exactly the visible viewport on every device -- 100dvh tracks mobile browsers'
// collapsing address bar (plain 100vh overshoots it) -- and never scroll the page itself.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent =
    'html,body{margin:0;height:100%;overflow:hidden;background:#fff;overscroll-behavior:none}' +
    '#root{display:flex;flex-direction:column;height:100vh;height:100dvh;width:100vw}';
  document.head.appendChild(style);
  let viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.setAttribute('name', 'viewport');
    document.head.appendChild(viewport);
  }
  viewport.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.green} />
    </View>
  );
}

// Native: import synchronously — Skia's native binding is ready immediately, no gating needed.
// Web: everything that (transitively) imports @shopify/react-native-skia has to be *imported*
// (module-evaluated), not just rendered, after CanvasKit (WASM) finishes loading — Skia.web.ts
// reads `global.CanvasKit` once at import time. `React.lazy` + a dynamic `import()` is the only
// way to defer module evaluation itself, which is why AppRoot lives in its own file.
// Web: start loading CanvasKit (the ~3 MB graphics engine) and the app code the moment this
// module runs, in parallel with the fonts -- not after them, as a lazy component would.
// The direct game link (#play): only the game loads -- no CanvasKit (~8 MB), no rest of the app.
const gameOnly = Platform.OS === 'web' && typeof location !== 'undefined' && /^#(play|naija)/i.test(location.hash);
const GameOnly = React.lazy(() => import('./src/world2d/Lagos2D').then((m) => ({
  default: () => (
    <View style={{ flex: 1, backgroundColor: '#0d0f14' }}>
      <m.Lagos2D onExit={() => { location.hash = ''; location.reload(); }} />
    </View>
  ),
})));

const skiaReady: Promise<unknown> | null =
  Platform.OS === 'web' && !gameOnly
    ? import('@shopify/react-native-skia/lib/module/web').then(({ LoadSkiaWeb }) => LoadSkiaWeb())
    : null;

const AppRoot =
  Platform.OS === 'web'
    ? React.lazy(async () => {
        await skiaReady;
        return import('./src/AppRoot');
      })
    : require('./src/AppRoot').default;

export default function App() {
  const [fontsLoaded] = useFonts({ VT323_400Regular, ShareTechMono_400Regular });

  if (!fontsLoaded) return <Loading />;

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#F7EFE2' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <Suspense fallback={<Loading />}>
        {gameOnly ? <GameOnly /> : <AppRoot />}
      </Suspense>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7EFE2' },
});
