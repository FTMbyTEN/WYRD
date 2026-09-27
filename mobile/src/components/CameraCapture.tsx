import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Display, Mono } from './ui';
import { api } from '../api/client';
import type { Sighting } from '../api/types';
import { timeAgo } from '../util/time';
import { colors } from '../theme';
import {
  describeForWyrd, distanceOf, expressionOf, gazeOf, loadTracker,
  type Edge, type FaceReading, type Pt, type Tracker,
} from '../util/faceTracking';

const MAX_EDGE = 1568; // the vision model's sweet spot: full detail without being downscaled
const STEADY_MS = 1500; // a face (or a new face count) must hold this long before it counts
const RETURN_AFTER_MS = 15000; // away at least this long, then back = "you came back"
const AUTO_GAP_MS = 45000; // at least this long between WYRD's own looks
const AUTO_MAX = 6; // own looks per opening, so the daily AI budget stays safe
const PENDING_TTL_MS = 10000; // a reason to look goes stale if it can't be acted on soon
const HUD = 'rgba(255,255,255,0.92)';
const HUD_DIM = 'rgba(255,255,255,0.35)';

/** Opens the phone's camera (native) and resolves with one JPEG frame as base64, or null. */
export async function captureNative(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera permission denied');
  const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, cameraType: ImagePicker.CameraType.front });
  if (res.canceled || !res.assets[0]?.base64) return null;
  return res.assets[0].base64;
}

type Readout = {
  faces: number;
  expression: string;
  gaze: string;
  distance: string;
  yaw: number;
  pitch: number;
  blinks: number;
  trackedSec: number;
  fps: number;
};

/**
 * OPTIC_LINK: WYRD's live view through the person's own webcam (web). Face tracking runs on
 * this device every frame and draws the HUD; WYRD itself only *looks* -- one frame plus the
 * tracking summary to the vision model -- when asked (LOOK) or once when you first appear (AUTO),
 * so the daily AI budget isn't drained by a stream. The stream is requested only while the sheet
 * is open and every track is stopped when it closes, so the camera light never stays on.
 */
export function WebCameraSheet({ visible, onClose, onLook }: {
  visible: boolean;
  onClose: () => void;
  onLook: (base64Jpeg: string, question: string, trackingNote: string) => Promise<string | null>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const facesRef = useRef<FaceReading[]>([]);
  const stats = useRef({ lockedAt: 0, blinks: 0, eyesShut: false, frames: 0, fpsAt: 0, fps: 0 });
  // WYRD's own looks: it looks when something happens (you appear, come back, or someone joins)
  const autoRef = useRef({ fired: 0, lastAt: 0, pending: null as string | null, pendingAt: 0, everSeen: false, lostAt: 0, count: 0, countSince: 0, stable: 0 });
  const [memory, setMemory] = useState<Sighting[]>([]);
  const [reason, setReason] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [trackerState, setTrackerState] = useState<'loading' | 'on' | 'off'>('loading');
  const [readout, setReadout] = useState<Readout | null>(null);
  const [question, setQuestion] = useState('');
  const [looking, setLooking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const lookingRef = useRef(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  };

  const frameBase64 = (): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const k = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height); // unmirrored: what the camera sees
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  };

  const refreshMemory = () => { api.sightings(3).then(setMemory).catch(() => {}); };

  const look = useCallback(async (q?: string, why?: string) => {
    if (lookingRef.current) return;
    const base64 = frameBase64();
    if (!base64) return;
    lookingRef.current = true;
    setLooking(true);
    const s = stats.current;
    const tracked = describeForWyrd(facesRef.current, s.lockedAt ? (performance.now() - s.lockedAt) / 1000 : 0, s.blinks);
    const note = why ? `why you looked on your own: ${why}; ${tracked}` : tracked;
    setReason(why ?? null);
    try {
      const reply = await onLook(base64, (q ?? question).trim(), note);
      if (reply) setSaid(reply);
      setQuestion('');
      refreshMemory();
    } finally {
      lookingRef.current = false;
      setLooking(false);
    }
  }, [onLook, question]);
  const lookRef = useRef(look);
  lookRef.current = look;

  // camera
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    let cancelled = false;
    setError(null);
    setSaid(null);
    setReason(null);
    autoRef.current = { fired: 0, lastAt: 0, pending: null, pendingAt: 0, everSeen: false, lostAt: 0, count: 0, countSince: 0, stable: 0 };
    refreshMemory();
    stats.current = { lockedAt: 0, blinks: 0, eyesShut: false, frames: 0, fpsAt: performance.now(), fps: 0 };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('camera not available in this browser');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        setError(`couldn't access the camera — ${(e as Error).message || 'permission denied'}`);
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [visible]);

  // tracker
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    let alive = true;
    setTrackerState('loading');
    loadTracker()
      .then((t) => { if (alive) { trackerRef.current = t; setTrackerState('on'); } })
      .catch(() => { if (alive) setTrackerState('off'); });
    return () => { alive = false; };
  }, [visible]);

  // per-frame tracking + HUD drawing; readouts pushed to React ~6x a second
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let lastPush = 0;
    let lastDetect = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      const cv = canvasRef.current;
      if (!v || !cv || !v.videoWidth) return;
      if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
      const now = performance.now();
      const s = stats.current;

      let faces = facesRef.current;
      const tr = trackerRef.current;
      // ~30 detections/s; a live stream's currentTime can sit at 0, so it can't gate new frames
      if (tr && now - lastDetect >= 30) {
        lastDetect = now;
        try { faces = tr.detect(v, now); } catch { faces = []; }
        facesRef.current = faces;
        s.frames++;
      }
      if (now - s.fpsAt > 1000) { s.fps = s.frames; s.frames = 0; s.fpsAt = now; }

      const main = faces[0];
      if (main) {
        if (!s.lockedAt) s.lockedAt = now;
        const shut = main.blink > 0.55;
        if (shut && !s.eyesShut) s.blinks++;
        s.eyesShut = shut;
      } else {
        s.lockedAt = 0;
      }

      drawHud(cv, faces, tr?.edges, now, !!tr);

      // what just happened in front of the camera, as a reason for WYRD to look
      const A = autoRef.current;
      const want = (why: string) => { A.pending = why; A.pendingAt = now; };
      if (main) {
        if (!A.everSeen) { A.everSeen = true; want('they appeared in front of the camera'); }
        else if (A.lostAt && now - A.lostAt > RETURN_AFTER_MS) want('they came back after being away');
        A.lostAt = 0;
      } else if (!A.lostAt) {
        A.lostAt = now;
      }
      if (faces.length !== A.count) { A.count = faces.length; A.countSince = now; }
      else if (now - A.countSince > STEADY_MS && A.count !== A.stable) {
        if (A.count > A.stable && A.stable >= 1) want('someone else joined them');
        A.stable = A.count;
      }
      if (A.pending && now - A.pendingAt > PENDING_TTL_MS) A.pending = null;
      const steady = main && s.lockedAt && now - s.lockedAt > STEADY_MS;
      if (auto && A.pending && steady && A.fired < AUTO_MAX && (A.fired === 0 || now - A.lastAt > AUTO_GAP_MS) && !lookingRef.current) {
        A.fired++;
        A.lastAt = now;
        const why = A.pending;
        A.pending = null;
        lookRef.current('', why);
      }

      if (now - lastPush > 160) {
        lastPush = now;
        setReadout({
          faces: faces.length,
          expression: main ? expressionOf(main) : '—',
          gaze: main ? gazeOf(main) : '—',
          distance: main ? distanceOf(main) : '—',
          yaw: main?.yaw ?? 0,
          pitch: main?.pitch ?? 0,
          blinks: s.blinks,
          trackedSec: s.lockedAt ? (now - s.lockedAt) / 1000 : 0,
          fps: s.fps,
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, auto]);

  const close = () => { stop(); onClose(); };

  if (Platform.OS !== 'web') return null;
  const locked = (readout?.faces ?? 0) > 0;
  const status = error ? 'NO SIGNAL'
    : !ready ? 'CONNECTING'
      : looking ? 'WYRD IS LOOKING'
        : trackerState === 'loading' ? 'LOADING TRACKER'
          : trackerState === 'off' ? 'LIVE · TRACKING UNAVAILABLE'
            : locked ? `TRACKING · ${readout!.faces} ${readout!.faces === 1 ? 'SUBJECT' : 'SUBJECTS'}` : 'SEARCHING';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={[styles.liveDot, ready && !error && styles.liveDotOn]} />
            <Display style={styles.title}>OPTIC_LINK</Display>
            <Mono style={styles.status} numberOfLines={1}>{status}</Mono>
            <Pressable onPress={close} style={styles.closeBtn} accessibilityLabel="Close camera">
              <Display style={styles.closeText}>✕</Display>
            </Pressable>
          </View>

          <View style={styles.frame}>
            {React.createElement('video', {
              ref: videoRef,
              playsInline: true,
              muted: true,
              style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', background: '#000' },
            })}
            {React.createElement('canvas', {
              ref: canvasRef,
              style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', pointerEvents: 'none' },
            })}
            <View pointerEvents="none" style={styles.scanlines} />

            {!ready && !error && <View style={styles.center}><ActivityIndicator color="#fff" /><Mono style={styles.centerText}>opening camera…</Mono></View>}
            {!!error && <View style={styles.center}><Mono style={[styles.centerText, { color: colors.danger }]}>{error}</Mono></View>}

            {ready && (
              <>
                <View style={[styles.panel, { top: 10, left: 10 }]} pointerEvents="none">
                  <Row k="SUBJECTS" v={String(readout?.faces ?? 0)} />
                  <Row k="EXPRESSION" v={readout?.expression ?? '—'} />
                  <Row k="GAZE" v={readout?.gaze ?? '—'} />
                  <Row k="RANGE" v={readout?.distance ?? '—'} />
                </View>
                <View style={[styles.panel, styles.panelRight, { top: 10, right: 10 }]} pointerEvents="none">
                  <Row k="YAW" v={locked ? `${readout!.yaw.toFixed(0)}°` : '—'} right />
                  <Row k="PITCH" v={locked ? `${readout!.pitch.toFixed(0)}°` : '—'} right />
                  <Row k="BLINKS" v={String(readout?.blinks ?? 0)} right />
                  <Row k="LOCK" v={locked ? `${readout!.trackedSec.toFixed(1)}s` : '—'} right />
                  <Row k="FPS" v={trackerState === 'on' ? String(readout?.fps ?? 0) : '—'} right />
                </View>
                {(said || looking) && (
                  <View style={styles.subtitle} pointerEvents="none">
                    <Mono style={styles.subtitleWho}>WYRD{reason ? ` · LOOKED BECAUSE ${reason.replace(/^they /, 'YOU ').replace(/^someone/, 'SOMEONE').toUpperCase()}` : ''}</Mono>
                    <Mono style={styles.subtitleText}>{looking && !said ? 'looking…' : said}</Mono>
                  </View>
                )}
              </>
            )}
          </View>

          {memory.length > 0 && (
            <View style={styles.memory}>
              <Mono style={styles.memoryLabel}>WYRD REMEMBERS SEEING YOU</Mono>
              {memory.slice(0, 2).map((m, i) => (
                <Mono key={i} style={styles.memoryLine} numberOfLines={2}>
                  <Mono style={styles.memoryWhen}>{timeAgo(m.timestamp)} · </Mono>{m.description}
                </Mono>
              ))}
            </View>
          )}

          <View style={styles.controls}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={() => look()}
              placeholder="Ask about what WYRD sees (optional)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.input}
              returnKeyType="send"
            />
            <Pressable onPress={() => look()} disabled={!ready || looking} style={[styles.lookBtn, (!ready || looking) && { opacity: 0.45 }]}>
              <Display style={styles.lookText}>{looking ? '…' : 'LOOK'}</Display>
            </Pressable>
          </View>
          <View style={styles.footer}>
            <Pressable onPress={() => setAuto((a) => !a)} style={styles.autoRow} accessibilityRole="switch" accessibilityState={{ checked: auto }}>
              <View style={[styles.check, auto && styles.checkOn]} />
              <Mono style={styles.footerText}>AUTO · WYRD looks when you appear, come back, or someone joins ({autoRef.current.fired}/{AUTO_MAX})</Mono>
            </Pressable>
            <Mono style={styles.footerText}>tracking runs on this device · WYRD sees a frame only when it looks</Mono>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({ k, v, right }: { k: string; v: string; right?: boolean }) {
  return (
    <View style={[styles.row, right && { justifyContent: 'flex-end' }]}>
      <Mono style={styles.rowK}>{k}</Mono>
      <Mono style={styles.rowV}>{v}</Mono>
    </View>
  );
}

// ---- HUD drawing (canvas is mirrored with the video, so text is un-flipped locally) ----

function drawHud(cv: HTMLCanvasElement, faces: FaceReading[], edges: Tracker['edges'] | undefined, now: number, tracking: boolean) {
  const g = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const u = Math.max(1, W / 640); // line scale
  g.clearRect(0, 0, W, H);

  // frame corners + centre ticks
  g.strokeStyle = HUD_DIM;
  g.lineWidth = 1.5 * u;
  const m = 18 * u, L = 34 * u;
  corners(g, m, m, W - 2 * m, H - 2 * m, L);
  g.beginPath();
  g.moveTo(W / 2, m); g.lineTo(W / 2, m + 10 * u);
  g.moveTo(W / 2, H - m); g.lineTo(W / 2, H - m - 10 * u);
  g.moveTo(m, H / 2); g.lineTo(m + 10 * u, H / 2);
  g.moveTo(W - m, H / 2); g.lineTo(W - m - 10 * u, H / 2);
  g.stroke();

  if (faces.length === 0) {
    if (!tracking) return;
    // searching reticle
    const r = Math.min(W, H) * 0.16;
    const a = (now / 900) % (Math.PI * 2);
    g.strokeStyle = HUD;
    g.lineWidth = 1.5 * u;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(W / 2, H / 2, r, a + (k * Math.PI) / 2, a + (k * Math.PI) / 2 + 0.7);
      g.stroke();
    }
    g.strokeStyle = HUD_DIM;
    g.beginPath();
    g.arc(W / 2, H / 2, r * 0.55, -a, -a + 4.2);
    g.stroke();
    // sweeping scan bar
    const y = ((now / 12) % (H - 2 * m)) + m;
    const grad = g.createLinearGradient(0, y - 40 * u, 0, y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.18)');
    g.fillStyle = grad;
    g.fillRect(m, y - 40 * u, W - 2 * m, 40 * u);
    return;
  }

  faces.forEach((f, i) => {
    const px = (p: Pt) => [p.x * W, p.y * H] as const;
    const main = i === 0;

    // mesh: sparse points
    g.fillStyle = main ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)';
    for (let k = 0; k < f.landmarks.length; k += 4) {
      const [x, y] = px(f.landmarks[k]);
      g.fillRect(x - 0.9 * u, y - 0.9 * u, 1.8 * u, 1.8 * u);
    }

    // features
    if (edges && main) {
      g.lineWidth = 1.3 * u;
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      for (const set of [edges.oval, edges.leftEye, edges.rightEye, edges.lips, edges.leftBrow, edges.rightBrow]) {
        path(g, f.landmarks, set, W, H);
      }
    }

    // bracket box with a slight breathing pulse
    const pad = 0.06 + 0.01 * Math.sin(now / 300);
    const bx = (f.box.x - f.box.w * pad) * W, by = (f.box.y - f.box.h * pad * 1.4) * H;
    const bw = f.box.w * (1 + 2 * pad) * W, bh = f.box.h * (1 + 2.8 * pad) * H;
    g.strokeStyle = HUD;
    g.lineWidth = (main ? 2.2 : 1.4) * u;
    corners(g, bx, by, bw, bh, Math.min(bw, bh) * 0.18);

    // nose crosshair + head-direction vector
    const nose = f.landmarks[1];
    if (nose) {
      const [nx, ny] = px(nose);
      g.lineWidth = 1.2 * u;
      g.beginPath();
      g.arc(nx, ny, 7 * u, 0, Math.PI * 2);
      g.moveTo(nx - 12 * u, ny); g.lineTo(nx - 4 * u, ny);
      g.moveTo(nx + 4 * u, ny); g.lineTo(nx + 12 * u, ny);
      g.stroke();
      if (main) {
        const len = bw * 0.5;
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.setLineDash([4 * u, 4 * u]);
        g.beginPath();
        g.moveTo(nx, ny);
        g.lineTo(nx - Math.sin(f.yaw / 57.3) * len, ny - Math.sin(f.pitch / 57.3) * len);
        g.stroke();
        g.setLineDash([]);
      }
    }

    // label (drawn un-mirrored)
    const label = `SUBJECT ${String(i + 1).padStart(2, '0')} · ${main ? expressionOf(f) : 'TRACKED'}`;
    g.save();
    g.translate(bx + bw, by - 8 * u);
    g.scale(-1, 1);
    g.font = `${Math.round(11 * u)}px "Share Tech Mono", monospace`;
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(-2 * u, -12 * u, tw + 8 * u, 16 * u);
    g.fillStyle = HUD;
    g.fillText(label, 2 * u, 0);
    g.restore();
  });
}

function corners(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, l: number) {
  g.beginPath();
  g.moveTo(x, y + l); g.lineTo(x, y); g.lineTo(x + l, y);
  g.moveTo(x + w - l, y); g.lineTo(x + w, y); g.lineTo(x + w, y + l);
  g.moveTo(x + w, y + h - l); g.lineTo(x + w, y + h); g.lineTo(x + w - l, y + h);
  g.moveTo(x + l, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - l);
  g.stroke();
}

function path(g: CanvasRenderingContext2D, lm: Pt[], set: Edge[], W: number, H: number) {
  g.beginPath();
  for (const e of set) {
    const a = lm[e.start], b = lm[e.end];
    if (!a || !b) continue;
    g.moveTo(a.x * W, a.y * H);
    g.lineTo(b.x * W, b.y * H);
  }
  g.stroke();
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', maxWidth: 900, backgroundColor: '#050505', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  liveDotOn: { backgroundColor: '#ff3b3b' },
  title: { color: '#fff', fontSize: 16, letterSpacing: 3 },
  status: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 2 },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  closeText: { color: '#fff', fontSize: 16 },
  frame: { width: '100%', aspectRatio: 16 / 10, maxHeight: '70vh' as unknown as number, backgroundColor: '#000', overflow: 'hidden' },
  scanlines: {
    ...StyleSheet.absoluteFill,
    backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)',
  } as object,
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  centerText: { color: '#fff', fontSize: 12, textAlign: 'center' },
  panel: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 6, gap: 2, minWidth: 130 },
  panelRight: { minWidth: 96 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  rowK: { color: 'rgba(255,255,255,0.5)', fontSize: 9, letterSpacing: 1.5 },
  rowV: { color: '#fff', fontSize: 10, letterSpacing: 1 },
  subtitle: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderLeftWidth: 2, borderLeftColor: '#fff' },
  subtitleWho: { color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: 2, marginBottom: 3 },
  subtitleText: { color: '#fff', fontSize: 13, lineHeight: 19 },
  controls: { flexDirection: 'row', gap: 8, padding: 10, paddingBottom: 6 },
  input: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', color: '#fff', paddingHorizontal: 10, paddingVertical: 9, fontFamily: 'ShareTechMono_400Regular', fontSize: 13 },
  lookBtn: { backgroundColor: '#fff', paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  lookText: { color: '#000', letterSpacing: 3, fontSize: 14 },
  footer: { paddingHorizontal: 10, paddingBottom: 10, gap: 4 },
  memory: { paddingHorizontal: 10, paddingTop: 10, gap: 3 },
  memoryLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 9, letterSpacing: 2 },
  memoryLine: { color: 'rgba(255,255,255,0.85)', fontSize: 11, lineHeight: 16 },
  memoryWhen: { color: 'rgba(255,255,255,0.45)', fontSize: 10 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { width: 10, height: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  checkOn: { backgroundColor: '#fff' },
  footerText: { color: 'rgba(255,255,255,0.45)', fontSize: 9, letterSpacing: 1 },
});
