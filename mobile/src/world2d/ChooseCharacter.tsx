import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import type { CharacterLook } from '../api/types';

/**
 * Who you are in NAIJA 2099 (asked once, the first time you enter): male or female -- two
 * motion-captured bodies turning on the spot from their baked sheets -- and the name the streets will
 * know you by. Saved to your account; if the server can't take it (not signed in, or the session has
 * run out), it is kept on this device and you play on -- it is saved to your account next time.
 */
export const LOCAL_LOOK = 'naija2099.look';

export function ChooseCharacter({ onDone }: { onDone: (look: CharacterLook) => void }) {
  const [base, setBase] = useState<'ten' | 'ama'>('ten');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const n = name.trim();
    if (n.length < 2) { setErr('Choose a street name of 2 to 20 characters.'); return; }
    setBusy(true); setErr(null);
    try {
      const wanted: CharacterLook = { base, name: n, height: 0, build: 0, shoulders: 0, hips: 0, skin: 0, outfitHue: 0, neon: 0x00e5ff, outfit: 0 };
      try { localStorage.setItem(LOCAL_LOOK, JSON.stringify(wanted)); } catch { /* private mode */ }
      try {
        onDone(await api.saveCharacter(wanted));
      } catch (e) {
        const msg = (e as Error)?.message ?? '';
        // a name the server refuses is worth fixing; anything else (signed out, offline) shouldn't stop you playing
        if (/name|characters|letters/i.test(msg)) { setErr(msg); setBusy(false); return; }
        onDone(wanted);
      }
    } catch (e) { setErr((e as Error)?.message || 'Could not save. Try again.'); setBusy(false); }
  };

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <Text style={s.eyebrow}>NAIJA 2099</Text>
        <Text style={s.title}>Who are you in Lagos?</Text>
        <View style={s.pick}>
          {(['ten', 'ama'] as const).map((b) => (
            <Pressable key={b} onPress={() => setBase(b)} style={[s.option, base === b && s.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: base === b }} accessibilityLabel={b === 'ten' ? 'Male' : 'Female'}>
              <Turntable who={b} />
              <Text style={[s.optName, base === b && { color: '#FFFFFF' }]}>{b === 'ten' ? 'Male' : 'Female'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>Your street name</Text>
        <TextInput value={name} onChangeText={(t) => { setName(t); setErr(null); }} placeholder="e.g. Tunde Fast-Fingers" placeholderTextColor="#9AA3B2"
          maxLength={20} style={s.input} onSubmitEditing={save} autoFocus />
        {err ? <Text style={s.err}>{err}</Text> : null}
        <Pressable onPress={save} disabled={busy} style={({ pressed }) => [s.go, (pressed || busy) && { opacity: 0.8 }]}>
          <Text style={s.goText}>{busy ? 'Entering…' : 'Enter Lagos'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** the character turning slowly on the spot, idling, from the baked sheet (8 facings x 6 frames) */
function Turntable({ who }: { who: 'ten' | 'ama' }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d')!;
    const im = new Image(); im.src = `world2d/people/${who}-idle-pc.webp`;
    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!im.complete || !im.naturalWidth) return;
      const dir = Math.floor(t / 900) % 8, f = Math.floor(t / 300) % 6;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(im, f * 192, dir * 192, 192, 192, 0, 0, c.width, c.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [who]);
  return React.createElement('canvas', { ref, width: 384, height: 384, style: { width: 170, height: 170 } });
}

const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const s = StyleSheet.create({
  wrap: { position: 'absolute', inset: 0, backgroundColor: 'rgba(10,14,22,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 } as object,
  card: { width: 560, maxWidth: '96%', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, gap: 10 },
  eyebrow: { fontFamily: font, fontSize: 12, fontWeight: '800', letterSpacing: 2, color: '#C4572E' },
  title: { fontFamily: font, fontSize: 26, fontWeight: '800', color: '#1E2A44' },
  pick: { flexDirection: 'row', gap: 12, marginVertical: 6 },
  option: { flex: 1, alignItems: 'center', borderWidth: 2, borderColor: '#E3E7EE', borderRadius: 16, padding: 10, gap: 4, backgroundColor: '#F6F8FB' },
  optionOn: { borderColor: '#1E2A44', backgroundColor: '#1E2A44' },
  optName: { fontFamily: font, fontSize: 18, fontWeight: '800', color: '#1E2A44' },
  optLine: { fontFamily: font, fontSize: 12.5, color: '#5B6475', textAlign: 'center', lineHeight: 17 },
  label: { fontFamily: font, fontSize: 12, fontWeight: '800', color: '#8A93A3', letterSpacing: 1, textTransform: 'uppercase' },
  input: { fontFamily: font, fontSize: 16, borderWidth: 1.5, borderColor: '#C9CED6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#1E2A44' },
  err: { fontFamily: font, fontSize: 13, color: '#C0392B' },
  go: { backgroundColor: '#C4572E', borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  goText: { fontFamily: font, fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
