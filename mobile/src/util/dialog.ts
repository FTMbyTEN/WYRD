import { Alert, Platform } from 'react-native';

// React Native's Alert does nothing on web (react-native-web ships it as a no-op), so a button
// that only opens an Alert looks dead in the browser. These fall back to the browser's own
// dialogs there.

/** Shows a simple notice. */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
