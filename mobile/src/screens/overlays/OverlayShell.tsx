import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  black?: boolean; // overlays that fill with pure black instead of the 94%-black scrim
}

export function OverlayShell({ visible, title, onClose, children, footer, black }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" transparent={!black} onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom, backgroundColor: black ? '#ffffff' : 'rgba(255,255,255,0.94)' }]}>
        <View style={styles.header}>
          <Display style={styles.title}>{`>_ ${title}`}</Display>
          <Pressable onPress={onClose} hitSlop={12}>
            <Mono style={styles.close}>×</Mono>
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
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 1 },
  close: { fontSize: 24, lineHeight: 24, color: colors.greenDim },
});
