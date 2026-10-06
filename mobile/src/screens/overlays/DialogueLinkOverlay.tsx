import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Speech from 'expo-speech';
import { OverlayShell } from './OverlayShell';
import { Display, Mono } from '../../components/ui';
import { FaceMark } from '../../components/FaceMark';
import { RichText } from '../../components/RichText';
import { colors, fonts } from '../../theme';
import { CodeText } from '../../components/CodeText';
import { Glyph } from '../../components/glyph/Glyph';
import { DustThinking } from '../../components/dust/DustThinking';
import type { GlyphName } from '../../components/glyph/glyphs';
import { api, ApiError } from '../../api/client';
import { useConversations, useMind } from '../../api/hooks';
import { wyrdStream } from '../../api/stream';
import type { ChatAction } from '../../api/types';
import { speakAsWyrd } from '../../util/ttsVoice';
import { preloadVoice, sfx, stopVoice, voice } from '../../util/sound';
import { captureNative, WebCameraSheet } from '../../components/CameraCapture';
import { useSpeechInput } from '../../util/speechInput';
import { extractText, pickFile } from '../../util/fileText';
import { buildIndex, passagesFor, sampleOf, wordCount, type DocIndex } from '../../util/docIndex';

interface Props {
  visible: boolean;
  onClose: () => void;
  tts: boolean;
  onOpenGlobe: (countryName: string | null) => void;
  onOpenAppPreview: (html: string) => void;
  onOpenDrone: () => void;
  onOpenTasks?: () => void;
  onOpenBook: (readingItemId: number) => void;
}

const SUGGESTIONS: { tag: string; text: string }[] = [
  { tag: 'MIND', text: 'What are you thinking about right now?' },
  { tag: 'MEMORY', text: 'What did you learn today?' },
  { tag: 'BUILD', text: 'Build me a tip calculator' },
  { tag: 'ACADEMY', text: 'Find me a physics textbook' },
  { tag: 'GLOBE', text: 'Show me Japan on the globe' },
  { tag: 'DRONE', text: 'Plan a short drone flight' },
];

/** A file read in this browser: its details, and its passages indexed for questions. */
type OpenDoc = { name: string; kind: string; pages?: number; words: number; ix: DocIndex };
/** A file in the composer: being read (with progress), or ready for the message that goes with it. */
type Staged =
  | { status: 'reading'; name: string; done: number; total: number }
  | { status: 'ready'; doc: OpenDoc }
  | { status: 'photo'; name: string; base64: string; preview: string }; // a picture, for WYRD to look at

/** A picked photo, shrunk in the browser to at most 1280 px and re-encoded as JPEG: quick to send,
 *  and what the photo endpoint expects (base64, no data: prefix). */
async function photoFromFile(file: File): Promise<{ base64: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That image couldn't be opened (HEIC photos from iPhones may need converting to JPEG first)."));
      i.src = url;
    });
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    const x = cv.getContext('2d')!;
    x.fillStyle = '#FFFAF2';
    x.fillRect(0, 0, cv.width, cv.height); // transparent PNGs on white, not black
    x.drawImage(img, 0, 0, cv.width, cv.height);
    const preview = cv.toDataURL('image/jpeg', 0.82);
    return { base64: preview.slice(preview.indexOf(',') + 1), preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name);

const ATTACHED = /^📎 ([^\n]+)\n*/;

/** DIALOGUE_LINK: your private conversation with WYRD. Real chat via chat.sendMessage, history
 *  from chat.getHistory kept live by the stream's `chat` event, and the tool hand-offs routed to
 *  the real overlays. A file you attach waits in the composer until you send your message with
 *  it; replies render their formatting (bold, lists, code) instead of showing the markers. */
export function DialogueLinkOverlay({ visible, onClose, tts, onOpenGlobe, onOpenAppPreview, onOpenDrone, onOpenBook, onOpenTasks }: Props) {
  const { turns } = useConversations(60);
  const { mind } = useMind();
  const [draft, setDraft] = useState('');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [pending, setPending] = useState<{ text: string; at: string } | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // replies WYRD gave from its own learned answers this session, marked in the thread
  const [fromMemory, setFromMemory] = useState<Set<string>>(() => new Set());
  // replies the judgement gate changed this session: reply text -> verdict
  const [judged, setJudged] = useState<Map<string, string>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // the file this conversation is about, kept only here in the browser: each message sends the
  // passages of it that matter, so WYRD answers from the file without the server keeping it
  const openDoc = useRef<OpenDoc | null>(null);
  const reading = useRef(0); // which read is current, so a removed file's read is ignored
  const sending = pending !== null;

  const handleAction = useCallback((action: ChatAction) => {
    if (!action) return;
    if (action.type === 'open_world_map') onOpenGlobe(action.country);
    else if (action.type === 'preview_app') onOpenAppPreview(action.html);
    else if (action.type === 'open_drone') onOpenDrone();
    else if (action.type === 'open_book') onOpenBook(action.readingItemId);
    else if (action.type === 'open_tasks') onOpenTasks?.();
  }, [onOpenGlobe, onOpenAppPreview, onOpenDrone, onOpenBook, onOpenTasks]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    // a staged photo goes to WYRD's eyes, with the message as the question about it
    if (override == null && staged?.status === 'photo') {
      const photo = staged;
      setDraft('');
      setStaged(null);
      sfx('send');
      await lookAt(photo.base64, text || `[shared a photo: ${photo.name}]`);
      return;
    }
    const file = override == null && staged?.status === 'ready' ? staged.doc : null;
    if ((!text && !file) || sending || staged?.status === 'reading') return;
    const shown = file ? `📎 ${file.name}${text ? `\n${text}` : ''}` : text;
    setDraft('');
    setStaged(null);
    setError(null);
    setPending({ text: shown, at: new Date().toISOString() });
    sfx('send');
    // a reply that takes a while: WYRD says it's thinking (once)
    const slow = setTimeout(() => { void voice('thinking'); }, 4500);
    try {
      if (file && !text) {
        // a file on its own: WYRD's first look at it is the reply
        const up = await api.documentUpload(file.name, file.kind, sampleOf(file.ix), file.words, file.pages);
        openDoc.current = file;
        wyrdStream.publish('chat', { id: up.turnId ?? undefined, userText: `📎 ${up.name}`, botText: up.reply, timestamp: new Date().toISOString(), nonce: null });
        clearTimeout(slow);
        sfx('receive');
        if (tts && up.reply) { stopVoice(); speakAsWyrd(up.reply); }
        return;
      }
      if (file) {
        await api.documentUpload(file.name, file.kind, sampleOf(file.ix), file.words, file.pages, true);
        openDoc.current = file;
      }
      const open = openDoc.current;
      const result = await api.chat(shown, open ? passagesFor(open.ix, text) : undefined);
      // No server push on Serverpod -- publish the turn (and the reply's fresh mind state) so
      // every useConversations/useMind instance updates now, not on its next poll.
      if (result.fromMemory) setFromMemory((s) => new Set(s).add(result.reply));
      if (result.judgement) setJudged((m) => new Map(m).set(result.reply, result.judgement!));
      wyrdStream.publish('chat', { id: result.turnId, userText: shown, botText: result.reply, timestamp: result.block.timestamp, nonce: null });
      wyrdStream.publish('mind', result.mind);
      handleAction(result.action);
      clearTimeout(slow);
      sfx('receive');
      if (tts && result.reply) {
        stopVoice();
        // an answer the judgement check softened is introduced as uncertain, in WYRD's own voice
        if (result.judgement === 'softened') voice('not-sure').then(() => speakAsWyrd(result.reply));
        else speakAsWyrd(result.reply);
      }
    } catch (err) {
      clearTimeout(slow);
      stopVoice();
      sfx('error');
      void voice('error');
      setError(err instanceof ApiError ? err.message : (err as Error)?.message || 'could not reach WYRD');
      setDraft(text); // give the message (and file) back so nothing is lost
      if (file) setStaged({ status: 'ready', doc: file });
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

  // Attach a file: its text is read here in the browser, then it waits in the composer until
  // you send your message with it. Nothing reaches WYRD before that.
  const attachFile = async () => {
    if (sending || staged?.status === 'reading') return;
    if (Platform.OS !== 'web') { setError('Sharing files works in the web app for now.'); return; }
    setError(null);
    const file = await pickFile();
    if (!file) return;
    const me = ++reading.current;
    // a photo: shown in the composer, sent to WYRD's eyes with whatever you ask about it
    if (isImage(file)) {
      setStaged({ status: 'reading', name: file.name, done: 0, total: 0 });
      try {
        const { base64, preview } = await photoFromFile(file);
        if (reading.current !== me) return;
        setStaged({ status: 'photo', name: file.name, base64, preview });
        sfx('ready');
      } catch (e) {
        if (reading.current === me) { setStaged(null); setError((e as Error).message); }
      }
      return;
    }
    setStaged({ status: 'reading', name: file.name, done: 0, total: 0 });
    sfx('scan');
    preloadVoice(['file-received', 'file-ready']);
    void voice('file-received');
    try {
      const doc = await extractText(file, (done, total) => {
        if (reading.current === me) setStaged({ status: 'reading', name: file.name, done, total });
      });
      if (doc.text.trim().length < 20) throw new Error("I couldn't find readable text in that file (a scanned PDF is an image, not text).");
      await new Promise((r) => setTimeout(r, 0));
      const ix = buildIndex(doc.name, doc.text);
      if (reading.current !== me) return;
      setStaged({ status: 'ready', doc: { name: doc.name, kind: doc.kind, pages: doc.pages, words: wordCount(doc.text), ix } });
      sfx('ready');
      void voice('file-ready');
    } catch (e) {
      if (reading.current !== me) return;
      setStaged(null);
      sfx('error');
      setError((e as Error).message || 'could not read that file');
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

  const canSend = (draft.trim().length > 0 || staged?.status === 'ready' || staged?.status === 'photo') && !sending && staged?.status !== 'reading';

  // web: Enter sends, Shift+Enter is a new line
  const onKeyPress = (e: { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault?.();
      send();
    }
  };

  return (
    <OverlayShell
      visible={visible}
      title="DIALOGUE_LINK"
      onClose={onClose}
      black
      footer={
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.dock}>
            {!!error && (
              <View style={styles.error}>
                <Mono style={styles.errorText}>{error}</Mono>
                <Pressable onPress={() => setError(null)} hitSlop={8}><Mono style={styles.errorText}>✕</Mono></Pressable>
              </View>
            )}
            <View style={[styles.composer, focused && styles.composerFocused]}>
              {staged && <StagedFile staged={staged} onRemove={() => { reading.current++; setStaged(null); }} />}
              <TextInput
                value={draft}
                onChangeText={(t) => { setDraft(t); if (error) setError(null); }}
                onSubmitEditing={() => { if (Platform.OS !== 'web') send(); }}
                onKeyPress={onKeyPress as never}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                editable={staged?.status !== 'reading'}
                placeholder={mic ? 'listening…' : staged?.status === 'reading' ? 'Reading your file first…' : staged ? 'Ask about this file…' : 'Message WYRD'}
                placeholderTextColor={colors.greenBorder}
                style={styles.input}
                multiline
                blurOnSubmit={Platform.OS !== 'web'}
                returnKeyType="send"
              />
              <View style={styles.toolRow}>
                <Tool label="Voice input" glyph="mic" on={mic} onPress={toggleMic} />
                <Tool label="Show WYRD a photo" glyph="camera" onPress={openCamera} disabled={sending} />
                <Tool label="Attach a file" glyph="attach" on={!!staged} onPress={attachFile} disabled={sending} />
                <Mono style={styles.hint} numberOfLines={1}>
                  {Platform.OS === 'web' ? 'enter to send · shift+enter new line' : ''}
                </Mono>
                <Pressable onPress={() => send()} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.sendBtnOff]} accessibilityLabel="Send">
                  <Glyph name="send" size={17} color={colors.onSignal} active={canSend} style={{ transform: [{ rotate: '-90deg' }] }} />
                </Pressable>
              </View>
            </View>
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
          <View style={styles.presenceTop}>
            <Display style={styles.presenceName}>WYRD</Display>
            <View style={styles.liveDot} />
            <Mono style={styles.presenceMood}>{mind?.mood ?? 'online'}</Mono>
          </View>
          <Mono numberOfLines={1} style={styles.presenceSub}>
            {mind?.focusTopic ? `thinking about ${mind.focusTopic}` : 'always thinking'}
          </Mono>
        </View>
        <View style={styles.privatePill}>
          <Glyph name="lock" size={11} color={colors.greenDim} />
          <Mono style={styles.privateText}>PRIVATE</Mono>
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
        {turns.length === 0 && !pending && (
          <View style={styles.empty}>
            <View style={styles.emptyFace}>
              <FaceMark mode="scan" />
            </View>
            <Display style={styles.emptyTitle}>Say something.</Display>
            <Mono style={styles.emptyText}>A private thread, just you and WYRD. It remembers what you tell it — and you can hand it a file to read with you.</Mono>
            <View style={styles.cards}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s.text} onPress={() => send(s.text)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.card, (pressed || hovered) && styles.cardOn]}>
                  <Mono style={styles.cardTag}>{s.tag}</Mono>
                  <Mono style={styles.cardText}>{s.text}</Mono>
                  <Mono style={styles.cardArrow}>↗</Mono>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {turns.map((t, i) => {
          const prev = turns[i - 1];
          const newDay = !prev || dayKey(prev.timestamp) !== dayKey(t.timestamp);
          return (
            <View key={`${t.timestamp}-${i}`} style={styles.turn}>
              {newDay && <DayRule iso={t.timestamp} />}
              {t.userText ? <Mine text={t.userText} at={t.timestamp} /> : null}
              {t.botText ? <Reply text={t.botText} at={t.timestamp} recalled={fromMemory.has(t.botText)} judged={judged.get(t.botText)} turnId={t.id} rating={t.rating ?? null} /> : null}
            </View>
          );
        })}

        {pending && (
          <View style={styles.turn}>
            <Mine text={pending.text} at={pending.at} />
            <Thinking reading={ATTACHED.test(pending.text)} />
          </View>
        )}
      </ScrollView>
    </OverlayShell>
  );
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toDateString();
}

function DayRule({ iso }: { iso: string }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const label = d.toDateString() === today.toDateString() ? 'TODAY'
    : d.toDateString() === yesterday.toDateString() ? 'YESTERDAY'
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  return (
    <View style={styles.dayRule}>
      <View style={styles.dayLine} />
      <Mono style={styles.dayText}>{label}</Mono>
      <View style={styles.dayLine} />
    </View>
  );
}

function Tool({ label, glyph, on, disabled, onPress }: { label: string; glyph: GlyphName; on?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tool, hovered && styles.toolHover, on && styles.toolOn, disabled && { opacity: 0.35 }]}
    >
      <Glyph name={glyph} size={18} color={on ? colors.onSignal : colors.greenDim} active={on} />
    </Pressable>
  );
}


function kindLabel(name: string, kind: string) {
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : kind.toUpperCase();
  return ext.length <= 5 ? ext : kind.toUpperCase();
}

function FileGlyph({ label, inverse }: { label: string; inverse?: boolean }) {
  const ink = inverse ? colors.black : colors.green;
  return (
    <View style={styles.glyph}>
      <Svg width={30} height={36} viewBox="0 0 30 36" style={StyleSheet.absoluteFill}>
        <Path d="M1 1h19l9 9v25H1Z" stroke={ink} strokeWidth={1.2} fill="none" />
        <Path d="M20 1v9h9" stroke={ink} strokeWidth={1.2} fill="none" />
      </Svg>
      <Mono style={[styles.glyphText, { color: ink }]} numberOfLines={1}>{label}</Mono>
    </View>
  );
}

/** A small ring turning over the file glyph while it is read. */
function Spinner() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return (
    <Animated.View
      style={[styles.spinner, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
    />
  );
}

/** A bar sweeping across while the length of the work isn't known yet. */
function IndeterminateBar() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [x]);
  return <Animated.View style={[styles.barFill, { width: '35%', left: x.interpolate({ inputRange: [0, 1], outputRange: ['-35%', '100%'] }) }]} />;
}

function StagedFile({ staged, onRemove }: { staged: Staged; onRemove: () => void }) {
  if (staged.status === 'photo') {
    return (
      <View style={styles.staged}>
        <Image source={{ uri: staged.preview }} style={styles.photoThumb} resizeMode="cover" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Mono style={styles.stagedName} numberOfLines={1}>{staged.name}</Mono>
          <Mono style={[styles.stagedMeta, styles.stagedReady]} numberOfLines={1}>✓ photo · ask about it, or just send</Mono>
        </View>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove photo" style={styles.stagedX}>
          <Mono style={styles.stagedXText}>✕</Mono>
        </Pressable>
      </View>
    );
  }
  const reading = staged.status === 'reading';
  const name = reading ? staged.name : staged.doc.name;
  const meta = reading
    ? staged.total > 0 ? `reading page ${staged.done} of ${staged.total}…` : 'reading…'
    : [staged.doc.pages ? `${staged.doc.pages.toLocaleString()} page${staged.doc.pages === 1 ? '' : 's'}` : null, `${staged.doc.words.toLocaleString()} words`, 'ready — ask your question'].filter(Boolean).join(' · ');
  const pct = reading && staged.total > 0 ? staged.done / staged.total : null;
  return (
    <View style={styles.staged}>
      <View>
        <FileGlyph label={kindLabel(name, reading ? '' : staged.doc.kind)} />
        {reading && <Spinner />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Mono style={styles.stagedName} numberOfLines={1}>{name}</Mono>
        <Mono style={[styles.stagedMeta, !reading && styles.stagedReady]} numberOfLines={1}>{reading ? meta : `✓ ${meta}`}</Mono>
        {reading && (
          <View style={styles.bar}>
            {pct == null ? <IndeterminateBar /> : <View style={[styles.barFill, { width: `${Math.max(4, pct * 100)}%` }]} />}
          </View>
        )}
      </View>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove file" style={styles.stagedX}>
        <Mono style={styles.stagedXText}>✕</Mono>
      </Pressable>
    </View>
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

const Mine = React.memo(function Mine({ text, at }: { text: string; at: string }) {
  const m = text.match(ATTACHED);
  const file = m?.[1];
  const body = m ? text.slice(m[0].length) : text;
  return (
    <View style={styles.mineRow}>
      {file && (
        <View style={styles.mineFile}>
          <FileGlyph label={kindLabel(file, 'file')} inverse />
          <Mono style={styles.mineFileName} numberOfLines={2}>{file}</Mono>
        </View>
      )}
      {!!body && (
        <View style={styles.mine}>
          <Mono style={styles.mineText}>{body}</Mono>
        </View>
      )}
      <Mono style={styles.timeRight}>{timeLabel(at)}</Mono>
    </View>
  );
});

const Reply = React.memo(function Reply({ text, at, recalled, judged, turnId, rating }: { text: string; at: string; recalled?: boolean; judged?: string; turnId?: number; rating?: number | null }) {
  return (
    <View style={styles.theirsRow}>
      <View style={styles.avatar}>
        <FaceMark mode="scan" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Mono style={styles.who}>WYRD <Mono style={styles.whoTime}>{timeLabel(at)}</Mono></Mono>
        <View style={styles.theirs}>
          {splitCode(text).map((p, i) =>
            p.code ? (
              <View key={i} style={styles.code}>
                <View style={styles.codeHead}>
                  <Mono style={styles.codeLang}>{(p.lang ?? 'code').toUpperCase()}</Mono>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
                  <CodeText code={p.body} style={[styles.codeText, { fontFamily: fonts.code }]} />
                </ScrollView>
              </View>
            ) : (
              <RichText key={i} text={p.body} />
            ),
          )}
        </View>
        <View style={styles.metaRow}>
          {recalled && <Mono style={styles.badge}>↺ from memory · no AI call</Mono>}
          {judged && <Mono style={styles.badge}>⚖ {judged === 'softened' ? 'worth double-checking' : judged === 'corrected' ? 'corrected' : 'held back'}</Mono>}
          {turnId != null && <Thumbs turnId={turnId} initial={rating ?? null} />}
        </View>
      </View>
    </View>
  );
});

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
        <Mono style={styles.thumbText}>👍</Mono>
      </Pressable>
      <Pressable onPress={() => choose(-1)} accessibilityLabel="Unhelpful reply" style={[styles.thumb, rating === -1 && styles.thumbOn]}>
        <Mono style={styles.thumbText}>👎</Mono>
      </Pressable>
      {thanks && rating != null && <Mono style={styles.thanks}>{rating === 1 ? 'noted — WYRD will reuse this' : 'noted — WYRD will rethink this'}</Mono>}
    </View>
  );
}

/** Three dots rising in turn while WYRD composes its reply. */
function Thinking({ reading }: { reading?: boolean }) {
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
      <View style={styles.thinking}>
        {Platform.OS === 'web' ? <DustThinking width={58} height={20} /> : dots.map((d, i) => (
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
        <Mono style={styles.thinkingText}>{reading ? 'reading your file' : 'thinking'}</Mono>
      </View>
    </View>
  );
}

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  presence: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: HAIRLINE, borderBottomColor: colors.greenBorder,
  },
  presenceFace: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.green },
  presenceTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  presenceName: { fontSize: 24, lineHeight: 24, color: colors.green, letterSpacing: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  presenceMood: { fontSize: 10.5, letterSpacing: 1.2, color: colors.greenDim, textTransform: 'uppercase' },
  presenceSub: { marginTop: 2, fontSize: 11, color: colors.greenDim },
  privatePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  privateText: { fontSize: 8.5, letterSpacing: 1.6, color: colors.greenDim },

  thread: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 18, maxWidth: 780, width: '100%', alignSelf: 'center' },
  turn: { gap: 14 },

  dayRule: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  dayLine: { flex: 1, height: HAIRLINE, backgroundColor: colors.greenBorderDim },
  dayText: { fontSize: 9, letterSpacing: 2, color: colors.greenBorder },

  mineRow: { alignItems: 'flex-end', gap: 6 },
  mine: { maxWidth: '82%', backgroundColor: colors.signal, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 20, borderBottomRightRadius: 6 },
  mineText: { fontSize: 13.5, lineHeight: 21, color: colors.black },
  mineFile: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '82%', backgroundColor: colors.mint,
    paddingLeft: 10, paddingRight: 14, paddingVertical: 9, borderRadius: 14,
  },
  mineFileName: { flexShrink: 1, fontSize: 12.5, color: colors.black },
  timeRight: { fontSize: 9, color: colors.greenBorder },

  theirsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, maxWidth: '94%' },
  avatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.green, marginTop: 1 },
  who: { fontSize: 10, letterSpacing: 1.8, color: colors.green, marginBottom: 6 },
  whoTime: { fontSize: 9, letterSpacing: 0, color: colors.greenBorder },
  theirs: { borderLeftWidth: 2, borderLeftColor: colors.green, paddingLeft: 13, paddingVertical: 2, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 15 },
  badge: { fontSize: 9.5, color: colors.greenDim, borderWidth: HAIRLINE, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  thumbs: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  thumb: { borderWidth: 1, borderColor: 'transparent', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, opacity: 0.5 },
  thumbOn: { borderColor: colors.signal, opacity: 1 },
  thumbText: { fontSize: 11 },
  thanks: { fontSize: 9.5, color: colors.greenDim },

  code: { borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.codeBg },
  codeHead: { backgroundColor: colors.green, paddingHorizontal: 10, paddingVertical: 4 },
  codeLang: { fontSize: 9, letterSpacing: 1.8, color: colors.black },
  codeText: { fontSize: 12, lineHeight: 18, color: colors.green },

  thinking: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  thinkingText: { marginLeft: 6, fontSize: 10.5, letterSpacing: 1, color: colors.greenDim },

  empty: { alignItems: 'center', paddingTop: 28, gap: 8 },
  emptyFace: { width: 84, height: 84, borderRadius: 42, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.green, marginBottom: 8 },
  emptyTitle: { fontSize: 36, color: colors.green },
  emptyText: { fontSize: 12, lineHeight: 19, color: colors.greenDim, textAlign: 'center', maxWidth: 340 },
  cards: { marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, width: '100%' },
  card: {
    flexGrow: 1, flexBasis: 200, maxWidth: 360, minHeight: 78, borderWidth: 1, borderColor: colors.greenBorderDim,
    borderRadius: 14, padding: 12, gap: 6,
  },
  cardOn: { borderColor: colors.signal, backgroundColor: colors.signalSoft },
  cardTag: { fontSize: 8.5, letterSpacing: 2, color: colors.greenBorder },
  cardText: { fontSize: 12.5, lineHeight: 18, color: colors.mint, paddingRight: 16 },
  cardArrow: { position: 'absolute', right: 12, top: 10, fontSize: 12, color: colors.greenBorder },

  dock: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6, maxWidth: 804, width: '100%', alignSelf: 'center' },
  error: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.danger,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  errorText: { flexShrink: 1, fontSize: 11, color: colors.danger },
  composer: {
    borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 20, backgroundColor: '#FFFAF2',
    paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, boxShadow: '0 6px 24px rgba(42,31,23,0.07)',
  } as object,
  composerFocused: { borderColor: colors.signal },
  input: {
    minHeight: 40, maxHeight: 140, paddingHorizontal: 8, paddingVertical: 8,
    color: colors.green, fontFamily: 'ShareTechMono_400Regular', fontSize: 14, outlineStyle: 'none',
  } as object,
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tool: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  toolHover: { backgroundColor: 'rgba(42,31,23,0.05)' },
  toolOn: { backgroundColor: colors.signal },
  hint: { flex: 1, textAlign: 'right', fontSize: 9, color: colors.greenBorderDim, marginRight: 8 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.signal, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.2 },

  staged: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 2, marginTop: 2, marginBottom: 2,
    borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 12, padding: 8, backgroundColor: '#FAF3E8',
  },
  stagedName: { fontSize: 12.5, color: colors.mint },
  stagedMeta: { marginTop: 2, fontSize: 10, color: colors.greenDim },
  stagedX: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.greenBorderDim },
  stagedXText: { fontSize: 10, color: colors.greenDim },
  photoThumb: { width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderColor: colors.greenBorderDim },
  stagedReady: { color: colors.signal },
  spinner: {
    position: 'absolute', right: -5, bottom: -3, width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: colors.greenBorderDim, borderTopColor: colors.signal, backgroundColor: '#FAF3E8',
  },
  bar: { marginTop: 6, height: 3, borderRadius: 2, backgroundColor: colors.greenBorderDim, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: colors.signal },
  glyph: { width: 30, height: 36, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
  glyphText: { fontSize: 7.5, letterSpacing: 0.6 },
});
