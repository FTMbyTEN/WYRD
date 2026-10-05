import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import type { CharacterLook } from '../api/types';
import { loadCharacter, makeCastHero } from './cast';
import type { Person } from './people';

/**
 * The character creator: the first thing a new player sees in NAIJA 2099, before the intro. Their
 * character turns on a lit plinth (doing its idle) while they choose its build, skin tone, outfit
 * colour and neon trim, and the name the city will know them by. Drag the figure to turn it.
 *
 * Two bodies, TEN (a man) and Ama (a woman), on one skeleton -- so both move with the same
 * motion-captured clips; proportions, skin, outfit and neon are all changed live (in the
 * skeleton and the material), so every choice is free. New bodies slot in as more bases.
 */
type Choice<T> = { label: string; value: T };
const SCALE: Choice<number>[] = [{ label: 'LESS', value: -1 }, { label: '—', value: -0.5 }, { label: 'BASE', value: 0 }, { label: '+', value: 0.5 }, { label: 'MORE', value: 1 }];
const SKINS: { swatch: string; value: number }[] = [
  { swatch: '#2b170d', value: -0.7 }, { swatch: '#3d2416', value: -0.35 }, { swatch: '#4d2e1d', value: 0 },
  { swatch: '#6b4129', value: 0.35 }, { swatch: '#8a5a3c', value: 0.7 }, { swatch: '#a9774f', value: 1 },
];
const OUTFITS: { swatch: string; value: number; label: string }[] = [
  { swatch: '#e07b1f', value: 0, label: 'Ankara orange' }, { swatch: '#d9472b', value: 340, label: 'Owambe red' },
  { swatch: '#8c2f7a', value: 280, label: 'Royal purple' }, { swatch: '#2a46ff', value: 200, label: 'Cobalt' },
  { swatch: '#2f8f5b', value: 120, label: 'Lagos green' }, { swatch: '#c9a227', value: 30, label: 'Gold' },
];
const WARDROBE: Record<'ten' | 'ama', string[]> = {
  ten: ['Original', 'Owambe gold', 'Danfo conductor', 'Okada rider', 'Adire streetwear'],
  ama: ['Original', 'Aso-oke', 'Adire indigo', 'Neon pink', 'Kente weave'],
};
const NEONS = [0x00e5ff, 0xff2bd6, 0xffc400, 0x1aff9c, 0x4a6bff, 0xff3b30];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export const DEFAULT_LOOK: CharacterLook = { base: 'ten', name: '', height: 0, build: 0, shoulders: 0, hips: 0, skin: 0, outfitHue: 0, neon: 0x00e5ff };

export function CharacterCreator({ initial, onDone, onCancel, saving, error }: {
  initial?: CharacterLook | null; onDone: (look: CharacterLook) => void; onCancel?: () => void; saving?: boolean; error?: string | null;
}) {
  const host = useRef<View>(null);
  const [look, setLook] = useState<CharacterLook>(initial ?? DEFAULT_LOOK);
  const lookRef = useRef(look);
  lookRef.current = look;
  const person = useRef<Person | null>(null);
  const set = <K extends keyof CharacterLook>(k: K, v: CharacterLook[K]) => setLook((l) => ({ ...l, [k]: v }));
  useEffect(() => { person.current?.setLook?.(look); }, [look]);

  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.5;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.25, 5.2);
    camera.lookAt(0, 0.95, 0);
    scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a1d30, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(0x2a46ff, 2.5);
    rim.position.set(-3, 2, -3);
    scene.add(key, rim);
    // the plinth: a dark disc with a ring of neon
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.6, roughness: 0.35 }));
    plinth.position.y = -0.04;
    const ringMat = new THREE.MeshBasicMaterial({ color: lookRef.current.neon, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.012, 6, 64).rotateX(Math.PI / 2), ringMat);
    scene.add(plinth, ring);
    const turn = new THREE.Group();
    scene.add(turn);

    let disposed = false;
    // the body: rebuilt when the choice changes (TEN or Ama), sharing TEN's motion-captured clips
    let shownBase = '';
    const showBody = () => {
      const base = lookRef.current.base;
      if (base === shownBase) return;
      shownBase = base;
      Promise.all([loadCharacter(`world/people/${base}.glb`), loadCharacter('world/people/ten.glb'), loadCharacter('world/people/ten-idle.glb').catch(() => undefined)]).then(([gltf, ten, idle]) => {
        if (disposed || lookRef.current.base !== base) return;
        if (person.current) turn.remove(person.current.root);
        const p = makeCastHero(gltf, { walk: ten, idle }, { look: lookRef.current });
        person.current = p;
        turn.add(p.root);
      }).catch((e) => console.warn('[creator] model failed', e));
    };
    showBody();
    const bodyTimer = setInterval(showBody, 200);

    let yaw = 0.35, spin = 0, dragging = false, lastX = 0;
    const canvas = renderer.domElement;
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!dragging) return; spin = (e.clientX - lastX) * 0.012; yaw += spin; lastX = e.clientX; };
    const up = () => { dragging = false; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);

    const resize = () => {
      const w = el.clientWidth || 400, h = el.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    // the stage changes shape when the phone turns (after the window resize): follow the stage itself
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    window.addEventListener('resize', resize);
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragging) { spin *= Math.pow(0.05, dt); yaw += spin + dt * 0.25; } // a slow turn, and a flick keeps spinning
      turn.rotation.y = yaw;
      ringMat.color.setHex(lookRef.current.neon);
      person.current && person.current.drive?.(0, dt, false, 0, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      clearInterval(bodyTimer);
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      pmrem.dispose();
      canvas.remove();
    };
  }, []);

  const randomise = () => {
    const r = (xs: number[]) => xs[Math.floor(Math.random() * xs.length)];
    setLook((l) => ({
      ...l,
      height: r([-1, -0.5, 0, 0.5, 1]), build: r([-1, -0.5, 0, 0.5, 1]), shoulders: r([-1, -0.5, 0, 0.5, 1]), hips: r([-1, -0.5, 0, 0.5, 1]),
      outfit: Math.floor(Math.random() * 5),
      skin: SKINS[Math.floor(Math.random() * SKINS.length)].value, outfitHue: OUTFITS[Math.floor(Math.random() * OUTFITS.length)].value,
      neon: NEONS[Math.floor(Math.random() * NEONS.length)],
    }));
  };
  const ready = look.name.trim().length >= 2;
  const [nudge, setNudge] = useState(false);
  // a phone on its side: character left, choices right; upright: character on top; either way the
  // choices scroll and the button stays on screen
  const { width: sw, height: sh } = useWindowDimensions();
  const wide = sw > sh, short = sh < 520;

  return (
    <View style={[styles.root, { flexDirection: wide ? 'row' : 'column' }]}>
      <View ref={host} style={[styles.stage, wide ? { flex: 1 } : { height: '38%' }]} />
      <View style={styles.titleBox} pointerEvents="none">
        <Mono style={styles.eyebrow}>NAIJA 2099 · WHO ARE YOU IN LAGOS?</Mono>
        <Display style={[styles.title, short && { fontSize: 22, lineHeight: 26 }]}>{look.name.trim() || 'Your character'}</Display>
        <Mono style={styles.hint}>Drag to turn · every choice is free · you can change it later</Mono>
      </View>
      <View style={[styles.panel, wide ? { width: Math.min(400, sw * 0.5), height: '100%' } : { flex: 1 }, short && { padding: 12, gap: 8 }]}>
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
          <Section title="STREET NAME">
            <TextInput value={look.name} onChangeText={(t) => set('name', t.slice(0, 20))} placeholder="What does Lagos call you?" placeholderTextColor="#8a8f99" style={styles.input} maxLength={20} />
          </Section>
          <Section title="BODY">
            <View style={styles.row}>
              {(['ten', 'ama'] as const).map((b) => (
                <Pressable key={b} onPress={() => set('base', b)} style={[styles.chip, look.base === b && styles.chipOn, { minWidth: 90 }]}>
                  <Mono style={[styles.chipText, look.base === b && styles.chipTextOn]}>{b === 'ten' ? 'TEN · MAN' : 'AMA · WOMAN'}</Mono>
                </Pressable>
              ))}
            </View>
          </Section>
          <Section title="SKIN TONE">
            <View style={styles.row}>
              {SKINS.map((s) => (
                <Pressable key={s.value} onPress={() => set('skin', s.value)} style={[styles.swatch, { backgroundColor: s.swatch }, look.skin === s.value && styles.swatchOn]} accessibilityLabel={`Skin tone ${s.value}`} />
              ))}
            </View>
          </Section>
          {(['height', 'build', 'shoulders', 'hips'] as const).map((k) => (
            <Section key={k} title={k.toUpperCase()}>
              <View style={styles.row}>
                {SCALE.map((c) => (
                  <Pressable key={c.value} onPress={() => set(k, c.value)} style={[styles.chip, look[k] === c.value && styles.chipOn]}>
                    <Mono style={[styles.chipText, look[k] === c.value && styles.chipTextOn]}>{c.label}</Mono>
                  </Pressable>
                ))}
              </View>
            </Section>
          ))}
          <Section title="WARDROBE">
            <View style={styles.row}>
              {WARDROBE[look.base].map((label, i) => (
                <Pressable key={label} onPress={() => set('outfit', i)} style={[styles.chip, (look.outfit ?? 0) === i && styles.chipOn]}>
                  <Mono style={[styles.chipText, (look.outfit ?? 0) === i && styles.chipTextOn]}>{label.toUpperCase()}</Mono>
                </Pressable>
              ))}
            </View>
          </Section>
          <Section title="COLOUR SHIFT">
            <View style={styles.row}>
              {OUTFITS.map((o) => (
                <Pressable key={o.value} onPress={() => set('outfitHue', o.value)} style={[styles.swatch, { backgroundColor: o.swatch }, look.outfitHue === o.value && styles.swatchOn]} accessibilityLabel={o.label} />
              ))}
            </View>
          </Section>
          <Section title="NEON TRIM">
            <View style={styles.row}>
              {NEONS.map((n) => (
                <Pressable key={n} onPress={() => set('neon', n)} style={[styles.swatch, { backgroundColor: hex(n) }, look.neon === n && styles.swatchOn]} accessibilityLabel={`Neon ${hex(n)}`} />
              ))}
            </View>
          </Section>
        </ScrollView>
        {error ? <Mono style={styles.error}>{error}</Mono> : nudge && !ready ? <Mono style={styles.error}>Type a street name (2+ letters) to enter Lagos.</Mono> : null}
        <View style={styles.actions}>
          {onCancel ? <Pressable onPress={onCancel} style={styles.ghost}><Mono style={styles.ghostText}>CANCEL</Mono></Pressable> : null}
          <Pressable onPress={randomise} style={styles.ghost}><Mono style={styles.ghostText}>SURPRISE ME</Mono></Pressable>
          <Pressable onPress={() => { if (!ready) { setNudge(true); return; } if (!saving) onDone({ ...look, name: look.name.trim() }); }} style={[styles.go, (!ready || saving) && { opacity: 0.45 }]}>
            <Mono style={styles.goText}>{saving ? 'SAVING…' : onCancel ? 'SAVE' : 'ENTER LAGOS →'}</Mono>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Mono style={styles.label}>{title}</Mono>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0d0f14', },
  stage: { minHeight: 0 },
  titleBox: { position: 'absolute', top: 18, left: 20, gap: 4 },
  eyebrow: { fontSize: 10, letterSpacing: 2.4, color: '#8ea0ff' },
  title: { fontSize: 34, lineHeight: 38, color: '#ffffff' },
  hint: { fontSize: 10.5, color: '#9aa0aa' },
  panel: { minHeight: 0, backgroundColor: 'rgba(22,23,26,0.96)', padding: 18, gap: 12, borderLeftWidth: 1, borderLeftColor: '#262a33' },
  label: { fontSize: 9.5, letterSpacing: 2, color: '#8ea0ff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: '#ffffff', color: '#16171a', fontSize: 15, paddingHorizontal: 10, paddingVertical: 9 },
  swatch: { width: 34, height: 34, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: '#ffffff' },
  chip: { borderWidth: 1, borderColor: '#3a3d45', paddingHorizontal: 10, paddingVertical: 7, minWidth: 46, alignItems: 'center' },
  chipOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  chipText: { fontSize: 10, letterSpacing: 1.4, color: '#c9ccd3' },
  chipTextOn: { color: colors.onSignal },
  error: { fontSize: 11, color: '#ff6b6b' },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  ghost: { borderWidth: 1, borderColor: '#3a3d45', paddingHorizontal: 12, paddingVertical: 10 },
  ghostText: { fontSize: 10.5, letterSpacing: 1.6, color: '#c9ccd3' },
  go: { backgroundColor: colors.signal, paddingHorizontal: 16, paddingVertical: 10 },
  goText: { fontSize: 11, letterSpacing: 1.8, color: colors.onSignal },
});
