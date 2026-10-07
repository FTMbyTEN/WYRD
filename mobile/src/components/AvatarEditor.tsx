import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Display, Mono } from './ui';
import { colors, fonts } from '../theme';

const VIEW = 260; // the crop circle, in px
const OUT = 320;  // the saved picture, square

type Loaded = { src: string; w: number; h: number };

/** Opens the file picker (web). Resolves with an object URL, or null if they cancelled. */
export function chooseImage(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/heic,image/*';
    input.onchange = () => { const f = input.files?.[0]; resolve(f ? URL.createObjectURL(f) : null); };
    input.click();
  });
}

/** An object URL for an image dropped onto [target], via [onFile]. Returns the cleanup. */
export function listenForDrop(target: HTMLElement | null, onFile: (url: string) => void, onHover: (on: boolean) => void) {
  if (!target) return () => {};
  const over = (e: DragEvent) => { e.preventDefault(); onHover(true); };
  const leave = () => onHover(false);
  const drop = (e: DragEvent) => {
    e.preventDefault(); onHover(false);
    const f = Array.from(e.dataTransfer?.files ?? []).find((x) => x.type.startsWith('image/'));
    if (f) onFile(URL.createObjectURL(f));
  };
  target.addEventListener('dragover', over); target.addEventListener('dragleave', leave); target.addEventListener('drop', drop);
  return () => { target.removeEventListener('dragover', over); target.removeEventListener('dragleave', leave); target.removeEventListener('drop', drop); };
}

/** The crop step: drag to place, zoom with the slider or the wheel, then save a square JPEG. */
export function AvatarEditor({ src, onCancel, onSave }: { src: string | null; onCancel: () => void; onSave: (dataUrl: string) => Promise<void> }) {
  const [img, setImg] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ zoom: 1, off: { x: 0, y: 0 }, img: null as Loaded | null });
  live.current = { zoom, off, img };

  useEffect(() => {
    setImg(null); setZoom(1); setOff({ x: 0, y: 0 });
    if (!src) return;
    Image.getSize(src, (w, h) => setImg({ src, w, h }), () => onCancel());
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // the picture covers the circle at zoom 1; offsets are clamped so no gap ever shows
  const base = img ? VIEW / Math.min(img.w, img.h) : 1;
  const clamp = (o: { x: number; y: number }, z: number, im: Loaded | null) => {
    if (!im) return o;
    const s = (VIEW / Math.min(im.w, im.h)) * z;
    const mx = Math.max(0, (im.w * s - VIEW) / 2), my = Math.max(0, (im.h * s - VIEW) / 2);
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) };
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = live.current.off; },
    onPanResponderMove: (_, g) => {
      const { zoom: z, img: im } = live.current;
      setOff(clamp({ x: start.current.x + g.dx, y: start.current.y + g.dy }, z, im));
    },
  })).current;

  const setZ = (z: number) => { const nz = Math.max(1, Math.min(4, z)); setZoom(nz); setOff((o) => clamp(o, nz, img)); };

  const save = async () => {
    if (!img || saving) return;
    setSaving(true);
    const s = base * zoom;
    const el = new window.Image();
    el.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      // the square under the circle, in the source image's pixels
      const side = VIEW / s;
      const sx = img.w / 2 - off.x / s - side / 2, sy = img.h / 2 - off.y / s - side / 2;
      ctx?.drawImage(el, sx, sy, side, side, 0, 0, OUT, OUT);
      try { await onSave(canvas.toDataURL('image/jpeg', 0.86)); } finally { setSaving(false); }
    };
    el.onerror = () => setSaving(false);
    el.src = img.src;
  };

  const w = img ? img.w * base * zoom : VIEW, h = img ? img.h * base * zoom : VIEW;
  return (
    <Modal visible={!!src} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Mono style={styles.eyebrow}>NEW PICTURE</Mono>
          <Display style={styles.title}>Place it just right</Display>
          <View
            style={styles.stage}
            {...pan.panHandlers}
            // @ts-expect-error web only: zoom with the wheel or a trackpad pinch
            onWheel={(e: WheelEvent) => setZ(live.current.zoom - e.deltaY * 0.002)}
          >
            {img ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image source={{ uri: img.src }}
                style={{ position: 'absolute', width: w, height: h, left: (VIEW - w) / 2 + off.x, top: (VIEW - h) / 2 + off.y }} /></View>
            ) : null}
            <View pointerEvents="none" style={styles.ring} />
          </View>
          <Mono style={styles.hint}>Drag to move · scroll to zoom</Mono>
          <View style={styles.zoomRow}>
            <Pressable onPress={() => setZ(zoom - 0.25)} hitSlop={8}><Mono style={styles.zoomBtn}>−</Mono></Pressable>
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e: { target: { value: string } }) => setZ(Number(e.target.value))}
              style={{ flex: 1, accentColor: colors.signal }} aria-label="Zoom" />
            <Pressable onPress={() => setZ(zoom + 0.25)} hitSlop={8}><Mono style={styles.zoomBtn}>+</Mono></Pressable>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.7 }]}>
              <Mono style={styles.ghostText}>Cancel</Mono>
            </Pressable>
            <Pressable onPress={save} disabled={!img || saving} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              <Mono style={styles.primaryText}>{saving ? 'Saving…' : 'Save picture'}</Mono>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(42,31,23,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.card, borderRadius: 26, padding: 24, gap: 12, alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.6, color: colors.signal },
  title: { fontSize: 30, lineHeight: 32, color: colors.mint },
  stage: { width: VIEW, height: VIEW, borderRadius: VIEW / 2, overflow: 'hidden', backgroundColor: colors.sand, marginTop: 6, cursor: 'grab' } as object,
  ring: { position: 'absolute', inset: 0, borderRadius: VIEW / 2, borderWidth: 3, borderColor: colors.signal } as object,
  hint: { fontSize: 11, color: colors.greenDim },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  zoomBtn: { fontSize: 22, color: colors.indigo, width: 22, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  ghost: { flex: 1, borderWidth: 1.5, borderColor: colors.greenBorder, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  ghostText: { fontSize: 14, color: colors.greenDim, fontFamily: fonts.bodyBold },
  primary: { flex: 1.4, backgroundColor: colors.signal, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  primaryText: { fontSize: 14, color: colors.onSignal, fontFamily: fonts.bodyBold },
});
