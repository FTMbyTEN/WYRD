import { colors } from '../theme';
import { Platform, StyleSheet } from 'react-native';

/** The glass pop-up look (Apps, COP, Alerts): frosted on the web, the app's home; a plain
 *  translucent pane elsewhere (a native blur needs a package the app doesn't have). */
export const frosted = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(22px) saturate(160%)', WebkitBackdropFilter: 'blur(22px) saturate(160%)' } as object)
  : {};

export const glass = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: colors.scrim },
  // the scrim's colour alone, as its own layer (so it can fade on its own)
  scrimFill: { backgroundColor: colors.scrim },
  pane: {
    width: '100%', borderRadius: 24, overflow: 'hidden',
    backgroundColor: Platform.OS === 'web' ? colors.glassBg : colors.glassBgSolid,
    borderWidth: 1, borderColor: colors.glassBorder,
    shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 12 },
  },
  tile: { backgroundColor: colors.glassTile, borderWidth: 1, borderColor: colors.glassBorder },
  tileOn: { backgroundColor: colors.glassTileOn },
});
