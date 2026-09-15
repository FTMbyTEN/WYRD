import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
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
  return (
    <Modal visible={visible} animationType="fade" transparent={!black} onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: black ? '#000' : 'rgba(0,0,0,0.94)' }]}>
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
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 44 : 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.greenBorder,
  },
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 1 },
  close: { fontSize: 24, lineHeight: 24, color: colors.greenDim },
});
