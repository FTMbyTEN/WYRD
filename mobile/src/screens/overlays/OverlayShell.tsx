import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Display } from '../../components/ui';
import { colors } from '../../theme';
import { Glyph } from '../../components/glyph/Glyph';
import type { GlyphName } from '../../components/glyph/glyphs';
import { frosted, glass } from '../../components/glass';

// each panel's glyph, live while the panel is open
const PANEL_GLYPH: Record<string, GlyphName> = {
  ALERTS: 'alerts', APP_PREVIEW: 'eye', BRAIN_3D: 'brain', CONCEPT_MAP: 'concept', COP: 'cop',
  DIALOGUE_LINK: 'chat', GROWTH: 'growth', WORLD_MAP: 'globe', TASKS: 'spark',
};

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  black?: boolean; // overlays that fill with pure black instead of the 94%-black scrim
  glassWidth?: number; // a glass pop-up this wide at most (COP, ALERTS), instead of a full-screen panel
}

export function OverlayShell({ visible, title, onClose, children, footer, black, glassWidth }: Props) {
  const insets = useSafeAreaInsets();
  if (glassWidth) {
    // a glass pop-up over the app (like APPS): a tap outside closes it
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={[glass.scrim, frosted, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} onPress={onClose} accessibilityLabel={`Close ${title}`}>
          <Pressable style={[glass.pane, frosted, { maxWidth: glassWidth, maxHeight: '100%', flexShrink: 1 }]} onPress={() => {}}>
            <View style={[styles.header, styles.glassHeader]}>
              <View style={styles.titleRow}>
                {PANEL_GLYPH[title] ? <Glyph name={PANEL_GLYPH[title]} size={30} color={colors.signal} active /> : null}
                <Display style={styles.title}>{title}</Display>
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                <Glyph name="close" size={18} color={colors.greenDim} />
              </Pressable>
            </View>
            <View style={{ flexShrink: 1, minHeight: 0 }}>{children}</View>
            {footer}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} animationType="fade" transparent={!black} onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom, backgroundColor: black ? '#FFFAF2' : 'rgba(255,250,242,0.94)' }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {PANEL_GLYPH[title] ? <Glyph name={PANEL_GLYPH[title]} size={34} color={colors.signal} active /> : null}
            <Display style={styles.title}>{`>_ ${title}`}</Display>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Glyph name="close" size={18} color={colors.greenDim} />
          </Pressable>
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {footer}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.greenBorder,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 1 },
  glassHeader: { borderBottomColor: 'rgba(42,31,23,0.12)' },
});
