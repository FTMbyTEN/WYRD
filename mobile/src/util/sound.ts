import { Platform } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * WYRD's sound: interface effects made live with Web Audio (no files -- a few oscillators and some
 * filtered noise each), its recorded voice lines (public/voice, from ElevenLabs) played through an
 * ethereal chain -- reverb, a soft echo and a little air on top -- and the gate's music
 * (public/music). Web only for now; on native every call is a quiet no-op.
 *
 * Browsers allow sound only after the person touches the page, so nothing plays before the first
 * tap; [unlock] is called from that tap.
 */

export type Sfx = 'tick' | 'tab' | 'open' | 'close' | 'send' | 'receive' | 'alert' | 'error' | 'scan' | 'ready' | 'gateEnter' | 'glitch'
  | 'drip' | 'stretch' | 'inhale' | 'splash' | 'lock' | 'gather';
export type VoiceLine =
  | 'awakening' | 'gate-wyrd' | 'gate-what-comes' | 'gate-fate' | 'gate-welcome'
  | 'greet-first' | 'greet-morning' | 'greet-evening' | 'greet-return'
  | 'thinking' | 'file-received' | 'file-ready' | 'not-sure' | 'error'
  | 'drone-takeoff' | 'drone-enroute' | 'drone-delivered' | 'drone-home' | 'drone-abort' | 'goodbye';

// bump when files in public/voice or public/music change, so no cache serves the old ones
const ASSET_REV = '1';
// lines recorded quieter than the rest, lifted to match
const LINE_GAIN: Partial<Record<VoiceLine, number>> = { 'gate-fate': 1.55 };

export interface SoundSettings { sfx: boolean; music: boolean; voice: boolean }
const KEY = 'wyrd.sound';
const web = Platform.OS === 'web' && typeof window !== 'undefined';

function load(): SoundSettings {
  const d = { sfx: true, music: true, voice: false };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return d; }
}
let settings: SoundSettings = web ? load() : { sfx: false, music: false, voice: false };
const listeners = new Set<(s: SoundSettings) => void>();

export function getSound(): SoundSettings { return settings; }
export function setSound(patch: Partial<SoundSettings>) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode: just this session */ }
  listeners.forEach((l) => l(settings));
  if (patch.music === false) stopMusic();
  if (patch.music === true && musicWanted) startMusic();
  if (patch.voice === false) stopVoice();
}
/** The sound settings, live. */
export function useSound(): SoundSettings {
  const [s, set] = useState(settings);
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []);
  return s;
}

// ---- the graph: sfx and voice -> master; music -> its own gain (ducked under the voice) -> master
let ctx: AudioContext | null = null;
let master: GainNode;
let fxBus: GainNode;
let voiceIn: GainNode;
let musicGain: GainNode;
let reverb: ConvolverNode;

function graph(): AudioContext | null {
  if (!web) return null;
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.2;
  master.connect(limiter).connect(ctx.destination);

  // a long, dark, wide space: the "ethereal" in WYRD's voice, and the tail on some effects
  reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3.4, 2.6);
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.9;
  reverb.connect(verbOut).connect(master);

  fxBus = ctx.createGain(); fxBus.gain.value = 0.55;
  fxBus.connect(master);
  const fxSend = ctx.createGain(); fxSend.gain.value = 0.18;
  fxBus.connect(fxSend).connect(reverb);

  // voice: a little air on top, then dry + reverb + a soft high echo
  voiceIn = ctx.createGain();
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6500; air.gain.value = 4;
  const body = ctx.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 180; body.gain.value = 2;
  voiceIn.connect(air).connect(body);
  const dry = ctx.createGain(); dry.gain.value = 0.85;
  body.connect(dry).connect(master);
  const wet = ctx.createGain(); wet.gain.value = 0.42;
  body.connect(wet).connect(reverb);
  const echo = ctx.createDelay(1.0); echo.delayTime.value = 0.27;
  const echoHp = ctx.createBiquadFilter(); echoHp.type = 'highpass'; echoHp.frequency.value = 1400;
  const echoFb = ctx.createGain(); echoFb.gain.value = 0.32;
  const echoOut = ctx.createGain(); echoOut.gain.value = 0.16;
  body.connect(echo); echo.connect(echoHp).connect(echoFb).connect(echo); echoHp.connect(echoOut).connect(reverb); echoHp.connect(echoOut).connect(master);

  musicGain = ctx.createGain(); musicGain.gain.value = 0;
  musicGain.connect(master);
  return ctx;
}

function impulse(c: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const pre = Math.floor(c.sampleRate * 0.025); // a moment before the space answers
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (0.6 + 0.4 * Math.sin(i * 0.0007 + ch));
    }
  }
  return buf;
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** Call from the first touch: browsers keep audio off until the person interacts. */
export function unlock() {
  const c = graph();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// ---- effects -------------------------------------------------------------------------------------

type Env = { at: number; peak: number; attack?: number; hold?: number; release: number };
function env(g: GainNode, e: Env) {
  const a = e.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, e.at);
  g.gain.exponentialRampToValueAtTime(e.peak, e.at + a);
  g.gain.setValueAtTime(e.peak, e.at + a + (e.hold ?? 0));
  g.gain.exponentialRampToValueAtTime(0.0001, e.at + a + (e.hold ?? 0) + e.release);
}

function tone(c: AudioContext, o: { type?: OscillatorType; f0: number; f1?: number; at: number; dur: number; peak: number; attack?: number; to?: AudioNode; detune?: number }) {
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, o.at);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, o.at + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  env(g, { at: o.at, peak: o.peak, attack: o.attack, release: o.dur });
  osc.connect(g).connect(o.to ?? fxBus);
  osc.start(o.at);
  osc.stop(o.at + (o.attack ?? 0.004) + o.dur + 0.05);
}

function hiss(c: AudioContext, o: { at: number; dur: number; peak: number; type?: BiquadFilterType; f0: number; f1?: number; q?: number; attack?: number }) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.f0, o.at);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, o.at + o.dur);
  const g = c.createGain();
  env(g, { at: o.at, peak: o.peak, attack: o.attack ?? o.dur * 0.35, release: o.dur * 0.65 });
  src.connect(f).connect(g).connect(fxBus);
  src.start(o.at, Math.random() * 0.5);
  src.stop(o.at + o.dur + 0.05);
}

let lastTick = 0;
/** One interface sound. Cheap: a few nodes that free themselves when done. */
export function sfx(name: Sfx) {
  if (!settings.sfx) return;
  const c = graph();
  if (!c || c.state === 'closed') return; // a context still waking from the tap plays as soon as it's up
  const t = c.currentTime + 0.005;
  switch (name) {
    case 'tick': // a small glassy tick
      if (t - lastTick < 0.04) return;
      lastTick = t;
      tone(c, { f0: 2600, f1: 1900, at: t, dur: 0.035, peak: 0.12 });
      tone(c, { type: 'triangle', f0: 5200, at: t, dur: 0.012, peak: 0.03 });
      break;
    case 'tab': // a quick rising sweep with a harmonic shimmer
      tone(c, { f0: 520, f1: 1480, at: t, dur: 0.11, peak: 0.1 });
      tone(c, { type: 'triangle', f0: 1040, f1: 2960, at: t + 0.01, dur: 0.1, peak: 0.035 });
      break;
    case 'open': // an airlock opening: a rising breath over a low settle
      hiss(c, { at: t, dur: 0.34, peak: 0.16, f0: 350, f1: 3200, q: 0.9 });
      tone(c, { f0: 180, f1: 120, at: t, dur: 0.3, peak: 0.08 });
      tone(c, { f0: 1320, at: t + 0.16, dur: 0.18, peak: 0.03 });
      break;
    case 'close': // the same, closing
      hiss(c, { at: t, dur: 0.26, peak: 0.13, f0: 3000, f1: 380, q: 0.9 });
      tone(c, { f0: 140, f1: 90, at: t + 0.05, dur: 0.22, peak: 0.07 });
      break;
    case 'send': // an upward chirp, gone
      tone(c, { f0: 880, f1: 1980, at: t, dur: 0.09, peak: 0.09 });
      tone(c, { f0: 1760, f1: 3300, at: t + 0.05, dur: 0.07, peak: 0.04 });
      break;
    case 'receive': // two soft bell notes, slightly detuned, into the space
      for (const [f, dt] of [[1318.5, 0], [1975.5, 0.11]] as const) {
        tone(c, { f0: f, at: t + dt, dur: 0.55, peak: 0.07, attack: 0.006 });
        tone(c, { f0: f * 2.005, at: t + dt, dur: 0.3, peak: 0.018, detune: 6 });
      }
      break;
    case 'alert': // a clean three-note signal
      [1046.5, 1318.5, 1568].forEach((f, i) => tone(c, { type: 'square', f0: f, at: t + i * 0.09, dur: 0.08, peak: 0.025 }));
      [1046.5, 1318.5, 1568].forEach((f, i) => tone(c, { f0: f, at: t + i * 0.09, dur: 0.16, peak: 0.06 }));
      break;
    case 'error': { // a low, short, wavering buzz
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 98;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      const trem = c.createOscillator(); trem.frequency.value = 22;
      const tg = c.createGain(); tg.gain.value = 0.5;
      const g = c.createGain(); env(g, { at: t, peak: 0.13, attack: 0.01, hold: 0.12, release: 0.12 });
      trem.connect(tg).connect(g.gain);
      osc.connect(lp).connect(g).connect(fxBus);
      osc.start(t); trem.start(t); osc.stop(t + 0.3); trem.stop(t + 0.3);
      break;
    }
    case 'scan': // a scanning sweep, as a file is read
      hiss(c, { at: t, dur: 0.7, peak: 0.08, f0: 220, f1: 6000, q: 6 });
      tone(c, { type: 'triangle', f0: 300, f1: 2400, at: t, dur: 0.65, peak: 0.035 });
      break;
    case 'ready': // confirmation: a bright fifth
      tone(c, { f0: 1568, at: t, dur: 0.35, peak: 0.07 });
      tone(c, { f0: 2349, at: t + 0.07, dur: 0.4, peak: 0.055 });
      break;
    case 'gateEnter': { // a deep pulse opening into space
      tone(c, { f0: 72, f1: 34, at: t, dur: 1.4, peak: 0.5, attack: 0.01 });
      tone(c, { type: 'triangle', f0: 144, f1: 68, at: t, dur: 0.7, peak: 0.12 });
      hiss(c, { at: t, dur: 1.2, peak: 0.12, f0: 180, f1: 4200, q: 0.7, attack: 0.5 });
      tone(c, { f0: 2093, at: t + 0.35, dur: 1.1, peak: 0.025, attack: 0.3 });
      break;
    }
    case 'glitch': { // the wordmark breaking up: a few crushed digital fragments
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const at = t + i * (0.018 + Math.random() * 0.03);
        hiss(c, { at, dur: 0.018 + Math.random() * 0.02, peak: 0.05, type: 'bandpass', f0: 800 + Math.random() * 5000, q: 8, attack: 0.001 });
        if (Math.random() < 0.5) tone(c, { type: 'square', f0: 200 + Math.random() * 1600, at, dur: 0.015, peak: 0.02 });
      }
      break;
    }
    // ---- liquid metal -----------------------------------------------------------------------------
    case 'drip': { // a word leaving the surface: a rising metallic bloop with a tiny splash
      const f = 320 + Math.random() * 260;
      tone(c, { f0: f, f1: f * 2.6, at: t, dur: 0.09, peak: 0.07, attack: 0.003 });
      tone(c, { f0: f * 3.76, at: t + 0.02, dur: 0.22, peak: 0.012, detune: 9 }); // an inharmonic ring: metal, not water
      hiss(c, { at: t + 0.01, dur: 0.06, peak: 0.02, f0: 5200, q: 3, attack: 0.002 });
      break;
    }
    case 'stretch': // the drop pulled thin: a slow, low metallic strain
      hiss(c, { at: t, dur: 1.2, peak: 0.07, f0: 140, f1: 900, q: 5, attack: 0.6 });
      tone(c, { type: 'triangle', f0: 62, f1: 96, at: t, dur: 1.2, peak: 0.07, attack: 0.5 });
      tone(c, { f0: 740, f1: 1110, at: t + 0.2, dur: 1.0, peak: 0.012, attack: 0.5, detune: 7 });
      break;
    case 'inhale': // drawing in its breath: a reversed swell
      hiss(c, { at: t, dur: 0.5, peak: 0.1, f0: 4200, f1: 300, q: 0.9, attack: 0.45 });
      tone(c, { f0: 45, f1: 70, at: t, dur: 0.5, peak: 0.12, attack: 0.45 });
      break;
    case 'splash': { // bursting into droplets: a wet crack and a scatter of beads
      hiss(c, { at: t, dur: 0.35, peak: 0.16, f0: 2400, f1: 500, q: 0.8, attack: 0.004 });
      for (let i = 0; i < 14; i++) {
        const at = t + 0.04 + Math.random() * 0.9, f = 500 + Math.random() * 1400;
        tone(c, { f0: f, f1: f * 1.8, at, dur: 0.05 + Math.random() * 0.05, peak: 0.02 + Math.random() * 0.025, attack: 0.002 });
        tone(c, { f0: f * 2.76, at, dur: 0.15, peak: 0.005, detune: 11 });
      }
      break;
    }
    case 'lock': // the droplets locking into a lattice: a struck metal plate
      for (const [f, pk, d] of [[392, 0.05, 1.6], [392 * 2.76, 0.022, 1.1], [392 * 5.4, 0.01, 0.7], [392 * 8.93, 0.005, 0.4]] as const)
        tone(c, { f0: f, at: t, dur: d, peak: pk, attack: 0.002, detune: 4 });
      hiss(c, { at: t, dur: 0.05, peak: 0.04, f0: 6000, q: 2, attack: 0.001 });
      break;
    case 'gather': { // the drops flowing together into the gate: converging beads, a rising shimmer
      for (let i = 0; i < 10; i++) {
        const at = t + i * 0.08 + Math.random() * 0.05, f = 700 + i * 90;
        tone(c, { f0: f, f1: f * 1.6, at, dur: 0.06, peak: 0.018, attack: 0.002 });
      }
      hiss(c, { at: t, dur: 1.4, peak: 0.07, f0: 300, f1: 5000, q: 4, attack: 0.9 });
      tone(c, { f0: 523, f1: 1046, at: t + 0.3, dur: 1.2, peak: 0.02, attack: 0.8, detune: 5 });
      break;
    }
  }
}

/** A continuous liquid-metal bed under the intro: a low, viscous churn whose loudness and brightness follow the surface. */
export function liquidBed(): { set(amount: number, bright: number): void; stop(): void } | null {
  if (!settings.sfx) return null;
  const c = graph();
  if (!c || c.state === 'closed') return null;
  const src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7; bp.frequency.value = 180;
  const wob = c.createOscillator(); wob.frequency.value = 0.7; // the slow slosh
  const wobG = c.createGain(); wobG.gain.value = 60;
  wob.connect(wobG).connect(bp.frequency);
  const low = c.createOscillator(); low.frequency.value = 48;
  const lowG = c.createGain(); lowG.gain.value = 0.35;
  const g = c.createGain(); g.gain.value = 0.0001;
  src.connect(bp).connect(g); low.connect(lowG).connect(g);
  g.connect(fxBus);
  const t = c.currentTime;
  src.start(t); wob.start(t); low.start(t);
  return {
    set(amount, bright) {
      const now = c.currentTime;
      g.gain.setTargetAtTime(0.0001 + Math.max(0, Math.min(1, amount)) * 0.14, now, 0.25);
      bp.frequency.setTargetAtTime(160 + bright * 900, now, 0.3);
      low.frequency.setTargetAtTime(44 + bright * 30, now, 0.4);
    },
    stop() {
      const now = c.currentTime;
      g.gain.setTargetAtTime(0.0001, now, 0.3);
      for (const n of [src, wob, low]) n.stop(now + 1.5);
    },
  };
}

// ---- voice -------------------------------------------------------------------------------------

const buffers = new Map<VoiceLine, Promise<AudioBuffer | null>>();
let current: AudioBufferSourceNode | null = null;

function fetchLine(name: VoiceLine): Promise<AudioBuffer | null> {
  const c = graph();
  if (!c) return Promise.resolve(null);
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/voice/${name}.mp3?v=${ASSET_REV}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b))
      .catch(() => { buffers.delete(name); return null; });
    buffers.set(name, p);
  }
  return p;
}

/** Warm the lines likely to be needed soon, so they start without a gap. */
export function preloadVoice(names: VoiceLine[]) { names.forEach((n) => { void fetchLine(n); }); }

/**
 * Speaks one of WYRD's recorded lines through the ethereal chain. The short fixed lines are part
 * of the interface, so they follow the sound setting (the VOICE switch is for reading whole replies
 * aloud); [force] plays one regardless. Resolves when it has finished.
 */
export async function voice(name: VoiceLine, opts: { force?: boolean } = {}): Promise<void> {
  const s = await speak(name, opts);
  return s?.done;
}

/** A line being spoken: how loud it is right now (0..1, for a face to move its mouth to) and how
 *  far in it is, in seconds. */
export interface Speech {
  level: () => number;
  /** the voice's energy right now in three bands, 0..1: body (<300 Hz), voice (300-2k), air (2k+) */
  bands: () => [number, number, number];
  elapsed: () => number;
  done: Promise<void>;
}

/** Like [voice], but hands back the live speech -- its loudness and position -- as it starts. */
export async function speak(name: VoiceLine, opts: { force?: boolean } = {}): Promise<Speech | null> {
  if (!opts.force && !settings.sfx) return null;
  const c = graph();
  if (!c || c.state === 'closed') return null; // a context still waking from the tap plays as soon as it's up
  const buf = await fetchLine(name);
  if (!buf) return null;
  stopVoice();
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = LINE_GAIN[name] ?? 1;
  src.connect(g).connect(voiceIn);
  // a tap on the dry voice, for its loudness
  const analyser = c.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.35;
  g.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const freq = new Uint8Array(analyser.frequencyBinCount);
  duck(true);
  current = src;
  const startAt = c.currentTime + 0.02;
  const done = new Promise<void>((resolve) => {
    src.onended = () => {
      if (current === src) { current = null; duck(false); }
      analyser.disconnect();
      resolve();
    };
  });
  src.start(startAt);
  return {
    level: () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      return Math.min(1, Math.sqrt(sum / samples.length) * 5.5); // speech sits around 0.05-0.2 RMS
    },
    bands: () => {
      analyser.getByteFrequencyData(freq);
      const hz = c.sampleRate / analyser.fftSize; // per bin
      const band = (lo: number, hi: number) => {
        const a = Math.max(1, Math.floor(lo / hz)), b = Math.min(freq.length - 1, Math.ceil(hi / hz));
        let s = 0;
        for (let i = a; i <= b; i++) s += freq[i];
        return Math.min(1, s / ((b - a + 1) * 255) * 1.8);
      };
      return [band(60, 300), band(300, 2000), band(2000, 8000)];
    },
    elapsed: () => Math.max(0, c.currentTime - startAt),
    done,
  };
}

export function stopVoice() {
  if (current) { try { current.stop(); } catch { /* already ended */ } current = null; duck(false); }
}

// ---- music -------------------------------------------------------------------------------------

const MUSIC_LEVEL = 0.34;
const DUCKED = 0.11;
let musicEl: HTMLAudioElement | null = null;
let musicWanted = false;
let musicStarting = false;
// the gate plays one passage of The Great Flood, once: 2:03 to 3:03, fading out over its last seconds
const MUSIC_FROM = 123, MUSIC_TO = 183, MUSIC_FADE = 4;
let musicDone = false;
let ducked = false;

function duck(on: boolean) {
  ducked = on;
  if (!ctx || !musicEl || musicEl.paused) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(on ? DUCKED : MUSIC_LEVEL, ctx.currentTime, on ? 0.12 : 0.6);
}

/** The gate's music: fades in, loops, dips under WYRD's voice. */
export function startMusic() {
  musicWanted = true;
  if (!settings.music) return;
  const c = graph();
  if (!c) return;
  if (!musicEl) {
    musicEl = new Audio(`/music/great-flood.mp3?v=${ASSET_REV}`);
    musicEl.loop = false;
    musicEl.preload = 'auto';
    const el = musicEl;
    el.addEventListener('loadedmetadata', () => { if (el.currentTime < MUSIC_FROM) el.currentTime = MUSIC_FROM; });
    el.addEventListener('timeupdate', () => {
      if (musicDone || el.currentTime < MUSIC_TO - MUSIC_FADE) return;
      musicDone = true; // the passage is over: fade out and don't come back
      stopMusic(Math.max(0.5, MUSIC_TO - el.currentTime));
    });
    el.addEventListener('ended', () => { musicDone = true; });
    c.createMediaElementSource(musicEl).connect(musicGain);
  }
  if (musicDone) return; // it has played its passage
  if (musicEl.readyState >= 1 && musicEl.currentTime < MUSIC_FROM) musicEl.currentTime = MUSIC_FROM;
  if (!musicEl.paused || musicStarting) return; // already playing (or starting): leave its level alone
  musicStarting = true;
  musicEl.play().finally(() => { musicStarting = false; }).then(() => {
    musicGain.gain.cancelScheduledValues(c.currentTime);
    musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), c.currentTime);
    musicGain.gain.linearRampToValueAtTime(ducked ? DUCKED : MUSIC_LEVEL, c.currentTime + 3);
  }).catch(() => { /* not allowed yet: the next tap tries again */ });
}

/** Fades the music out (over [seconds]) and pauses it. */
export function stopMusic(seconds = 1.5, forget = false) {
  if (forget) musicWanted = false;
  if (!ctx || !musicEl || musicEl.paused) return;
  const el = musicEl;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
  setTimeout(() => { if (musicGain.gain.value < 0.01) el.pause(); }, seconds * 1000 + 100);
}
