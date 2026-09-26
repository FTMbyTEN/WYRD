import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Display, Mono } from './ui';
import { colors } from '../theme';

const MAX_EDGE = 1280; // plenty for the vision model, keeps uploads well under the server cap

/** Opens the phone's camera (native) and resolves with one JPEG frame as base64, or null. */
export async function captureNative(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera permission denied');
  const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, cameraType: ImagePicker.CameraType.front });
  if (res.canceled || !res.assets[0]?.base64) return null;
  return res.assets[0].base64;
}

/**
 * Web camera sheet: the stream is requested only when the sheet opens, and every track is
 * stopped the moment a frame is captured or the sheet closes, so the camera light never stays on.
 */
export function WebCameraSheet({ visible, onClose, onCapture }: {
  visible: boolean;
  onClose: () => void;
  onCapture: (base64Jpeg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  };

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    let cancelled = false;
    setError(null);
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('camera not available in this browser');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
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

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const k = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * k);
    canvas.height = Math.round(v.videoHeight * k);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    stop(); // camera off the instant the frame is taken
    onCapture(base64);
  };

  const close = () => { stop(); onClose(); };

  if (Platform.OS !== 'web') return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Mono style={styles.label}>CAMERA · WYRD SEES ONE FRAME</Mono>
          <View style={styles.frame}>
            {React.createElement('video', {
              ref: videoRef,
              playsInline: true,
              muted: true,
              style: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', background: '#000' },
            })}
            {!ready && !error && <Mono style={styles.overlayText}>starting camera…</Mono>}
            {!!error && <Mono style={[styles.overlayText, { color: colors.danger }]}>{error}</Mono>}
          </View>
          <View style={styles.row}>
            <Pressable onPress={close} style={[styles.btn, styles.btnGhost]}>
              <Display style={styles.btnGhostText}>CANCEL</Display>
            </Pressable>
            <Pressable onPress={capture} disabled={!ready} style={[styles.btn, !ready && { opacity: 0.4 }]}>
              <Display style={styles.btnText}>CAPTURE</Display>
            </Pressable>
          </View>
          <Mono style={styles.note}>Anything typed in the message box goes along as your question.</Mono>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green, padding: 14, gap: 10 },
  label: { fontSize: 10, letterSpacing: 2, color: colors.greenDim },
  frame: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  overlayText: { position: 'absolute', color: '#fff', fontSize: 12, textAlign: 'center', padding: 16 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, backgroundColor: colors.green, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: colors.black, letterSpacing: 3, fontSize: 14 },
  btnGhost: { backgroundColor: colors.black, borderWidth: 1, borderColor: colors.green },
  btnGhostText: { color: colors.green, letterSpacing: 3, fontSize: 14 },
  note: { fontSize: 10, color: colors.greenDim },
});
