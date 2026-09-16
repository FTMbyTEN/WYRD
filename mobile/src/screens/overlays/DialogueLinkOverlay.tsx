import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { OverlayShell } from './OverlayShell';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api, ApiError } from '../../api/client';
import { useConversations } from '../../api/hooks';
import type { ChatAction } from '../../api/types';
import { speakAsWyrd } from '../../util/ttsVoice';

interface Props {
  visible: boolean;
  onClose: () => void;
  tts: boolean;
  onOpenGlobe: (countryName: string | null) => void;
  onOpenAppPreview: (html: string) => void;
}

/** Port of the DIALOGUE_LINK overlay: real chat via POST /api/chat, message history from
 *  GET /api/conversations kept live by the `chat` SSE event, and the two tool-call hand-offs
 *  (`open_world_map` / `preview_app`) routed to the real overlays instead of the design's two
 *  static demo buttons. The mic toggle is UI-only — there is no on-device speech-to-text wired
 *  up yet (would need expo-speech-recognition or similar); TTS is real via expo-speech. */
export function DialogueLinkOverlay({ visible, onClose, tts, onOpenGlobe, onOpenAppPreview }: Props) {
  const { turns } = useConversations(60);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mic, setMic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const handleAction = useCallback((action: ChatAction) => {
    if (!action) return;
    if (action.type === 'open_world_map') onOpenGlobe(action.country);
    else if (action.type === 'preview_app') onOpenAppPreview(action.html);
  }, [onOpenGlobe, onOpenAppPreview]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    setError(null);
    try {
      const result = await api.chat(text);
      handleAction(result.action);
      if (tts && result.reply) speakAsWyrd(result.reply);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not reach WYRD');
    } finally {
      setSending(false);
    }
  };

  const toggleMic = () => {
    setMic((m) => !m);
    // UI-only affordance matching the design's own mocked timeout — real STT is a follow-up.
    setTimeout(() => setMic(false), 2200);
  };

  useEffect(() => {
    if (!visible) Speech.stop();
  }, [visible]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [turns.length]);

  return (
    <OverlayShell
      visible={visible}
      title="DIALOGUE_LINK"
      onClose={onClose}
      footer={
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.inputRow}>
            <Mono style={styles.prompt}>{'>'}</Mono>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="transmit input..."
              placeholderTextColor="#0a9c2f88"
              style={styles.input}
              returnKeyType="send"
            />
            <Pressable onPress={toggleMic} style={styles.micBtn}>
              <Mono style={{ fontSize: 10, letterSpacing: 1, color: mic ? colors.green : colors.greenDim }}>
                {mic ? 'LISTENING…' : 'MIC'}
              </Mono>
            </Pressable>
            <Pressable onPress={send} disabled={sending} style={styles.sendBtn}>
              <Mono style={{ fontSize: 11, letterSpacing: 1, color: colors.green }}>{sending ? '…' : 'SEND'}</Mono>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      }
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {turns.length === 0 && (
          <Mono style={{ color: colors.greenBorderDim, fontSize: 11.5, textAlign: 'center', marginTop: 20 }}>
            say something — this is a private thread, just you and WYRD
          </Mono>
        )}
        {turns.map((t, i) => (
          <View key={`${t.timestamp}-${i}`} style={{ gap: 12 }}>
            {t.userText ? (
              <Message who="USER > YOU" text={t.userText} color={colors.mintBright} />
            ) : null}
            {t.botText ? (
              <Message who="SYS > WYRD" text={t.botText} color={colors.green} />
            ) : null}
          </View>
        ))}
        {!!error && <Mono style={{ color: colors.danger, fontSize: 11, marginTop: 8 }}>{error}</Mono>}
      </ScrollView>
    </OverlayShell>
  );
}

function Message({ who, text, color }: { who: string; text: string; color: string }) {
  return (
    <View>
      <Mono style={styles.who}>{who}</Mono>
      <Mono style={[styles.msgText, { color }]}>{text}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },
  who: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  msgText: { marginTop: 3, fontSize: 13, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 26 : 14,
    borderTopWidth: 1, borderTopColor: colors.greenBorder,
  },
  prompt: { color: colors.green, fontSize: 14 },
  input: {
    flex: 1, minWidth: 0, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: colors.greenDim,
    borderRadius: 2, padding: 10, color: colors.green, fontFamily: 'ShareTechMono_400Regular', fontSize: 12.5,
  },
  micBtn: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 2, paddingHorizontal: 10, paddingVertical: 10 },
  sendBtn: { borderWidth: 1, borderColor: colors.green, borderRadius: 2, paddingHorizontal: 13, paddingVertical: 10 },
});
