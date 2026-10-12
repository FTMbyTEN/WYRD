import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Mono } from '../components/ui';
import { Glyph } from '../components/glyph/Glyph';
import type { GlyphName } from '../components/glyph/glyphs';
import { useChats } from '../api/hooks';
import { colors, fonts } from '../theme';
import type { TabKey } from './TabBar';
import { frosted } from '../components/glass';

export const APPS: { key: TabKey; label: string; glyph: GlyphName; blurb: string; owner?: boolean }[] = [
  { key: 'drone', label: 'Drone', glyph: 'drone', blurb: 'Fly, watch, plan', owner: true },
  { key: 'journal', label: 'Journal', glyph: 'journal', blurb: 'Diary, dreams, growth', owner: true },
  { key: 'games', label: 'Games', glyph: 'games', blurb: 'Chess, NAIJA 2099', },
];

// the glass look is shared with COP and ALERTS (components/glass)

/** APPS: Drone, Journal and Games in one glass pop-up (and, on phones, your chats too -- on desktop
 *  they're in the side bar). */
export function AppsSheet({ visible, onClose, onPick, drone, onOpenChat, withChats }: {
  visible: boolean;
  onClose: () => void;
  onPick: (t: TabKey) => void;
  drone: boolean;
  onOpenChat: () => void;
  withChats?: boolean;
}) {
  // small phones: the three apps side by side in a row, smaller, and the whole sheet scrolls
  const win = useWindowDimensions();
  const small = win.width < 420 || win.height < 700;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, frosted]} onPress={onClose} accessibilityLabel="Close apps">
        {/* (a tap on the glass itself doesn't close it) */}
        <Pressable style={[styles.glass, frosted, small && styles.glassSmall]} onPress={() => {}}>
          <ScrollView contentContainerStyle={small ? styles.bodySmall : styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <Mono style={styles.title}>APPS</Mono>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Glyph name="close" size={16} color={colors.greenDim} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {APPS.filter((a) => !a.owner || drone).map((a) => (
              <Pressable
                key={a.key}
                onPress={() => { onPick(a.key); onClose(); }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tile, small && styles.tileSmall, (pressed || hovered) && styles.tileOn]}
                accessibilityLabel={a.label}
              >
                <Glyph name={a.glyph} size={small ? 30 : 40} color={colors.signal} active />
                <Mono style={[styles.tileLabel, small && styles.tileLabelSmall]}>{a.label}</Mono>
                {small ? null : <Mono style={styles.tileBlurb}>{a.blurb}</Mono>}
              </Pressable>
            ))}
          </View>
          {withChats ? (
            <View style={{ marginTop: 18 }}>
              <ChatsList onOpen={() => { onOpenChat(); onClose(); }} max={6} />
            </View>
          ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Your chats with WYRD: start a new one, or pick up an old one (it opens in Dialogue Link). */
export function ChatsList({ onOpen, max = 12 }: { onOpen: () => void; max?: number }) {
  const { chats, newChat, openChat } = useChats();
  const [busy, setBusy] = useState(false);
  const go = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await job(); onOpen(); } catch { /* the list stays as it was */ }
    setBusy(false);
  };
  return (
    <View style={styles.chats}>
      <Mono style={styles.section}>CHATS</Mono>
      <Pressable onPress={() => void go(newChat)} disabled={busy} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.newBtn, (pressed || hovered) && styles.tileOn, busy && { opacity: 0.5 }]} accessibilityLabel="New chat">
        <Mono style={styles.newText}>+  New chat</Mono>
      </Pressable>
      <ScrollView style={{ maxHeight: max * 44 }} showsVerticalScrollIndicator={false}>
        {chats.slice(0, 50).map((c) => (
          <Pressable
            key={c.id}
            onPress={() => void go(() => (c.current ? Promise.resolve() : openChat(c.id)))}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.chat, c.current && styles.chatOn, (pressed || hovered) && !c.current && styles.tileOn]}
            accessibilityLabel={`Open chat: ${c.title}`}
          >
            <Mono numberOfLines={1} style={[styles.chatTitle, c.current && { color: colors.signal }]}>{c.title}</Mono>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(20,16,10,0.18)' },
  glass: {
    width: '100%', maxWidth: 520, maxHeight: '100%', borderRadius: 24, overflow: 'hidden',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,250,242,0.55)' : 'rgba(255,250,242,0.94)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 12 },
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 2.4, color: colors.greenDim },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  body: { padding: 20 },
  bodySmall: { padding: 14 },
  glassSmall: { borderRadius: 20 },
  tileSmall: { flexBasis: 0, minWidth: 0, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14, gap: 4 },
  tileLabelSmall: { fontSize: 12.5 },
  tile: {
    flexGrow: 1, flexBasis: 130, alignItems: 'center', gap: 6, paddingVertical: 18, paddingHorizontal: 10, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)',
  },
  tileOn: { backgroundColor: 'rgba(255,255,255,0.75)' },
  tileLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.green },
  tileBlurb: { fontSize: 10.5, color: colors.greenDim, textAlign: 'center' },
  chats: { gap: 4 },
  section: { fontSize: 10, letterSpacing: 1.8, color: colors.greenDim, marginBottom: 4, paddingHorizontal: 6 },
  newBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.greenBorder, marginBottom: 4 },
  newText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.green },
  chat: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
  chatOn: { backgroundColor: colors.signalSoft },
  chatTitle: { fontSize: 12, color: colors.greenDim },
});
