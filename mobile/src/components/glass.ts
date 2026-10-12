import { Platform, StyleSheet } from 'react-native';

/** The glass pop-up look (Apps, COP, Alerts): frosted on the web, the app's home; a plain
 *  translucent pane elsewhere (a native blur needs a package the app doesn't have). */
export const frosted = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(22px) saturate(160%)', WebkitBackdropFilter: 'blur(22px) saturate(160%)' } as object)
  : {};

export const glass = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(20,16,10,0.18)' },
  pane: {
    width: '100%', borderRadius: 24, overflow: 'hidden',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,250,242,0.62)' : 'rgba(255,250,242,0.95)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 12 },
  },
  tile: { backgroundColor: 'rgba(255,255,255,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)' },
  tileOn: { backgroundColor: 'rgba(255,255,255,0.75)' },
});
