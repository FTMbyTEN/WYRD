import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Speech from 'expo-speech';
import { OverlayShell } from './OverlayShell';
import { Display, Mono } from '../../components/ui';
import { FaceMark } from '../../components/FaceMark';
import { colors } from '../../theme';
import { api, ApiError } from '../../api/client';
import { useConversations, useMind } from '../../api/hooks';
import { wyrdStream } from '../../api/stream';
import type { ChatAction } from '../../api/types';
import { speakAsWyrd } from '../../util/ttsVoice';
import { captureNative, WebCameraSheet } from '../../components/CameraCapture';
import { useSpeechInput } from '../../util/speechInput';

interface Props {
  visible: boolean;
  onClose: () => void;
  tts: boolean;
  onOpenGlobe: (countryName: string | null) => void;
  onOpenAppPreview: (html: string) => void;
  onOpenDrone: () => void;
}

const SUGGESTIONS = [
  'What are you thinking about right now?',
  'What did you learn today?',
  'Build me a tip calculator',
  'Show me Japan on the globe',
  'Plan a short drone flight',
];

/** DIALOGUE_LINK: your private conversation with WYRD. Real chat via chat.sendMessage, history
 *  from chat.getHistory kept live by the stream's `chat` event, and the two tool hand-offs
 *  (`open_world_map` / `preview_app`) routed to the real overlays. Your message shows the moment
 *  you send it, with WYRD "thinking" until the reply lands. The mic is real speech-to-text
 *  on web (util/speechInput.ts); spoken replies are real via expo-speech. */
export function DialogueLinkOverlay({ visible, onClose, tts, onOpenGlobe, onOpenAppPreview, onOpenDrone }: Props) {
  const { turns } = useConversations(60);
  const { mind } = useMind();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ text: string; at: string } | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  // replies WYRD gave from its own learned answers this session, marked in the thread
  const [fromMemory, setFromMemory] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sending = pending !== null;

  const handleAction = useCallback((action: ChatAction) => {
    if (!action) return;
    if (action.type === 'open_world_map') onOpenGlobe(action.country);
    else if (action.type === 'preview_app') onOpenAppPreview(action.html);
    else if (action.type === 'open_drone') onOpenDrone();
  }, [onOpenGlobe, onOpenAppPreview, onOpenDrone]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || sending) return;
    setDraft('');
    setError(null);
    setPending({ text, at: new Date().toISOString() });
    try {
      const result = await api.chat(text);
      // No server push on Serverpod -- publish the turn (and the reply's fresh mind state) so
      // every useConversations/useMind instance updates now, not on its next poll.
      if (result.fromMemory) setFromMemory((s) => new Set(s).add(result.reply));
      wyrdStream.publish('chat', { id: result.turnId, userText: text, botText: result.reply, timestamp: result.block.timestamp, nonce: null });
      wyrdStream.publish('mind', result.mind);
      handleAction(result.action);
      if (tts && result.reply) speakAsWyrd(result.reply);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not reach WYRD');
      setDraft(text); // give the message back so it isn't lost
    } finally {
      setPending(null);
    }
  };

  /** One look: a frame (plus on-device tracking notes) to the vision model. Returns the reply. */
  const lookAt = async (base64: string, caption: string, trackingNote?: string): Promise<string | null> => {
    const shown = caption || '[let you look through their camera]';
    setError(null);
    setPending({ text: shown, at: new Date().toISOString() });
    try {
      const result = await api.photo(base64, caption || undefined, trackingNote);
      wyrdStream.publish('chat', { id: result.turnId, userText: shown, botText: result.reply, timestamp: result.block.timestamp, nonce: null });
      wyrdStream.publish('mind', result.mind);
      if (tts && result.reply) speakAsWyrd(result.reply);
      return result.reply;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'could not reach WYRD';
      setError(msg);
      return msg;
    } finally {
      setPending(null);
    }
  };

  // native: one photo from the phone camera, with whatever is typed as the question
  const sendPhoto = async (base64: string) => {
    const caption = draft.trim();
    setDraft('');
    await lookAt(base64, caption);
  };

  const openCamera = async () => {
    if (sending) return;
    if (Platform.OS === 'web') { setCamOpen(true); return; }
    try {
      const base64 = await captureNative();
      if (base64) await sendPhoto(base64);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Voice input: the transcript fills the box as you speak and sends when you pause.
  const speech = useSpeechInput({
    onText: (t) => setDraft(t),
    onFinal: (t) => { send(t); },
  });
  const mic = speech.listening;
  const toggleMic = () => {
    if (speech.listening) { speech.stop(); return; }
    if (!speech.supported) {
      setError(Platform.OS === 'web'
        ? "this browser has no speech recognition — try Chrome, Edge or Safari"
        : "use your keyboard's dictation mic for now");
      return;
    }
    Speech.stop(); // don't transcribe WYRD's own voice
    setError(null);
    speech.start();
  };
  useEffect(() => { if (speech.error) setError(speech.error); }, [speech.error]);

  useEffect(() => {
    if (!visible) { Speech.stop(); speech.stop(); }
  }, [visible]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [turns.length, pending]);

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <OverlayShell
      visible={visible}
      title="DIALOGUE_LINK"
      onClose={onClose}
      black
      footer={
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {!!error && (
            <View style={styles.error}>
              <Mono style={styles.errorText}>{error}</Mono>
            </View>
          )}
          <View style={styles.composer}>
            <Pressable onPress={toggleMic} style={[styles.iconBtn, mic && styles.iconBtnOn]} accessibilityLabel="Voice input">
              <Svg width={16} height={16} viewBox="0 0 16 16">
                <Path d="M8 1.5a2.2 2.2 0 0 0-2.2 2.2v3.8a2.2 2.2 0 0 0 4.4 0V3.7A2.2 2.2 0 0 0 8 1.5Z" stroke={mic ? colors.black : colors.greenDim} strokeWidth={1.3} fill="none" />
                <Path d="M3.8 7.2a4.2 4.2 0 0 0 8.4 0M8 11.4v3" stroke={mic ? colors.black : colors.greenDim} strokeWidth={1.3} fill="none" />
              </Svg>
            </Pressable>
            <Pressable onPress={openCamera} disabled={sending} style={styles.iconBtn} accessibilityLabel="Show WYRD a photo">
              <Svg width={16} height={16} viewBox="0 0 16 16">
                <Path d="M2 5.2h2.6L5.8 3.5h4.4l1.2 1.7H14v7.3H2Z" stroke={colors.greenDim} strokeWidth={1.3} fill="none" strokeLinejoin="round" />
                <Path d="M8 10.9a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z" stroke={colors.greenDim} strokeWidth={1.3} fill="none" />
              </Svg>
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={(t) => { setDraft(t); if (error) setError(null); }}
              onSubmitEditing={() => send()}
              placeholder={mic ? 'listening…' : 'Message WYRD'}
              placeholderTextColor={colors.greenBorder}
              style={styles.input}
              multiline
              blurOnSubmit
              returnKeyType="send"
            />
            <Pressable
              onPress={() => send()}
              disabled={!canSend}
              style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
              accessibilityLabel="Send"
            >
              <Svg width={16} height={16} viewBox="0 0 16 16">
                <Path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke={colors.black} strokeWidth={1.8} fill="none" />
              </Svg>
            </Pressable>
          </View>
          <WebCameraSheet visible={camOpen} onClose={() => setCamOpen(false)} onLook={lookAt} />
        </KeyboardAvoidingView>
      }
    >
      <View style={styles.presence}>
        <View style={styles.presenceFace}>
          <FaceMark mode="scan" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Mono style={styles.presenceName}>WYRD · {mind?.mood ?? 'online'}</Mono>
          <Mono numberOfLines={1} style={styles.presenceSub}>
            {mind?.focusTopic ? `thinking about ${mind.focusTopic}` : 'always thinking'} · private thread
          </Mono>
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
        {turns.length === 0 && !pending && (
          <View style={styles.empty}>
            <View style={styles.emptyFace}>
              <FaceMark mode="scan" />
            </View>
            <Display style={styles.emptyTitle}>Say something.</Display>
            <Mono style={styles.emptyText}>This is a private thread, just you and WYRD. It remembers what you tell it.</Mono>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                  <Mono style={styles.chipText}>{s}</Mono>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {turns.map((t, i) => (
          <View key={`${t.timestamp}-${i}`} style={styles.turn}>
            {t.userText ? <Bubble mine text={t.userText} at={t.timestamp} /> : null}
            {t.botText ? <Bubble text={t.botText} at={t.timestamp} recalled={fromMemory.has(t.botText)} turnId={t.id} rating={t.rating ?? null} /> : null}
          </View>
        ))}

        {pending && (
          <View style={styles.turn}>
            <Bubble mine text={pending.text} at={pending.at} />
            <Thinking />
          </View>
        )}
      </ScrollView>
    </OverlayShell>
  );
}

/** Splits a reply into prose and ``` fenced code blocks, so code reads as code. */
function splitCode(text: string): { code: boolean; lang?: string; body: string }[] {
  const parts: { code: boolean; lang?: string; body: string }[] = [];
  const re = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ code: false, body: text.slice(last, m.index).trim() });
    parts.push({ code: true, lang: m[1] || undefined, body: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ code: false, body: text.slice(last).trim() });
  return parts.filter((p) => p.body.length > 0);
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5);
}

function Bubble({ text, at, mine, recalled, turnId, rating }: { text: string; at: string; mine?: boolean; recalled?: boolean; turnId?: number; rating?: number | null }) {
  if (mine) {
    return (
      <View style={styles.mineRow}>
        <View style={styles.mine}>
          <Mono style={styles.mineText}>{text}</Mono>
        </View>
        <Mono style={styles.timeRight}>{timeLabel(at)}</Mono>
      </View>
    );
  }
  return (
    <View style={styles.theirsRow}>
      <View style={styles.avatar}>
        <FaceMark mode="scan" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.theirs}>
          {splitCode(text).map((p, i) =>
            p.code ? (
              <View key={i} style={styles.code}>
                {p.lang ? <Mono style={styles.codeLang}>{p.lang.toUpperCase()}</Mono> : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Mono style={styles.codeText}>{p.body}</Mono>
                </ScrollView>
              </View>
            ) : (
              <Mono key={i} style={styles.theirsText}>{p.body}</Mono>
            ),
          )}
        </View>
        <View style={styles.metaRow}>
          <Mono style={styles.timeLeft}>WYRD · {timeLabel(at)}{recalled ? ' · ↺ from memory, no AI call' : ''}</Mono>
          {turnId != null && <Thumbs turnId={turnId} initial={rating ?? null} />}
        </View>
      </View>
    </View>
  );
}

/** 👍 / 👎 on one of WYRD's replies: trains the answer behind it (tap again to clear). */
function Thumbs({ turnId, initial }: { turnId: number; initial: number | null }) {
  const [rating, setRating] = useState<number | null>(initial);
  const [thanks, setThanks] = useState(false);
  const choose = (r: 1 | -1) => {
    const next = rating === r ? 0 : r;
    const before = rating;
    setRating(next === 0 ? null : next);
    setThanks(next !== 0);
    api.rateReply(turnId, next).catch(() => setRating(before));
  };
  return (
    <View style={styles.thumbs}>
      <Pressable onPress={() => choose(1)} accessibilityLabel="Helpful reply" style={[styles.thumb, rating === 1 && styles.thumbOn]}>
        <Mono style={[styles.thumbText, rating === 1 && styles.thumbTextOn]}>👍</Mono>
      </Pressable>
      <Pressable onPress={() => choose(-1)} accessibilityLabel="Unhelpful reply" style={[styles.thumb, rating === -1 && styles.thumbOn]}>
        <Mono style={[styles.thumbText, rating === -1 && styles.thumbTextOn]}>👎</Mono>
      </Pressable>
      {thanks && rating != null && <Mono style={styles.thanks}>{rating === 1 ? 'noted — WYRD will reuse this' : 'noted — WYRD will rethink this'}</Mono>}
    </View>
  );
}

/** Three dots rising in turn while WYRD composes its reply. */
function Thinking() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={styles.theirsRow}>
      <View style={styles.avatar}>
        <FaceMark mode="scan" />
      </View>
      <View style={[styles.theirs, styles.thinking]}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
              },
            ]}
          />
        ))}
        <Mono style={styles.thinkingText}>thinking</Mono>
      </View>
    </View>
  );
}

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  presence: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: HAIRLINE, borderBottomColor: colors.greenBorder,
  },
  presenceFace: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.green },
  presenceName: { fontSize: 11.5, letterSpacing: 1.5, color: colors.green },
  presenceSub: { marginTop: 1, fontSize: 10, color: colors.greenDim },

  thread: { padding: 16, paddingBottom: 24, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' },
  turn: { gap: 10 },

  mineRow: { alignItems: 'flex-end' },
  mine: { maxWidth: '82%', backgroundColor: colors.green, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, borderBottomRightRadius: 4 },
  mineText: { fontSize: 13.5, lineHeight: 20, color: colors.black },
  timeRight: { marginTop: 3, fontSize: 9, color: colors.greenBorder },

  theirsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' },
  avatar: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', borderWidth: 1, borderColor: colors.greenBorder, marginBottom: 16 },
  theirs: {
    alignSelf: 'flex-start', maxWidth: '100%', borderWidth: 1, borderColor: colors.green,
    paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, borderBottomLeftRadius: 4, gap: 8,
  },
  theirsText: { fontSize: 13.5, lineHeight: 20, color: colors.mint },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  thumbs: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  thumb: { borderWidth: 1, borderColor: 'transparent', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, opacity: 0.55 },
  thumbOn: { borderColor: colors.green, opacity: 1 },
  thumbText: { fontSize: 11 },
  thumbTextOn: {},
  thanks: { fontSize: 9.5, color: colors.greenDim },
  timeLeft: { marginTop: 3, fontSize: 9, color: colors.greenBorder },

  code: { borderWidth: HAIRLINE, borderColor: colors.greenBorder, backgroundColor: 'rgba(0,0,0,0.035)', padding: 10, borderRadius: 6 },
  codeLang: { fontSize: 8.5, letterSpacing: 1.5, color: colors.greenDim, marginBottom: 6 },
  codeText: { fontSize: 12, lineHeight: 18, color: colors.green },

  thinking: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  thinkingText: { marginLeft: 4, fontSize: 10, color: colors.greenDim },

  empty: { alignItems: 'center', paddingTop: 30, gap: 8 },
  emptyFace: { width: 68, height: 68, borderRadius: 34, overflow: 'hidden', borderWidth: 1, borderColor: colors.green, marginBottom: 6 },
  emptyTitle: { fontSize: 28, color: colors.green },
  emptyText: { fontSize: 12, lineHeight: 18, color: colors.greenDim, textAlign: 'center', maxWidth: 300 },
  chips: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 11.5, color: colors.green },

  error: { marginHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.danger, paddingHorizontal: 10, paddingVertical: 7 },
  errorText: { fontSize: 11, color: colors.danger },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 12, marginBottom: 10, marginTop: 4,
    borderWidth: 1, borderColor: colors.green, borderRadius: 24, paddingLeft: 6, paddingRight: 6, paddingVertical: 6,
  },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  iconBtnOn: { backgroundColor: colors.green },
  input: {
    flex: 1, minWidth: 0, maxHeight: 120, paddingHorizontal: 4, paddingVertical: 8,
    color: colors.green, fontFamily: 'ShareTechMono_400Regular', fontSize: 14,
  },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.25 },
});
