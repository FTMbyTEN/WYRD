import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// The Web Speech API isn't in the DOM typings; this is the slice we use.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'microphone permission denied',
  'service-not-allowed': 'microphone permission denied',
  'no-speech': "didn't catch anything — try again",
  'audio-capture': 'no microphone found',
  network: 'speech recognition needs a connection',
};

/**
 * Real speech-to-text for the DIALOGUE_LINK mic, via the browser's speech recognition.
 * `onText` gets the running transcript (interim words included) so the message box fills as
 * you speak; `onFinal` fires once when you stop talking. On native, `supported` is false.
 */
export function useSpeechInput({ onText, onFinal }: { onText: (text: string) => void; onFinal: (text: string) => void }) {
  const Ctor = recognitionCtor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const transcript = useRef('');
  const handlers = useRef({ onText, onFinal });
  handlers.current = { onText, onFinal };

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    if (!Ctor || rec.current) return;
    setError(null);
    transcript.current = '';
    const r = new Ctor();
    r.lang = navigator.language || 'en-US';
    r.interimResults = true;
    r.continuous = false; // one utterance; ends on a pause
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      transcript.current = text.trim();
      handlers.current.onText(transcript.current);
    };
    r.onerror = (e) => { if (e.error !== 'aborted') setError(ERRORS[e.error] ?? `voice input failed (${e.error})`); };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      if (transcript.current) handlers.current.onFinal(transcript.current);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      setError('voice input could not start');
    }
  }, [Ctor]);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported: !!Ctor, listening, error, start, stop, clearError: () => setError(null) };
}
