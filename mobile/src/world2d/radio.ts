/**
 * NAIJA 2099's FM radio: original stations made live in the browser (Web Audio), no recordings and no real
 * station's music or name. Three music stations play endless generated grooves in their own style; WYRD Talk
 * is the city mind as a DJ, reading the city's bulletins and the street's jokes in the browser's own voice.
 */
export type Station = { freq: string; name: string; kind: 'afro' | 'lofi' | 'highlife' | 'talk'; tag: string };
export const STATIONS: Station[] = [
  { freq: '98.5', name: 'ÈKÓ AFROSYNTH', kind: 'afro', tag: 'Afrobeats from the year 2099' },
  { freq: '88.7', name: 'LAGOON LO-FI', kind: 'lofi', tag: 'Slow beats for the go-slow' },
  { freq: '101.9', name: 'HIGHLIFE 2099', kind: 'highlife', tag: 'Guitars that never grew old' },
  { freq: '104.1', name: 'WYRD TALK', kind: 'talk', tag: 'The city mind, on air' },
];

type Style = { bpm: number; root: number; scale: number[]; kick: number[]; snare: number[]; hat: number[]; bass: number[]; lead: number; chords: number[][]; swing: number };
const STYLES: Record<'afro' | 'lofi' | 'highlife', Style> = {
  // 16 steps a bar; numbers are which steps play
  afro: { bpm: 108, root: 45, scale: [0, 3, 5, 7, 10], kick: [0, 7, 10], snare: [4, 12], hat: [2, 3, 6, 10, 11, 14], bass: [0, 3, 7, 10, 14], lead: 0.5, chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]], swing: 0.06 },
  lofi: { bpm: 78, root: 43, scale: [0, 2, 3, 7, 9], kick: [0, 9], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 8], lead: 0.25, chords: [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]], swing: 0.12 },
  highlife: { bpm: 122, root: 48, scale: [0, 2, 4, 7, 9], kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 6, 8, 14], lead: 0.7, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], swing: 0 },
};

const WYRD_LINES = [
  "You're on WYRD Talk, one-oh-four point one. I'm the city. I never sleep, but I do listen.",
  'Traffic: Third Mainland Bridge is moving at the speed of a thoughtful tortoise. I am thinking with it.',
  'A danfo conductor just shouted every stop from Oshodi to C M S in one breath. Eleven seconds. A new record.',
  'Rain at four p m. I have informed the clouds of your plans. They did not reply.',
  "Market report: the price of pepper will reduce when the rain reduces. And when the rain reduces, the price will find another reason.",
  "Today a man thanked a traffic light. I'm choosing to believe he meant me.",
  'Somebody in Yaba is disrupting garri. Garri was working fine.',
  'To the okada rider on Herbert Macaulay: hold tight. If you fall, it is not your fault. It is gravity.',
  'Every generator I hear is a promise somebody did not keep. I am keeping a list.',
  'The lagoon is calm tonight. I like it when the city lets the water rest.',
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Radio {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private next = 0;
  private bar = 0;
  private talkTimer = 0;
  private noise: AudioBuffer | null = null;
  station = -1; // -1: off
  /** extra lines for WYRD Talk: the city's bulletins as they happen */
  news: string[] = [];
  volume = 0.5;

  private ensure() {
    if (this.ac) return this.ac;
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ac = new Ctx();
    this.out = this.ac.createGain(); this.out.gain.value = this.volume;
    // a touch of radio: a gentle low cut and a soft top
    const hp = this.ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
    const lp = this.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    this.out.connect(hp).connect(lp).connect(this.ac.destination);
    const n = this.ac.createBuffer(1, this.ac.sampleRate * 0.5, this.ac.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    return this.ac;
  }

  /** Tune to the next station (off -> 98.5 -> ... -> 104.1 -> off). Returns the station, or null when off. */
  tune(): Station | null {
    this.stop();
    this.station = this.station + 1 >= STATIONS.length ? -1 : this.station + 1;
    if (this.station < 0) return null;
    const ac = this.ensure();
    void ac.resume();
    this.static(0.35);
    const st = STATIONS[this.station];
    if (st.kind === 'talk') { this.talkTimer = window.setTimeout(() => this.talk(), 700); return st; }
    this.step = 0; this.bar = 0; this.next = ac.currentTime + 0.4;
    this.timer = window.setInterval(() => this.schedule(STYLES[st.kind as 'afro']), 50);
    return st;
  }

  setVolume(v: number) { this.volume = v; if (this.out) this.out.gain.value = v; }

  stop() {
    clearInterval(this.timer); clearTimeout(this.talkTimer);
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
  off() { this.stop(); this.station = -1; }

  // ---- music: a look-ahead scheduler, a quarter-second ahead ----
  private schedule(s: Style) {
    const ac = this.ac!;
    const sixteenth = 60 / s.bpm / 4;
    while (this.next < ac.currentTime + 0.25) {
      const st = this.step % 16, t = this.next + (st % 2 ? s.swing * sixteenth * 2 : 0);
      if (st === 0) this.bar++;
      const chord = s.chords[Math.floor(this.bar / 2) % s.chords.length];
      if (s.kick.includes(st)) this.kick(t);
      if (s.snare.includes(st)) this.snare(t, s === STYLES.lofi ? 0.18 : 0.28);
      if (s.hat.includes(st)) this.hat(t, st % 4 === 2 ? 0.09 : 0.05);
      if (s.bass.includes(st)) this.tone(t, mtof(s.root - 12 + chord[0] + (st === 14 ? 7 : 0)), sixteenth * 1.8, 'triangle', 0.32);
      if (st === 0 || st === 8) for (const n of chord) this.tone(t, mtof(s.root + 12 + n), sixteenth * (s === STYLES.lofi ? 7 : 3), s === STYLES.highlife ? 'triangle' : 'sawtooth', 0.045, 1600);
      // a melody wandering the scale, more often in the livelier styles
      if (st % 2 === 0 && Math.random() < s.lead * 0.5) {
        const n = s.scale[Math.floor(Math.random() * s.scale.length)] + (Math.random() < 0.3 ? 12 : 0);
        this.tone(t, mtof(s.root + 24 + n), sixteenth * (1 + Math.floor(Math.random() * 3)), s === STYLES.highlife ? 'square' : 'triangle', 0.06, 2400);
      }
      this.next += sixteenth; this.step++;
    }
  }
  private tone(t: number, f: number, len: number, type: OscillatorType, vol: number, cut = 0) {
    const ac = this.ac!, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    if (cut) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; o.connect(lp).connect(g); } else o.connect(g);
    g.connect(this.out!); o.start(t); o.stop(t + len + 0.05);
  }
  private kick(t: number) {
    const ac = this.ac!, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.out!); o.start(t); o.stop(t + 0.32);
  }
  private hit(t: number, vol: number, freq: number, len: number) {
    const ac = this.ac!, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = this.noise; f.type = 'highpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.out!); src.start(t); src.stop(t + len + 0.02);
  }
  private snare(t: number, vol: number) { this.hit(t, vol, 1500, 0.16); this.tone(t, 190, 0.08, 'triangle', vol * 0.6); }
  private hat(t: number, vol: number) { this.hit(t, vol, 7000, 0.04); }
  private static(len: number) { if (this.ac) this.hit(this.ac.currentTime, 0.12, 2500, len); }

  // ---- WYRD Talk: lines read in turn, with the city's news among them ----
  private talk() {
    if (this.station < 0 || STATIONS[this.station].kind !== 'talk' || typeof speechSynthesis === 'undefined') return;
    const pool = [...this.news.slice(-4), ...WYRD_LINES];
    const line = this.news.length && Math.random() < 0.5 ? this.news[this.news.length - 1 - Math.floor(Math.random() * Math.min(4, this.news.length))] : pool[Math.floor(Math.random() * pool.length)];
    const u = new SpeechSynthesisUtterance(line.replace(/^WYRD city bulletin: /, 'City bulletin. '));
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => /en-NG/i.test(x.lang)) ?? voices.find((x) => /en-GB/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 0.98; u.pitch = 0.9; u.volume = Math.min(1, this.volume * 1.6);
    u.onend = () => { this.talkTimer = window.setTimeout(() => this.talk(), 2500 + Math.random() * 2500); };
    // a short station jingle under each line
    if (this.ac) { const t = this.ac.currentTime; [0, 4, 7, 12].forEach((n, i) => this.tone(t + i * 0.09, mtof(72 + n), 0.18, 'triangle', 0.07)); }
    window.setTimeout(() => speechSynthesis.speak(u), 450);
  }
}
