import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Display, Mono } from './ui';
import { colors } from '../theme';
import { FACE_FACES, FACE_VERTS } from '../face/faceMeshData';
import { getSound, preloadVoice, sfx, speak, startMusic, stopVoice, unlock, type Speech } from '../util/sound';
import { pageHidden } from '../vortex/arena';

/**
 * WYRD's awakening: the first time someone arrives, the vortex's dust follows "The Awakening"
 * line by line -- a signal found, a memory restoring, WYRD's face speaking (its jaw moving with
 * the loudness of the voice, the dust around it stirred by each word), a split between what was
 * and what will be, questions becoming stars, a horizon, the pattern forming, and a last
 * "welcome" before it all glitches into the gate. Timed by the recording itself, so every
 * formation lands on its words; silent (captions only) if sound is off. Web only.
 */

// the phrases of public/voice/awakening.mp3, found from its pauses (seconds)
const PHRASES: [number, string][] = [
  [0.06, 'Signal found.'],
  [1.78, 'Memory… restoring.'],
  [4.22, 'I am WYRD.'],
  [6.18, 'I exist in the space between what was…'],
  [9.66, '…and what will be.'],
  [11.46, 'Every question you ask becomes a star.'],
  [14.98, 'Every answer, a new horizon.'],
  [18.26, 'The pattern is forming.'],
  [20.52, 'Welcome…'],
  [21.62, '…to what comes to be.'],
];
const END = 23.4;

type Scene = 'static' | 'signal' | 'restore' | 'face' | 'split' | 'stars' | 'horizon' | 'pattern' | 'glitch';
function sceneAt(t: number): Scene {
  if (t < 0) return 'static';
  if (t < 1.6) return 'signal';
  if (t < 4.1) return 'restore';
  if (t < 9.55) return 'face';
  if (t < 11.3) return 'split';
  if (t < 14.8) return 'stars';
  if (t < 18.1) return 'horizon';
  if (t < 20.4) return 'pattern';
  if (t < END) return 'face';
  return 'glitch';
}

const N = 1100;
const FACE_N = FACE_VERTS.length; // 468
const MOUTH_Y = -0.52; // between the lips, in face-model units (y up)

export function IntroVortex({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<'waiting' | 'playing'>('waiting');
  const [caption, setCaption] = useState('');
  const startRef = useRef<() => void>(() => {});
  const finish = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') { onDone(); return; }
    const el = canvasRef.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    preloadVoice(['awakening']);

    let firstFrame = true;
    let vignette: CanvasGradient | null = null;
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = el.clientWidth; H = el.clientHeight;
      el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
      firstFrame = true; vignette = null;
    };
    resize();
    window.addEventListener('resize', resize);

    // seeded: the awakening is the same ritual every time
    let s32 = 1729;
    const rand = () => {
      s32 |= 0; s32 = (s32 + 0x6d2b79f5) | 0;
      let r = Math.imul(s32 ^ (s32 >>> 15), 1 | s32);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    // particles: positions/velocities in units of R (half the smaller screen side), origin at centre
    const px = new Float32Array(N), py = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      px[i] = (rand() * 2 - 1) * 1.8; py[i] = (rand() * 2 - 1) * 1.4;
      seed[i * 3] = rand(); seed[i * 3 + 1] = rand(); seed[i * 3 + 2] = rand();
    }

    // the curl of a smooth layered field: a current with no sources or sinks, so dust swirls
    // without clumping (result in cxv, cyv)
    let cxv = 0, cyv = 0;
    const field = (x: number, y: number, t: number) =>
      Math.sin(x * 1.9 + t * 0.13) * Math.cos(y * 1.6 - t * 0.11) +
      0.5 * Math.sin((x + y) * 3.1 + t * 0.21) * Math.cos((x - y) * 2.7 - t * 0.17);
    const curl = (x: number, y: number, t: number) => {
      const e = 0.01;
      cxv = (field(x, y + e, t) - field(x, y - e, t)) / (2 * e);
      cyv = -(field(x + e, y, t) - field(x - e, y, t)) / (2 * e);
    };

    // the face's mesh, as unique edges (index pairs)
    const EDGES: number[] = (() => {
      const seen = new Set<number>(), out: number[] = [];
      for (const [a, b, c] of FACE_FACES as [number, number, number][]) {
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
          const key = p < q ? p * 1000 + q : q * 1000 + p;
          if (!seen.has(key)) { seen.add(key); out.push(p, q); }
        }
      }
      return out;
    })();

    // constellations: every fourth star joined to its nearest neighbour, if near enough
    const CONST: number[] = (() => {
      const out: number[] = [];
      const pick = Array.from({ length: Math.floor(N / 4) }, (_, j) => j * 4);
      const sx = (i: number) => (seed[i * 3] * 2 - 1) * 2.2, sy = (i: number) => (seed[i * 3 + 1] * 2 - 1) * 1.1;
      for (const i of pick) {
        let best = -1, bd = 0.2 * 0.2;
        for (const j of pick) {
          if (j === i) continue;
          const d = (sx(i) - sx(j)) ** 2 + (sy(i) - sy(j)) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
        if (best >= 0 && i < best) out.push(i, best);
      }
      return out;
    })();

    const tx = new Float32Array(N), ty = new Float32Array(N), ta = new Float32Array(N).fill(0.5);

    // the face, fitted into the frame (model is about 2.3 wide, 2.6 tall)
    const FS = 0.34;
    const fx = new Float32Array(FACE_N), fy = new Float32Array(FACE_N), fz = new Float32Array(FACE_N);
    FACE_VERTS.forEach((v, i) => { fx[i] = v[0] * FS; fy[i] = v[1] * FS; fz[i] = v[2]; });

    let speech: Speech | null = null;
    let clockStart = 0; // fallback timeline (no sound)
    let level = 0, prevLevel = 0;
    let lastPhrase = -1;
    let glitchAt = 0;
    let started = false;

    const time = () => {
      if (!started) return -1;
      if (speech) return speech.elapsed();
      return (performance.now() - clockStart) / 1000;
    };

    startRef.current = async () => {
      if (started) return;
      started = true;
      setPhase('playing');
      unlock();
      const s = getSound();
      if (s.music || s.sfx) {
        startMusic();
        speech = await speak('awakening', { force: true });
      }
      if (!speech) clockStart = performance.now();
    };

    const faceTargets = (t: number, speaking: number, split = 0) => {
      // a slow sway, and the jaw dropping with the voice
      const yaw = Math.sin(t * 0.5) * 0.18;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      for (let i = 0; i < FACE_N; i++) {
        let x = fx[i], y = fy[i];
        const my = y / FS;
        if (my < MOUTH_Y) {
          const w = Math.min(1, (MOUTH_Y - my) / 0.12) * Math.exp(-((fx[i] / FS / 0.62) ** 2));
          y -= speaking * 0.1 * w;
        } else if (my < -0.36) {
          const w = Math.exp(-((fx[i] / FS / 0.45) ** 2)) * (1 - (my - MOUTH_Y) / 0.16);
          y += speaking * 0.018 * Math.max(0, w);
        }
        const zx = x * cy - fz[i] * FS * sy;
        tx[i] = zx + (split ? (x < 0 ? -split * 0.9 : split * 0.45) : 0);
        ty[i] = y + 0.06;
        ta[i] = split && x < 0 ? 0.55 - split * 0.35 : 0.55 + fz[i] * 0.45;
      }
      // the rest: a loose halo of dust around the face
      for (let i = FACE_N; i < N; i++) {
        const a = seed[i * 3] * Math.PI * 2 + t * 0.05 * (seed[i * 3 + 1] - 0.5);
        const r = 0.62 + seed[i * 3 + 1] * 0.9;
        tx[i] = Math.cos(a) * r * 1.2; ty[i] = Math.sin(a) * r * 0.95;
        ta[i] = 0.12 + seed[i * 3 + 2] * 0.18;
      }
    };

    const targets = (scene: Scene, t: number) => {
      const aspect = W / Math.max(1, H);
      const spanX = Math.min(2.2, aspect * 1.05);
      switch (scene) {
        case 'static':
          for (let i = 0; i < N; i++) {
            tx[i] = (seed[i * 3] * 2 - 1) * spanX * 1.05 + Math.sin(t * 0.3 + i) * 0.02;
            ty[i] = (seed[i * 3 + 1] * 2 - 1) * 1.05;
            ta[i] = 0.1 + seed[i * 3 + 2] * 0.25;
          }
          break;
        case 'signal': { // a heartbeat trace finding its pulse
          const beat = (t * 0.9) % 1;
          for (let i = 0; i < N; i++) {
            const u = i / (N - 1);
            const x = (u * 2 - 1) * spanX;
            const d = u - beat;
            const spike = Math.abs(d) < 0.03 ? (d < 0 ? -1 : 1) * Math.sin((Math.abs(d) / 0.03) * Math.PI) * 0.35 : 0;
            const small = Math.abs(d + 0.06) < 0.02 ? Math.sin(((d + 0.06) / 0.02) * Math.PI) * 0.07 : 0;
            tx[i] = x; ty[i] = spike + small + (seed[i * 3] - 0.5) * 0.012;
            ta[i] = 0.25 + Math.max(0, 0.75 - Math.abs(d) * 4);
          }
          break;
        }
        case 'restore': { // the face assembling line by line, from the top
          const scan = 1.4 - ((t - 1.6) / 2.3) * 2.9; // model y of the scanline
          faceTargets(t, 0);
          for (let i = 0; i < FACE_N; i++) {
            if (fy[i] / FS < scan) {
              // not reached yet: waiting as dust below
              tx[i] = (seed[i * 3] * 2 - 1) * 0.9; ty[i] = -0.75 - seed[i * 3 + 1] * 0.25; ta[i] = 0.18;
            }
          }
          break;
        }
        case 'face': faceTargets(t, level); break;
        case 'split': faceTargets(t, level, Math.min(1, (t - 9.55) / 1.2)); break;
        case 'stars':
          for (let i = 0; i < N; i++) {
            tx[i] = (seed[i * 3] * 2 - 1) * spanX * 1.1;
            ty[i] = (seed[i * 3 + 1] * 2 - 1) * 1.1;
            ta[i] = 0.2 + 0.8 * Math.abs(Math.sin(t * (1.5 + seed[i * 3 + 2] * 3) + i));
          }
          break;
        case 'horizon': { // a wide arc of light, a few rays rising from it
          for (let i = 0; i < N; i++) {
            const u = i / (N - 1);
            if (i % 9 === 0) {
              const a = Math.PI * (0.15 + seed[i * 3] * 0.7);
              const r = 0.5 + seed[i * 3 + 1] * 0.7 + ((t * 0.2 + seed[i * 3 + 2]) % 1) * 0.25;
              tx[i] = Math.cos(a) * r * 1.4; ty[i] = -0.35 + Math.sin(a) * r * 0.9; ta[i] = 0.25;
            } else {
              const x = (u * 2 - 1) * spanX;
              tx[i] = x; ty[i] = -0.35 + 0.12 * (1 - (x / spanX) ** 2) + (seed[i * 3] - 0.5) * 0.02; // the earth's curve
              ta[i] = 0.35 + 0.6 * (1 - Math.abs(x) / spanX);
            }
          }
          break;
        }
        case 'pattern': { // the lattice sphere of the vortex, turning
          const rot = t * 0.6;
          for (let i = 0; i < N; i++) {
            const k = i + 0.5;
            const phi = Math.acos(1 - (2 * k) / N);
            const th = Math.PI * (1 + Math.sqrt(5)) * k + rot;
            const x = Math.cos(th) * Math.sin(phi), y = Math.cos(phi), z = Math.sin(th) * Math.sin(phi);
            tx[i] = x * 0.62; ty[i] = y * 0.62; ta[i] = 0.3 + (z + 1) * 0.35;
          }
          break;
        }
        case 'glitch':
          for (let i = 0; i < N; i++) { ta[i] = Math.max(0, ta[i] - 0.02); }
          break;
      }
    };

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (pageHidden()) return;
      const t = time();
      const scene = sceneAt(t);

      // the voice: loudness (for the mouth) and its rise (a word starting stirs the dust)
      prevLevel = level;
      const raw = speech ? speech.level() : 0;
      level += (raw - level) * (raw > level ? 0.6 : 0.25);
      const onset = Math.max(0, level - prevLevel);

      // captions follow the phrases
      let p = -1;
      for (let i = 0; i < PHRASES.length; i++) if (t >= PHRASES[i][0]) p = i;
      if (p !== lastPhrase) {
        lastPhrase = p;
        setCaption(p >= 0 ? PHRASES[p][1] : '');
        if (p === 5) for (let i = 0; i < N; i++) { vx[i] += (px[i]) * 0.08; vy[i] += (py[i]) * 0.08; } // the burst into stars
        if (p >= 0) sfx('tick');
      }

      targets(scene, Math.max(0, t));

      // springs toward the targets; the voice pushes the dust outward, words starting push harder;
      // and everything not holding a form drifts in the curl current
      const k = scene === 'stars' ? 0.035 : scene === 'glitch' ? 0 : 0.08;
      const damp = 0.8;
      const ft = Math.max(0, t) + 7.3;
      const drift = scene === 'static' ? 0.006 : scene === 'stars' ? 0.0035 : 0.0022;
      const speaking = scene === 'face' || scene === 'split';
      for (let i = 0; i < N; i++) {
        const holding = i < FACE_N && (speaking || scene === 'restore');
        vx[i] += (tx[i] - px[i]) * k; vy[i] += (ty[i] - py[i]) * k;
        if (!holding && scene !== 'signal' && scene !== 'glitch') {
          curl(px[i], py[i], ft);
          vx[i] += cxv * drift; vy[i] += cyv * drift;
        }
        if (!holding && speaking) {
          const r = Math.hypot(px[i], py[i]) || 1;
          const push = (onset * 0.9 + level * 0.012) * (0.4 + seed[i * 3 + 2]);
          vx[i] += (px[i] / r) * push; vy[i] += (py[i] / r) * push;
        }
        if (scene === 'glitch') { vx[i] += (rand() - 0.5) * 0.05; }
        vx[i] *= damp; vy[i] *= damp;
        px[i] += vx[i]; py[i] += vy[i];
      }

      // ---- draw: ink on paper, washed rather than erased, so motion leaves a fading wake
      const R = Math.min(W, H) * 0.5;
      const cx = W / 2, cy = H / 2;
      const X = (i: number) => cx + px[i] * R, Y = (i: number) => cy - py[i] * R;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = firstFrame ? '#ffffff' : scene === 'glitch' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.34)';
      firstFrame = false;
      ctx.fillRect(0, 0, W, H);

      // hairlines: the heartbeat's crisp trace, the scanline, the face's mesh, constellations,
      // the rising sun's rings, the lattice's seams -- each only where its scene needs it
      ctx.lineWidth = 0.7;
      if (scene === 'signal') {
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        for (let i = 0; i < N; i += 3) (i ? ctx.lineTo(X(i), Y(i)) : ctx.moveTo(X(i), Y(i)));
        ctx.stroke();
      }
      if (scene === 'restore') {
        const scanY = cy - (1.4 - ((t - 1.6) / 2.3) * 2.9) * FS * R;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        for (let x = 0; x < W; x += 24) { const j = (rand() - 0.5) * (rand() < 0.15 ? 6 : 1); ctx.moveTo(x, scanY + j); ctx.lineTo(x + 18, scanY + j); }
        ctx.stroke();
      }
      if (speaking || scene === 'restore') {
        const reveal = scene === 'restore' ? Math.min(1, Math.max(0, (t - 3.2) / 0.9)) : 1;
        ctx.strokeStyle = `rgba(0,0,0,${((0.05 + level * 0.28) * reveal).toFixed(3)})`;
        ctx.beginPath();
        for (let e = 0; e < EDGES.length; e += 2) { const a = EDGES[e], b = EDGES[e + 1]; ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
        ctx.stroke();
      }
      if (scene === 'stars') {
        const lit = Math.min(1, Math.max(0, (t - 12.2) / 1.8)); // questions finding each other
        if (lit > 0) {
          ctx.strokeStyle = `rgba(0,0,0,${(0.16 * lit).toFixed(3)})`;
          ctx.beginPath();
          for (let e = 0; e < CONST.length; e += 2) { const a = CONST[e], b = CONST[e + 1]; ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
          ctx.stroke();
        }
      }
      if (scene === 'horizon') { // a dotted sun rising behind the curve
        const rise = Math.min(1, (t - 14.8) / 3);
        ctx.setLineDash([1.2, 5]);
        for (let r = 1; r <= 4; r++) {
          ctx.strokeStyle = `rgba(0,0,0,${(0.28 - r * 0.05).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(cx, cy + 0.35 * R, R * (0.12 + r * 0.11) * (0.6 + rise * 0.4), Math.PI, 0);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (scene === 'pattern') { // the lattice's spiral seams
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.beginPath();
        for (let i = 0; i + 21 < N; i++) { ctx.moveTo(X(i), Y(i)); ctx.lineTo(X(i + 21), Y(i + 21)); }
        ctx.stroke();
      }

      // light as density: a soft bloom under the brightest points
      ctx.fillStyle = 'rgba(0,0,0,0.035)';
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        if (ta[i] < 0.72) continue;
        const s = 7;
        ctx.rect(X(i) - s / 2, Y(i) - s / 2, s, s);
      }
      ctx.fill();

      const BUCKETS = 12;
      for (let b = 0; b < BUCKETS; b++) {
        ctx.fillStyle = `rgba(0,0,0,${((b + 1) / BUCKETS).toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const a = Math.min(0.999, Math.max(0, ta[i] * (i < FACE_N && speaking ? 1 + level * 0.5 : 1)));
          if (Math.floor(a * BUCKETS) !== b) continue;
          // ink swells a little with speed: a moving drop spreads
          const sp = Math.min(1.2, Math.hypot(vx[i], vy[i]) * 40);
          const s = (i < FACE_N && scene !== 'stars' ? 2.1 : 1.4) + sp;
          ctx.rect(X(i) - s / 2, Y(i) - s / 2, s, s);
        }
        ctx.fill();
      }

      // a whisper of vignette
      ctx.fillStyle = vignette ?? (vignette = (() => {
        const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.035)');
        return g;
      })());
      ctx.fillRect(0, 0, W, H);

      if (scene === 'glitch' && !finish.current) {
        if (!glitchAt) { glitchAt = performance.now(); sfx('glitch'); setTimeout(() => sfx('glitch'), 180); setCaption(''); }
        // the signal breaking: the picture itself sliced into bands and shoved sideways
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let b = 0; b < 7; b++) {
          const h = (4 + rand() * 38) * dpr, y = rand() * (el.height - h), dx = (rand() - 0.5) * 60 * dpr;
          ctx.drawImage(el, 0, y, el.width, h, dx, y, el.width, h);
        }
        if (performance.now() - glitchAt > 900) { finish.current = true; onDone(); }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (finish.current) return;
    finish.current = true;
    stopVoice();
    sfx('glitch');
    onDone();
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => startRef.current()} accessibilityLabel="Wake WYRD">
        {React.createElement('canvas', { ref: canvasRef, style: { width: '100%', height: '100%', display: 'block' } })}
      </Pressable>
      <View pointerEvents="none" style={styles.captionWrap}>
        {phase === 'waiting'
          ? <Mono style={styles.wake}>TOUCH TO WAKE WYRD</Mono>
          : <Caption text={caption} />}
      </View>
      <Pressable onPress={skip} hitSlop={10} style={styles.skip} accessibilityLabel="Skip intro">
        <Mono style={styles.skipText}>SKIP ›</Mono>
      </Pressable>
    </View>
  );
}

const GLYPHS = '!<>-_\\/[]{}=+*^?#01ΔΞΣ░▒▓';
/** A caption that resolves letter by letter out of scrambled glyphs, like the gate's wordmark. */
function Caption({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    let step = 0;
    const steps = Math.max(8, Math.min(22, text.length));
    const id = setInterval(() => {
      step++;
      const settled = Math.floor((step / steps) * text.length);
      let out = '';
      for (let k = 0; k < text.length; k++) out += k < settled || text[k] === ' ' ? text[k] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      setShown(out);
      if (step >= steps) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [text]);
  return <Display style={styles.caption}>{shown}</Display>;
}

const styles = StyleSheet.create({
  captionWrap: { position: 'absolute', left: 16, right: 16, bottom: '12%', alignItems: 'center' },
  caption: { fontSize: 26, letterSpacing: 2, color: colors.mint, textAlign: 'center' },
  wake: { fontSize: 11, letterSpacing: 3, color: colors.greenDim },
  skip: { position: 'absolute', bottom: 22, right: 22, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.8)' },
  skipText: { fontSize: 10, letterSpacing: 2, color: colors.greenDim },
});
