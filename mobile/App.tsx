import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { useFonts, VT323_400Regular } from '@expo-google-fonts/vt323';
import { ShareTechMono_400Regular } from '@expo-google-fonts/share-tech-mono';
import { AuthProvider, useAuth } from './src/api/AuthContext';
import { GateScreen } from './src/screens/GateScreen';
import { AppShell } from './src/screens/AppShell';
import { colors } from './src/theme';

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

export default function App() {
  const [fontsLoaded] = useFonts({ VT323_400Regular, ShareTechMono_400Regular });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <AuthProvider>
        <Root />
      </AuthProvider>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
});
