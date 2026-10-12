import React, { useEffect } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Display, Mono } from '../../components/ui';
import { SidePanel } from '../../components/SidePanel';
import { colors } from '../../theme';
import { Glyph } from '../../components/glyph/Glyph';
import type { GlyphName } from '../../components/glyph/glyphs';
import { frosted, glass } from '../../components/glass';
import { useEnter } from '../../components/motion';

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
  // desktop: docked to the right of the page as a resizable glass panel instead of a pop-up
  dock?: { width: number; onResize: (w: number) => void; minWidth: number; maxWidth: number };
}

export function OverlayShell({ visible, title, onClose, children, footer, black, glassWidth, dock }: Props) {
  const insets = useSafeAreaInsets();
  const enter = useEnter(visible); // every panel arrives the same way: a short fade, rise and settle
  // docked: Escape closes it (a modal gets this from onRequestClose)
  useEffect(() => {
    if (!dock || !visible || Platform.OS !== 'web') return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dock, visible, onClose]);
  if (dock) {
    // a glass panel docked to the right of the page (desktop), sliding in and out, resizable
    const wide = dock.width >= (dock.minWidth + dock.maxWidth) / 2;
    return (
      <SidePanel open={visible} side="right" width={dock.width} onResize={dock.onResize} minWidth={dock.minWidth} maxWidth={dock.maxWidth}>
        <View style={[styles.header, styles.glassHeader, styles.dockHeader]}>
          <View style={styles.titleRow}>
            {PANEL_GLYPH[title] ? <Glyph name={PANEL_GLYPH[title]} size={26} color={colors.signal} active /> : null}
            <Display style={styles.dockTitle}>{title}</Display>
          </View>
          <View style={styles.titleRow}>
            <Pressable
              onPress={() => dock.onResize(wide ? dock.minWidth : dock.maxWidth)}
              hitSlop={10}
              accessibilityLabel={wide ? 'Make the panel narrower' : 'Make the panel wider'}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.dockBtn, hovered && styles.dockBtnOn]}
            >
              <Mono style={styles.dockBtnText}>{wide ? '›‹' : '‹›'}</Mono>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.dockBtn, hovered && styles.dockBtnOn]}>
              <Glyph name="close" size={16} color={colors.greenDim} />
            </Pressable>
          </View>
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {footer}
      </SidePanel>
    );
  }
  if (glassWidth) {
    // a glass pop-up over the app (like APPS): a tap outside closes it
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={[glass.scrim, frosted, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} onPress={onClose} accessibilityLabel={`Close ${title}`}>
          <Animated.View style={[{ width: '100%', maxWidth: glassWidth, maxHeight: '100%', flexShrink: 1 }, enter]}>
          <Pressable style={[glass.pane, frosted, { maxHeight: '100%', flexShrink: 1 }]} onPress={() => {}}>
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
          </Animated.View>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} animationType="fade" transparent={!black} onRequestClose={onClose}>
      <Animated.View style={[styles.root, !black && frosted, { paddingTop: insets.top + 8, paddingBottom: insets.bottom, backgroundColor: black ? colors.panelBg : Platform.OS === 'web' ? colors.glassBg : colors.glassBgSolid }, enter]}>
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
      </Animated.View>
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
  glassHeader: { borderBottomColor: colors.glassLine },
  dockHeader: { paddingVertical: 12, paddingHorizontal: 16 },
  dockTitle: { fontSize: 20, lineHeight: 22, letterSpacing: 1 },
  dockBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dockBtnOn: { backgroundColor: colors.glassTileOn },
  dockBtnText: { fontSize: 13, color: colors.greenDim, letterSpacing: -1 },
});
