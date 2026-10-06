import { getSound } from '../util/sound';

/**
 * The city's sound, made in the browser (no files): a road rumble that swells by busy streets, a
 * crowd murmur by markets and food spots, footsteps at your pace, rain and thunder, wind as you fly
 * high, the hover-car's hum and the danfo's engine, the maglev whooshing past, crickets at night,
 * and danfo conductors calling their stops (the browser's own voice). Everything is a few looping
 * noise sources through filters; the levels follow what's around you each frame.
 */
export type CityHearing = {
  dt: number;
  walking: number;           // your speed on foot, m/s (0 standing)
  vehicle: 'car' | 'danfo' | 'train' | null;
  vehicleSpeed: number;      // m/s
  altitude: number;          // m above the street
  traffic: number;           // 0..1: vehicles close by
  crowd: number;             // 0..1: markets, food spots, clubs, people close by
  rain: number;              // 0 clear, 0.6 rain, 1 storm
  flash: number;             // lightning, 0..1
  night: number;             // 0 day .. 1 night
  trainDist: number;         // metres to the nearest maglev train
  conductor: string | null;  // a stop name, if a danfo is standing at one close by
};

export function makeCityAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  const layers: Record<string, { gain: GainNode; filter?: BiquadFilterNode; osc?: OscillatorNode }> = {};
  let stepPhase = 0, nextCricket = 0, nextHonk = 0, nextCall = 0, thunderAt = -1, lastFlash = 0;

  const noiseBuffer = (c: AudioContext, kind: 'white' | 'brown') => {
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  };
  const loop = (name: string, buf: AudioBuffer, type: BiquadFilterType, freq: number, q = 0.7) => {
    const c = ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    layers[name] = { gain: g, filter: f };
  };
  const hum = (name: string, type: OscillatorType, freq: number, cut: number) => {
    const c = ctx!, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cut;
    g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(master);
    o.start();
    layers[name] = { gain: g, filter: f, osc: o };
  };

  const start = () => {
    if (ctx) return;
    try {
      ctx = new AudioContext();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      const white = noiseBuffer(ctx, 'white'), brown = noiseBuffer(ctx, 'brown');
      loop('traffic', brown, 'lowpass', 380);
      loop('crowd', white, 'bandpass', 700, 0.6);
      loop('rain', white, 'highpass', 1400);
      loop('wind', brown, 'bandpass', 520, 0.4);
      loop('whoosh', white, 'bandpass', 900, 0.9);
      hum('car', 'sawtooth', 70, 420);
      hum('engine', 'square', 45, 260);
    } catch { ctx = null; }
  };
  // browsers start sound only after a tap or key: wait for the first one
  const unlock = () => { start(); void ctx?.resume(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
  const onHide = () => { if (!ctx) return; if (document.hidden) void ctx.suspend(); else void ctx.resume(); };
  document.addEventListener('visibilitychange', onHide);

  const set = (name: string, v: number, k = 4) => {
    const l = layers[name];
    if (l) l.gain.gain.setTargetAtTime(Math.max(0, v), ctx!.currentTime, 1 / k);
  };
  // a short filtered noise burst: a footstep, a raindrop, a horn's tail
  const burst = (freq: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass') => {
    const c = ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = src.buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    f.type = type; f.frequency.value = freq;
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  };
  const tone = (freq: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
    const c = ctx!, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  };
  const say = (text: string) => {
    try {
      if (!('speechSynthesis' in window) || speechSynthesis.speaking) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.25; u.pitch = 0.85; u.volume = 0.55;
      const v = speechSynthesis.getVoices().find((x) => /en-NG|Nigeria/i.test(x.lang + x.name)) ?? speechSynthesis.getVoices().find((x) => /en-(GB|ZA|KE)/.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch { /* no voice: fine */ }
  };

  return {
    update(h: CityHearing) {
      if (!ctx) return;
      const on = getSound().sfx;
      master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.2);
      if (!on) return;
      const now = performance.now(), inside = h.vehicle === 'train';
      const high = Math.min(1, h.altitude / 80);
      // the road: louder by traffic, quieter high up and at night
      set('traffic', (0.05 + 0.32 * h.traffic) * (1 - high * 0.8) * (1 - h.night * 0.35));
      // the crowd: markets and food spots, fading at night except by the clubs
      set('crowd', 0.16 * h.crowd * (1 - high) * (1 - h.night * 0.4));
      if (layers.crowd?.filter) layers.crowd.filter.frequency.setTargetAtTime(600 + 300 * Math.sin(now / 900), ctx.currentTime, 0.3); // voices rise and fall
      set('rain', 0.2 * h.rain, 2);
      set('wind', 0.04 + 0.22 * high + 0.05 * h.rain);
      // the maglev: a rising whoosh as a train passes (and a steady one riding it)
      set('whoosh', inside ? 0.06 : 0.25 * Math.max(0, 1 - h.trainDist / 70), 6);
      // the hover-car's hum and the danfo's engine, pitched by speed
      set('car', h.vehicle === 'car' ? 0.07 : 0);
      layers.car?.osc?.frequency.setTargetAtTime(70 + h.vehicleSpeed * 3, ctx.currentTime, 0.2);
      set('engine', h.vehicle === 'danfo' ? 0.06 + Math.min(0.05, h.vehicleSpeed * 0.004) : 0);
      layers.engine?.osc?.frequency.setTargetAtTime(42 + h.vehicleSpeed * 4.5, ctx.currentTime, 0.15);
      // footsteps, at your pace
      if (!h.vehicle && h.walking > 0.4 && h.altitude < 60) {
        stepPhase += h.dt * (1.6 + h.walking * 0.32);
        if (stepPhase >= 1) { stepPhase -= 1; burst(h.walking > 4 ? 900 : 650, 0.07, 0.12 + Math.min(0.1, h.walking * 0.015), 'lowpass'); }
      }
      // raindrops on the near things, and thunder rolling after the flash
      if (h.rain > 0 && Math.random() < h.rain * h.dt * 14) burst(2400 + Math.random() * 2000, 0.03, 0.05 * h.rain, 'highpass');
      if (h.flash > 0.9 && now - lastFlash > 1500) { lastFlash = now; thunderAt = now + 600 + Math.random() * 1800; }
      if (thunderAt > 0 && now > thunderAt) { thunderAt = -1; burst(90, 2.6, 0.5, 'lowpass'); burst(160, 1.4, 0.25, 'lowpass'); }
      // a horn now and then in traffic
      if (h.traffic > 0.3 && now > nextHonk && !inside) { nextHonk = now + 4000 + Math.random() * 9000; const f = Math.random() < 0.5 ? 392 : 520; tone(f, 0.25, 0.025, 'square'); tone(f * 1.19, 0.25, 0.02, 'square'); }
      // crickets on quiet nights
      if (h.night > 0.6 && h.traffic < 0.4 && now > nextCricket && h.altitude < 30) {
        nextCricket = now + 600 + Math.random() * 1600;
        for (let i = 0; i < 3; i++) setTimeout(() => ctx && tone(4200 + Math.random() * 300, 0.04, 0.015), i * 70);
      }
      // a conductor calling the stop
      if (h.conductor && now > nextCall) { nextCall = now + 14000 + Math.random() * 10000; const s = h.conductor.split(' ')[0]; say(`${s}! ${s}! Enter with your change!`); }
    },
    dispose() {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onHide);
      try { speechSynthesis.cancel(); } catch { /* fine */ }
      void ctx?.close();
      ctx = null;
    },
  };
}
