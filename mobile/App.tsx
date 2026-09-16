import React, { Suspense } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { useFonts, VT323_400Regular } from '@expo-google-fonts/vt323';
import { ShareTechMono_400Regular } from '@expo-google-fonts/share-tech-mono';
import { colors } from './src/theme';

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
const AppRoot =
  Platform.OS === 'web'
    ? React.lazy(async () => {
        const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
        await LoadSkiaWeb();
        return import('./src/AppRoot');
      })
    : require('./src/AppRoot').default;

export default function App() {
  const [fontsLoaded] = useFonts({ VT323_400Regular, ShareTechMono_400Regular });

  if (!fontsLoaded) return <Loading />;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <Suspense fallback={<Loading />}>
        <AppRoot />
      </Suspense>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
});
