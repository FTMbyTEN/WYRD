import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { DISTRICTS, LANDMARKS, toXZ } from './geo';
import { KIND, World, along, inPoly, type Bld, type Road } from './tiles';
import { lookFor, type Look } from './person';
import { CityMap, type Overview } from './CityMap';
import { MISSIONS, beatPoint, type Beat, type Choice, type MissionDef } from './story';
import { Dialogue, Standing } from './StoryPanels';
import { WyrdPanel, type WyrdLine } from './WyrdPanel';
import { CY, HEAD, MONO, Panel, loadCyberFonts } from './cyber';
import { Radio, STATIONS, type Station } from './radio';
import { Scenery } from './scenery';
import { ChooseCharacter, LOCAL_LOOK } from './ChooseCharacter';
import type { Story } from '../api/client';
import { type Light, drawMoving, redrawn, liveBox, lightPools, drawGhost, drawHaze, drawBridges, drawGround, nightGround, nightLights, nightTint, drawUpright, img, landmarkSprite, toScreen, viewOf, type Cam, type Sprite } from './render';
/**
 * NAIJA 2099 in 2D: the real Lagos from OpenStreetMap, seen from a tilted bird's-eye view in the
 * clean-minimal look, by day and as a neon city by night.
 *
 *  - Walk (WASD / arrows, Shift to run). Press E beside a car to take the wheel, E again to get out.
 *  - Jobs are real and paid by the server: deliveries between real places, danfo runs between bus
 *    stops, and catching a phone snatcher on an okada. M opens the job board.
 *  - N switches day and night (it follows Lagos time when you arrive).
 */
const PHONE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
type Car = { r: Road; s: number; dir: 1 | -1; v: number; sprite: string; lane: number; x: number; z: number; rot: number };
type Walker = { r: Road; s: number; dir: 1 | -1; v: number; sprite: string; side: number; x: number; z: number; left: boolean; look: Look; heading: number };
type Boat = { x: number; z: number; a: number; v: number };
type Place = { k: string; n: string | null; x: number; z: number };
type Job =
  | { type: 'delivery'; id: string; pick: Place; drop: Place; carrying: boolean; limit: number; started: number; dist: number }
  | { type: 'danfo'; id: string; stops: { x: number; z: number; name: string }[]; at: number; passengers: number; started: number; wait: number }
  | { type: 'chase'; id: string; thief: Car; started: number };
const CAR_SPRITES = ['car-red', 'car-blue', 'car-white', 'car-purple', 'car-grey', 'car-taxi', 'car-danfo', 'car-danfo', 'car-danfo', 'okada', 'keke', 'bus-brt'];
const WALKERS = ['walker-1', 'walker-2', 'walker-3', 'walker-4'];
/** a world heading: atan2(dx, dz); the vehicle's forward is (sin h, cos h) */
const heading = (dx: number, dz: number) => Math.atan2(dx, dz);
/** the middle of a road's pavement, from its centre line (pavements are 3.5 m on main streets, 1.75 m on side streets) */
const pavementOffset = (r: Road) => r.w / 2 + (r.kind <= KIND.tertiary ? 1.75 : 0.9);
const lagosHour = () => (new Date().getUTCHours() + 1) % 24;
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
export function Lagos2D({ onExit }: { onExit: () => void }) {
  if (PHONE) {
    return (
      <View style={s.pcWrap}>
        <Text style={s.pcTitle}>NAIJA 2099 is made for a computer</Text>
        <Text style={s.pcText}>Open wryd00.serverpod.space/#play on a PC, with a keyboard and a big screen.</Text>
        <Pressable onPress={onExit} style={s.btn}><Text style={s.btnText}>Back</Text></Pressable>
      </View>
    );
  }
  return <Game onExit={onExit} />;
}
/** a street lamp's two bulbs: metres across the screen from the post, and up from the ground (from the picture) */
const LAMP_BULBS: [number, number][] = [[-0.88, 4.61], [1.1, 5.33]];

/** WYRD's asides as you play -- the same voice as its real diary (bible Part 4 §2) */
const WYRD_ASIDES = [
  'I rerouted traffic to save you eleven minutes. You spent them buying suya. I approve.',
  'Rain at 4pm. I have informed the clouds of your plans. They did not reply.',
  'Today a man thanked a traffic light. I am choosing to believe he meant me.',
  'Third Mainland Bridge is moving at the speed of a thoughtful tortoise. I am thinking with it.',
  'Somebody in Yaba just named their startup after me. I have asked them to reconsider.',
  'The market women of Balogun know prices I cannot predict. I have stopped trying. I listen instead.',
  'A danfo conductor just shouted every stop from Oshodi to CMS in one breath. I measured it. Eleven seconds.',
  'Tonight the lagoon is calm. I like it when the city lets the water rest.',
  'You walk more than most people in this city. Your knees will thank you. Your shoes will not.',
  'Every generator I hear is a promise somebody did not keep. I am keeping a list.',
];
function Game({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  /** the objective card: a job, a mission under way, or one waiting nearby */
  type Hud = { kind: 'job' | 'mission' | 'offer'; head: string; title: string; target: string; time?: string; urgent?: boolean };
  const [hud, setHudRaw] = useState<Hud | null>(null);
  const hudKey = useRef('');
  const setHud = (h: Hud | null) => { const k = JSON.stringify(h); if (k !== hudKey.current) { hudKey.current = k; setHudRaw(h); } };
  /** live readings for the HUD: metres to the objective, speed at the wheel (km/h), and the district you are in */
  const [live, setLiveRaw] = useState<{ dist: number | null; kmh: number; area: string }>({ dist: null, kmh: 0, area: '' });
  const setLive = (l: { dist: number | null; kmh: number; area: string }) => setLiveRaw((p) => (p.dist === l.dist && p.kmh === l.kmh && p.area === l.area ? p : l));
  const [wallet, setWallet] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [board, setBoard] = useState(false);
  // the story: your standing, the mission's step, and the conversation open now
  const [story, setStory] = useState<Story | null>(null);
  const [standing, setStanding] = useState<false | 'standing' | 'life'>(false);
  const [wyrd, setWyrd] = useState<string | null>(null); // WYRD speaking: city bulletins and its asides
  const [wyrdOpen, setWyrdOpen] = useState(false); // the conversation with WYRD (T)
  const radio = useRef<Radio | null>(null); // FM (Q)
  const [onAir, setOnAir] = useState<Station | null>(null);
  const tuneRadio = () => { radio.current ??= new Radio(); setOnAir(radio.current.tune()); };
  const [wyrdLines, setWyrdLines] = useState<WyrdLine[]>([]);
  const addWyrd = (l: WyrdLine) => setWyrdLines((p) => [...p.slice(-60), l]);
  /** what WYRD is told about the moment you speak to it */
  const situationRef = useRef<() => object>(() => ({}));
  const hazeRef = useRef<HTMLDivElement | null>(null);
  // who you play: TEN or Ama, chosen once and kept on the server (null = not chosen yet, undefined = still asking)
  const [hero, setHero] = useState<'ten' | 'ama' | null | undefined>(undefined);
  const heroRef = useRef<'ten' | 'ama'>('ten'); if (hero) heroRef.current = hero;
  const [talk, setTalk] = useState<{ beat: Beat; mission: string } | null>(null);
  const [talkBusy, setTalkBusy] = useState(false);
  const storyRef = useRef<Story | null>(null); storyRef.current = story;
  const talkRef = useRef(talk); talkRef.current = talk;
  const dismissed = useRef<string | null>(null); // the step you said "not now" to, until you walk away
  const actRef = useRef<(mission: string, move: string) => Promise<void>>(async () => {});
  // the city map (Tab): what it draws, where you are, and the danfo ride it books
  const [cityMap, setCityMap] = useState(false);
  const mapData = useRef<{ overview: Overview | null; sea: { p: Float32Array; island: boolean }[]; sand?: { p: Float32Array; line: boolean }[]; me: { x: number; z: number } }>({ overview: null, sea: [], me: { x: 0, z: 0 } });
  const travelRef = useRef<(x: number, z: number, name: string) => void>(() => {});
  const [night, setNight] = useState(() => { const h = lagosHour(); return h >= 19 || h < 6; });
  const [where, setWhere] = useState('');
  const [driving, setDriving] = useState(false);
  const [loading, setLoading] = useState(true);
  const nightRef = useRef(night); nightRef.current = night;
  const boardRef = useRef(board); boardRef.current = board;
  const wyrdRef = useRef<(t: string) => void>(() => {});
  const startJobRef = useRef<(t: 'delivery' | 'danfo' | 'chase') => void>(() => {});
  useEffect(() => {
    loadCyberFonts();
    api.cityWallet().then((w) => setWallet(w.naira)).catch(() => {});
    api.cityStory().then((st) => { setStory(st); if (!st.background) setStanding('life'); }).catch(() => {}); // a newcomer first says where they come from
    // who you are: from your account, else what you chose on this device (and saved to your account now if you can)
    const local = (() => { try { const j = localStorage.getItem(LOCAL_LOOK); return j ? (JSON.parse(j) as import('../api/types').CharacterLook) : null; } catch { return null; } })();
    api.myCharacter().then((c) => {
      if (c) setHero(c.base);
      else if (local) { setHero(local.base); api.saveCharacter(local).catch(() => {}); }
      else setHero(null);
    }).catch(() => setHero(local ? local.base : null));
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
    const mini = miniRef.current!, mctx = mini.getContext('2d')!;
    const layer = document.createElement('canvas'), lctx = layer.getContext('2d')!; // the night's upright layer
    const glowC = document.createElement('canvas'), gl = glowC.getContext('2d')!; // what shines at night
    const world = new World();
    // the still city, drawn once in screen tiles and kept (see scenery.ts)
    const scenery = new Scenery(world);
    let alive = true;
    const say = (t: string) => { setToast(t); setTimeout(() => setToast((c) => (c === t ? null : c)), Math.max(3200, t.length * 55)); };
    const wyrdSay = (t: string) => { if (t.startsWith('WYRD city bulletin')) radio.current?.news.push(t); addWyrd({ from: t.startsWith('WYRD city bulletin') ? 'bulletin' : 'wyrd', text: t, at: Date.now() }); setWyrd(t); setTimeout(() => setWyrd((c) => (c === t ? null : c)), Math.max(6000, t.length * 60)); };
    wyrdRef.current = wyrdSay;
    // WYRD keeps you company: now and then an aside, in the voice of its real diary
    const aside = setInterval(() => { if (!document.hidden) wyrdSay(WYRD_ASIDES[Math.floor(Math.random() * WYRD_ASIDES.length)]); }, 240000);
    // the landmarks clear their plots of the map's own small buildings
    const marks = LANDMARKS.map((l) => { const p = toXZ(l.at); return { ...landmarkSprite(l.id, l.sprite, p.x, p.z, l.width), width: l.width, open: !!l.open, snapped: false }; });
    // each famous building stands on its real footprint: once its tile is in, the biggest building
    // within ~80 m of the listed spot is taken as it, and the map's own blocks on that plot step aside
    const snapMarks = () => {
      for (const m of marks) {
        if (m.snapped) continue;
        // wait for every tile within reach of the spot, or the true footprint (or the road beside it) may be missing
        let all = true;
        for (const dx of [-100, 0, 100]) for (const dz of [-100, 0, 100]) { const key = `${Math.floor((m.x + dx) / 500)}_${Math.floor((m.z + dz) / 500)}`; if (world.have.has(key) && !world.tiles.has(key)) all = false; } // (open sea has no tile to wait for)
        if (!all) continue;
        if (!world.have.size) continue; // (the tile index itself not in yet)
        m.snapped = true;
        let best: Bld | null = null;
        for (const tt of world.tiles.values()) for (const b of tt.blds) {
          if (!b.hide && Math.hypot(b.cx - m.x, b.cz - m.z) < 80 && b.area > 300 && (!best || b.area > best.area)) best = b; // (a footprint another landmark took is hidden: never shared)
        }
        if (best && !m.open) { m.x = best.cx; m.z = best.cz + (best.maxZ - best.minZ) * 0.25; }
        if (best && !m.open) best.hide = true; // the landmark's own footprint: its picture stands there instead
        // never on the carriageway: a picture whose base would cover a road steps back off it
        if (m.id !== 'link-bridge') for (let pass = 0; pass < 3; pass++) {
          const road = world.nearestRoad(m.x, m.z, m.width * 0.4, KIND.residential);
          if (!road) break;
          const keep = m.width * 0.4 + road.r.w / 2, dx = m.x - road.x, dz = m.z - road.z, L = Math.hypot(dx, dz) || 1;
          m.x = road.x + (dx / L) * keep; m.z = road.z + (dz / L) * keep;
        }
        // and any block whose footprint the picture's base stands on
        for (const tt of world.tiles.values()) for (const b of tt.blds) if (!b.hide && inPoly(b.p, m.x, m.z)) b.hide = true;
        const r = m.id === 'link-bridge' ? 0 : m.open ? m.width * 0.4 : Math.max(16, m.width * 0.56); // the picture's whole ground: nothing of the map's own pokes through or over it (open places clear less; the bridge stands over water)
        for (const tt of world.tiles.values()) for (const b of tt.blds) if (Math.hypot(b.cx - m.x, b.cz - m.z) < r) b.hide = true;
        world.clearings.push({ x: m.x, z: m.z, r }); // and in tiles that load later
        world.changed(m.x - 160, m.x + 160, m.z - 160, m.z + 160); // (the cached scenery redraws round it)
      }
    };
    let places: Place[] = [];
    fetch('world/v1/places.json').then((r) => r.json()).then((p: Place[]) => {
      places = p;
      world.markets = p.filter((q) => q.k === 'market').map((q) => ({ x: q.x, z: q.z }));
    }).catch(() => {});
    let sea: { p: Float32Array; island: boolean }[] = [];
    // the water, painted in order: the frame as water, the land over it, islands, then lakes and the islands in them
    let sand: { p: Float32Array; line: boolean }[] = [];
    let seaBoxes: number[][] = [];
    // the water stops you: the lagoon, the creeks and the Atlantic (the shapes are painted in order, so the last
    // one holding a point says whether it is land or water) -- except on a bridge, or on the beach's sand
    /** open water: the sea and lagoon shapes are painted in order, land over sea, so the last one holding a point decides */
    const water = (x: number, z: number) => {
      let w = false;
      for (let i = 0; i < sea.length; i++) { const b = seaBoxes[i]; if (b && x > b[0] && x < b[1] && z > b[2] && z < b[3] && inside(sea[i].p, x, z)) w = !sea[i].island; }
      return w;
    };
    const wet = (x: number, z: number) => {
      if (!water(x, z)) return false;
      for (const t of world.tiles.values()) for (const r of t.roads) {
        if (!r.bridge || x < r.minX - 10 || x > r.maxX + 10 || z < r.minZ - 10 || z > r.maxZ + 10) continue;
        for (let i = 2; i < r.p.length; i += 2) { const x0 = r.p[i - 2], z0 = r.p[i - 1], dx = r.p[i] - x0, dz = r.p[i + 1] - z0, L2 = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)); if (Math.hypot(x0 + dx * u - x, z0 + dz * u - z) < r.w / 2 + 0.5) return false; }
      }
      for (const q of sand) if (q.line) for (let i = 2; i < q.p.length; i += 2) { const x0 = q.p[i - 2], z0 = q.p[i - 1], dx = q.p[i] - x0, dz = q.p[i + 1] - z0, L2 = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)); if (Math.hypot(x0 + dx * u - x, z0 + dz * u - z) < 22) return false; }
      return true;
    };
    // a boat needs water under it and a few metres of it all round (no grounding on the shore, no sailing over a bridge deck)
    const afloat = (x: number, z: number) => water(x, z) && water(x + 8, z) && water(x - 8, z) && water(x, z + 8) && water(x, z - 8) && wet(x, z); // (wet: not under a bridge deck, not on the beach)
    const stop = (x: number, z: number, pad?: number) => world.blocked(x, z, pad) || (wet(x, z) && !wet(me.x, me.z)); // (already in the water somehow: free to get out)
    const beachProps: Sprite[] = [];
    fetch('world2d/water.json').then((r) => r.json()).then((j: { frame: number[]; land: number[][]; islands: number[][]; water: number[][]; lakeIslands: number[][]; sand?: number[][]; beachLines?: number[][] }) => {
      const f = (a: number[]) => Float32Array.from(a, (v) => v / 10);
      sea = [{ p: f(j.frame), island: false }, ...j.land.map((a) => ({ p: f(a), island: true })), ...j.islands.map((a) => ({ p: f(a), island: true })),
        ...j.water.map((a) => ({ p: f(a), island: false })), ...j.lakeIslands.map((a) => ({ p: f(a), island: true }))];
      mapData.current.sea = sea;
      seaBoxes = sea.map((q) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (let i = 0; i < q.p.length; i += 2) { a = Math.min(a, q.p[i]); b = Math.max(b, q.p[i]); c = Math.min(c, q.p[i + 1]); d = Math.max(d, q.p[i + 1]); } return [a, b, c, d]; });
      sand = [...(j.sand ?? []).map((a) => ({ p: f(a), line: false })), ...(j.beachLines ?? []).map((a) => ({ p: f(a), line: true }))];
      mapData.current.sand = sand;
      // beach life along the Atlantic: umbrellas and loungers on the sand, palms behind (the ocean is to the south)
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (const l of sand) if (l.line) {
        for (let i = 2; i < l.p.length; i += 2) {
          const x0 = l.p[i - 2], z0 = l.p[i - 1], x1 = l.p[i], z1 = l.p[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
          for (let d = 0; d < L; d += 22) {
            const t = d / L, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, k = rnd();
            // inland: the coastline keeps the land on its left, which in these coordinates is (dz, -dx)
            const ix = (z1 - z0) / L, iz = -(x1 - x0) / L, along = (rnd() - 0.5) * 8;
            const at = (inland: number) => ({ x: x + ix * inland + ((x1 - x0) / L) * along, z: z + iz * inland + ((z1 - z0) / L) * along });
            if (k < 0.45) beachProps.push({ s: k < 0.25 ? 'stall-yellow' : 'stall-blue', ...at(6 + rnd() * 9), up: true }); // umbrellas on the sand
            else if (k < 0.8) beachProps.push({ s: 'palm', ...at(24 + rnd() * 8), up: true }); // palms where the sand meets the land
          }
        }
      }
    }).catch(() => {});
    // start on the Marina, Lagos Island, by the lagoon -- then step onto the nearest real road
    const start = toXZ([6.4497, 3.3935]);
    const me = { x: start.x, z: start.z, face: 0, step: 0, dist: 0, heading: 0, moving: false, car: null as null | { sprite: string; v: number; rot: number } };
    situationRef.current = () => {
      const road = world.nearestRoad(me.x, me.z, 80, KIND.residential);
      let area = '', ad = Infinity;
      for (const d of DISTRICTS) { const p = toXZ(d.at), q = Math.hypot(p.x - me.x, p.z - me.z); if (q < ad) { ad = q; area = d.name; } }
      const near = LANDMARKS.map((l) => ({ name: l.name, ...toXZ(l.at) })).map((l) => ({ name: l.name, m: Math.round(Math.hypot(l.x - me.x, l.z - me.z)) })).filter((l) => l.m < 1500).sort((p, q) => p.m - q.m).slice(0, 4);
      const doing = hudKey.current ? JSON.parse(hudKey.current) : null;
      return { game: 'NAIJA 2099 (2D)', district: ad < 4000 ? area : 'outskirts', street: road?.r.name ?? null, landmarksNear: near,
        travelling: me.car ? 'driving' : me.moving ? 'walking' : 'standing', time: nightRef.current ? 'night' : 'day', doing };
    };
    mapData.current.me = me;
    fetch('world2d/overview.json').then((r) => r.json()).then((o: Overview) => { mapData.current.overview = o; }).catch(() => {});
    // a ride across town: pay the danfo fare, arrive, and step off onto the nearest street once it has loaded
    let arriving = false;
    travelRef.current = async (x, z, name) => {
      setCityMap(false);
      if (job) { say('Finish your job first -- the customer is waiting.'); return; }
      if (Math.hypot(x - me.x, z - me.z) < 150) { say('You are already there. Walk it!'); return; }
      try {
        const r = await api.cityPay('danfo');
        if ('error' in r && r.error) { say(String(r.error)); return; }
        setWallet((r as { naira: number }).naira);
      } catch { say('No danfo answered. Try again.'); return; }
      if (me.car) { me.car = null; setDriving(false); }
      me.x = x; me.z = z; cam.x = x; cam.z = z;
      cars.length = 0; walkers.length = 0; arriving = true;
      say(`Danfo to ${name}. "${name === 'there' ? 'Owa o!' : `${name}, owa o!`}"`);
    };
    // the camera: the mouse turns it round you (drag left/right) and tips it (drag up/down)
    let pitch = Math.asin(0.6);
    const cam: Cam = { x: me.x, z: me.z, scale: 16, w: 0, h: 0, dpr: 1, yaw: 0, tilt: Math.sin(pitch), rise: Math.cos(pitch) };
    let zoom = 16; // px per metre: framed like the poster, close on the street
    const cars: Car[] = [], walkers: Walker[] = [], boats: Boat[] = [];
    let job: Job | null = null;
    const keys = new Set<string>();
    (window as unknown as { __naija?: unknown }).__naija = { cars, walkers, boats, me, world, get marks() { return marks; }, snap: snapMarks, wet, scenery };
    // cars per 100 m of road, by kind: Third Mainland and the expressways are packed, side streets nearly empty
    const DENSITY = [3.2, 2.4, 0.7, 0.3, 0.1];
    let roadPool: Road[] = [], poolAt = { x: Infinity, z: 0 }, wanted = 0, poolTime = 0;
    const refreshPool = () => {
      roadPool = world.roadsNear(me.x, me.z, 170, KIND.tertiary).filter((r) => r.kind !== KIND.link);
      wanted = Math.min(48, Math.round(roadPool.reduce((n, r) => n + (r.len * (DENSITY[r.kind] ?? 0)) / 100, 0) * 0.55));
      poolAt = { x: me.x, z: me.z }; poolTime = performance.now();
    };
    const spawnCar = (_near: { x: number; z: number }) => {
      const total = roadPool.reduce((n, r) => n + r.len * (DENSITY[r.kind] ?? 0), 0);
      if (!total) return;
      let pick = Math.random() * total, r = roadPool[0];
      for (const q of roadPool) { pick -= q.len * (DENSITY[q.kind] ?? 0); if (pick <= 0) { r = q; break; } }
      const dir: 1 | -1 = r.oneway || Math.random() < 0.5 ? 1 : -1;
      const sprite = CAR_SPRITES[Math.floor(Math.random() * CAR_SPRITES.length)];
      const lanes = Math.max(1, Math.floor(r.w / 3.4 / (r.oneway ? 1 : 2)));
      cars.push({ r, s: Math.random() * r.len, dir, v: sprite === 'bus-brt' ? 9 : 10 + Math.random() * 6, sprite, lane: Math.floor(Math.random() * lanes), x: 0, z: 0, rot: 0 });
    };
    const spawnWalker = (near: { x: number; z: number }) => {
      // people walk on pavements: beside proper streets, in the middle of the pavement, never on a carriageway
      const rs = world.roadsNear(near.x, near.z, 100, KIND.residential).filter((q) => q.kind !== KIND.link && q.kind !== KIND.service);
      if (!rs.length) return;
      const r = rs[Math.floor(Math.random() * rs.length)];
      const side = Math.random() < 0.5 ? -1 : 1, s0 = Math.random() * r.len;
      const a = along(r.p, r.cum, s0), off = pavementOffset(r) * side;
      const px = a.x - a.dz * off, pz = a.z + a.dx * off;
      const hit = world.nearestRoad(px, pz, 25, KIND.residential);
      if (hit && hit.d < hit.r.w / 2 + 0.3) return; // that spot is on another road's tarmac
      if (world.blocked(px, pz, 0.3)) return;
      walkers.push({ r, s: s0, dir: Math.random() < 0.5 ? 1 : -1, v: 1 + Math.random() * 0.6, sprite: WALKERS[Math.floor(Math.random() * 4)], side, x: 0, z: 0, left: false, look: lookFor(1 + Math.floor(Math.random() * 1e6)), heading: 0 });
    };
    const placeCar = (c: Car) => {
      const s = c.dir === 1 ? c.s : c.r.len - c.s;
      const a = along(c.r.p, c.r.cum, s);
      const dx = a.dx * c.dir, dz = a.dz * c.dir;
      const off = c.r.oneway ? (c.lane - (Math.max(1, Math.floor(c.r.w / 3.4)) - 1) / 2) * 3.4 : 1.9 + c.lane * 3.4;
      c.x = a.x - dz * off; c.z = a.z + dx * off; c.rot = heading(dx, dz);
    };
    // ---- input ----
    const down = (e: KeyboardEvent) => {
      // typing a name (or anything) in a text box is not driving
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) { if (e.key === 'Escape') { setWyrdOpen(false); (el as HTMLElement).blur(); } return; }
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === 'e') toggleCar();
      if (k === 'n') setNight((v) => !v);
      if (k === 'r') setStanding((v) => (v ? false : 'standing'));
      if (k === 'm') setBoard((v) => !v);
      if (k === 't') { e.preventDefault(); setWyrdOpen((v) => !v); }
      if (k === 'q' && !e.repeat) tuneRadio();
      if (k === 'tab') { e.preventDefault(); if (!e.repeat) setCityMap((v) => !v); }
      if (k === 'escape') { if (boardRef.current) setBoard(false); setWyrdOpen(false); }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom = Math.max(3, Math.min(22, zoom * (e.deltaY > 0 ? 0.88 : 1.14))); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    let drag: { x: number; y: number } | null = null;
    const pdown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
    const pmove = (e: PointerEvent) => {
      if (!drag) return;
      cam.yaw += (e.clientX - drag.x) * 0.006;
      pitch = Math.max(0.15, Math.min(1.0, pitch + (e.clientY - drag.y) * 0.004)); // ~9 (almost eye level) to ~57 degrees above the ground
      cam.tilt = Math.sin(pitch); cam.rise = Math.cos(pitch);
      drag = { x: e.clientX, y: e.clientY };
    };
    const pup = () => { drag = null; canvas.style.cursor = 'grab'; };
    const noMenu = (e: Event) => e.preventDefault();
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', pdown); canvas.addEventListener('pointermove', pmove);
    canvas.addEventListener('pointerup', pup); canvas.addEventListener('pointercancel', pup); canvas.addEventListener('contextmenu', noMenu);
    function toggleCar() {
      if (me.car) {
        const rot = me.car.rot;
        cars.push({ ...nearestRoadCar(me.x, me.z, me.car.sprite), v: 0, rot } as Car);
        me.x += Math.cos(rot) * 2.6; me.z -= Math.sin(rot) * 2.6; // step out on the driver's side
        me.car = null; setDriving(false);
        return;
      }
      let best = -1, bd = 7;
      cars.forEach((c, i) => { const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < bd && c !== (job?.type === 'chase' ? job.thief : null)) { bd = d; best = i; } });
      if (best < 0) { say('No car close enough. Walk up to one and press E.'); return; }
      const c = cars.splice(best, 1)[0];
      me.x = c.x; me.z = c.z; me.car = { sprite: c.sprite, v: 0, rot: c.rot };
      setDriving(true);
      say(c.sprite === 'car-danfo' ? 'You have a danfo. Press M for a danfo run.' : 'You are driving. W to go, S to brake, A/D to steer.');
    }
    function nearestRoadCar(x: number, z: number, sprite: string): Partial<Car> {
      const n = world.nearestRoad(x, z, 30, KIND.residential);
      return n ? { r: n.r, s: n.s, dir: 1, sprite, lane: 0, x, z, rot: 0 } : { sprite, x, z };
    }
    // ---- jobs ----
    const nearPlaces = (x: number, z: number, min: number, max: number, kinds: string[]) =>
      places.filter((p) => kinds.includes(p.k) && p.n && Math.hypot(p.x - x, p.z - z) > min && Math.hypot(p.x - x, p.z - z) < max);
    const begin = async (t: 'delivery' | 'danfo' | 'chase') => {
      const r = await api.cityJobStart(t);
      if ('error' in r) throw new Error(r.error);
      return r;
    };
    startJobRef.current = async (type) => {
      setBoard(false);
      if (job) { say('Finish the job you have first.'); return; }
      try {
        if (type === 'delivery') {
          const picks = nearPlaces(me.x, me.z, 60, 700, ['market', 'food', 'mall', 'hotel']);
          const pick = picks.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
          if (!pick) { say('No shop nearby has a parcel. Try another part of town.'); return; }
          const drops = nearPlaces(pick.x, pick.z, 600, 2600, ['market', 'hotel', 'bank', 'gov', 'hospital', 'mall']);
          const drop = drops[Math.floor(Math.random() * drops.length)];
          if (!drop) { say('Nowhere to deliver to from here yet.'); return; }
          const dist = Math.round(Math.hypot(drop.x - pick.x, drop.z - pick.z));
          const limit = Math.min(900, Math.max(90, Math.round(dist / 6 + 60)));
          const st = await begin('delivery');
          job = { type, id: st.id, pick, drop, carrying: false, limit, started: performance.now(), dist };
          say(`Collect the parcel at ${pick.n}.`);
        } else if (type === 'danfo') {
          if (!me.car || me.car.sprite !== 'car-danfo') { say('Find a yellow danfo, press E to take it, then start the run.'); return; }
          const stops: { x: number; z: number; name: string }[] = [];
          let from = { x: me.x, z: me.z };
          for (let i = 0; i < 4; i++) {
            const n = world.roadsNear(from.x, from.z, 700, KIND.secondary).filter((r) => r.name).sort(() => Math.random() - 0.5)[0];
            if (!n) break;
            const a = along(n.p, n.cum, n.len / 2);
            if (Math.hypot(a.x - from.x, a.z - from.z) < 250) continue;
            stops.push({ x: a.x, z: a.z, name: n.name! });
            from = a;
          }
          if (stops.length < 2) { say('No bus stops mapped near here. Drive to a main road first.'); return; }
          const st = await begin('danfo');
          job = { type, id: st.id, stops, at: 0, passengers: 0, started: performance.now(), wait: 0 };
          say(`Danfo run: ${stops.map((x) => x.name).join(' → ')}. Stop at each to load.`);
        } else {
          const n = world.nearestRoad(me.x + 40, me.z, 120, KIND.tertiary);
          if (!n) { say('Get closer to a main road.'); return; }
          const st = await begin('chase');
          const thief: Car = { r: n.r, s: n.s, dir: 1, v: 8.5, sprite: 'okada', lane: 0, x: n.x, z: n.z, rot: 0 };
          cars.push(thief);
          job = { type, id: st.id, thief, started: performance.now() };
          say('Thief! A phone snatcher is getting away on an okada. Catch them in 90 seconds.');
        }
      } catch (e) { say((e as Error)?.message || 'Could not reach the city. Try again.'); }
    };
    const finish = async (dist: number, passengers: number, limitS: number) => {
      const j = job!; job = null; setHud(null);
      try {
        const r = await api.cityJobFinish(j.id, dist, passengers, limitS);
        if ('error' in r && r.error) say(String(r.error));
        else { setWallet((r as { naira: number }).naira); say(`Paid ${naira((r as { paid?: number }).paid ?? 0)}. ${(r as { note?: string }).note ?? ''}`); }
      } catch { say('The city did not answer. Your pay will come next time.'); }
    };
    // ---- the story: one step at a time, decided by the server ----
    let storyBusy = false;
    actRef.current = async (mission: string, move: string) => {
      if (storyBusy) return;
      storyBusy = true; setTalkBusy(true);
      try {
        const r = await api.cityStoryAct(mission, move);
        if (r.error) say(r.error);
        else {
          if (r.story) setStory((p) => ({ ...p, ...r.story! }));
          if (r.naira != null) setWallet(r.naira);
          setTalk(null);
          if (r.bulletin) setTimeout(() => wyrdSay(r.bulletin!), 3600); // after the scene, the city mind reports what changed
          if (r.say) say(r.paid ? `${r.say}  (+₦${r.paid.toLocaleString('en-NG')})` : r.say);
        }
      } catch { say('The city did not answer. Try again.'); }
      storyBusy = false; setTalkBusy(false);
    };
    let storyTarget: { x: number; z: number } | null = null, lastArrive = 0;
    // ---- loop ----
    let last = performance.now(), hudTick = 0, raf = 0;
    const districtsXZ = DISTRICTS.map((d) => ({ name: d.name, ...toXZ(d.at) }));
    world.ready.then(() => {
      world.around(me.x, me.z, 900);
      setTimeout(() => {
        const n = world.nearestRoad(me.x, me.z, 400, KIND.secondary);
        if (n) { me.x = n.x - n.r.w; me.z = n.z; cam.x = me.x; cam.z = me.z; }
        if (alive) setLoading(false);
      }, 1200);
    });
    let slowAvg = 16, quality = 2, qualityAt = performance.now(), lastHaze = -1, lastHazeNight = false, lastLive = { x0: 0, y0: 0, x1: 99999, y1: 99999 };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // sharpness that keeps up: full device resolution while frames are quick; standard resolution on
      // slower graphics (a 1.25x screen draws half again as many pixels), judged over the last couple of seconds
      slowAvg = slowAvg * 0.97 + Math.min(100, dt * 1000) * 0.03;
      if (slowAvg > 24 && quality > 1 && now - qualityAt > 3000) { quality = 1; qualityAt = now; }
      const dpr = Math.min(2, window.devicePixelRatio || 1, quality);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // move
      const ax = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const az = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      if (!boardRef.current) {
        if (me.car) {
          const c = me.car;
          c.v += (-az) * (az < 0 ? 9 : 14) * dt;
          if (!az) c.v *= 1 - 0.8 * dt;
          c.v = Math.max(-5, Math.min(24, c.v));
          c.rot -= ax * dt * 2.2 * Math.min(1, Math.abs(c.v) / 6) * Math.sign(c.v || 1);
          const nx = me.x + Math.sin(c.rot) * c.v * dt, nz = me.z + Math.cos(c.rot) * c.v * dt;
          if (stop(nx, nz, 1.2)) c.v *= -0.3; else { me.x = nx; me.z = nz; }
        } else if (ax || az) {
          const sp = (keys.has('shift') ? 5.2 : 1.55) * dt, L = Math.hypot(ax, az); // a walk is ~1.5 m/s; a run is a real run
          const co = Math.cos(cam.yaw), si = Math.sin(cam.yaw);
          const wx = (co * ax + si * az) / L, wz = (-si * ax + co * az) / L;
          const nx = me.x + wx * sp, nz = me.z + wz * sp;
          if (!stop(nx, me.z)) me.x = nx;
          if (!stop(me.x, nz)) me.z = nz;
          me.step += sp / (keys.has('shift') ? 1.1 : 0.8); // one stride: ~0.8 m walking, longer running
          me.dist += sp;
          me.heading = Math.atan2(wx, wz); me.face = me.heading;
        }
        me.moving = !me.car && !!(ax || az);
      }
      world.around(me.x, me.z, 800);
      if (arriving && world.tiles.has(`${Math.floor(me.x / 500)}_${Math.floor(me.z / 500)}`)) {
        const n = world.nearestRoad(me.x, me.z, 400, KIND.residential);
        if (n) { const side = n.r.w / 2 + 1.5; const a = along(n.r.p, n.r.cum, n.s); me.x = n.x - a.dz * side; me.z = n.z + a.dx * side; cam.x = me.x; cam.z = me.z; }
        arriving = false;
      }
      snapMarks();
      // the city around: traffic, people, boats
      if (Math.hypot(me.x - poolAt.x, me.z - poolAt.z) > 40 || now - poolTime > 2000) refreshPool();
      for (let n = 0; n < 3 && cars.length < wanted; n++) spawnCar(me);
      while (walkers.length < 40) { const before = walkers.length; spawnWalker(me); if (walkers.length === before) break; }
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        if (!c.r) continue;
        const ahead = cars.some((o) => o !== c && o.r === c.r && o.dir === c.dir && o.lane === c.lane && ((o.s - c.s) > 0 && (o.s - c.s) < 9));
        const nearMe = Math.hypot(c.x - me.x, c.z - me.z) < 5 && !me.car;
        const tv = ahead || nearMe ? 0 : (job?.type === 'chase' && job.thief === c ? 8.5 : c.v || 11);
        c.s += tv * dt;
        if (c.s >= c.r.len) {
          // carry on along a road that starts where this one ends, else turn round
          const end = along(c.r.p, c.r.cum, c.dir === 1 ? c.r.len : 0);
          const next = world.roadsNear(end.x, end.z, 30, KIND.tertiary).find((r) => r !== c.r && (Math.hypot(r.p[0] - end.x, r.p[1] - end.z) < 4 || Math.hypot(r.p[r.p.length - 2] - end.x, r.p[r.p.length - 1] - end.z) < 4));
          if (next) { c.dir = Math.hypot(next.p[0] - end.x, next.p[1] - end.z) < 4 ? 1 : -1; if (next.oneway && c.dir === -1) c.dir = 1; c.r = next; c.s = 0; }
          else { c.dir = (c.r.oneway ? 1 : -c.dir) as 1 | -1; c.s = 0; }
        }
        placeCar(c);
        if (Math.hypot(c.x - me.x, c.z - me.z) > 280 && !(job?.type === 'chase' && job.thief === c)) cars.splice(i, 1);
      }
      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i];
        w.s += w.v * dt;
        if (w.s >= w.r.len) { w.dir = (-w.dir) as 1 | -1; w.s = 0; }
        const a = along(w.r.p, w.r.cum, w.dir === 1 ? w.s : w.r.len - w.s), off = pavementOffset(w.r) * w.side;
        const nx = a.x - a.dz * off, nz = a.z + a.dx * off;
        if (Math.hypot(nx - w.x, nz - w.z) > 0.001) w.heading = Math.atan2(nx - w.x, nz - w.z);
        w.x = nx; w.z = nz;
        if (Math.hypot(w.x - me.x, w.z - me.z) > 180) walkers.splice(i, 1);
      }
      if (boats.length < 5 && sea.length) {
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 200, x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d;
        if (afloat(x, z)) boats.push({ x, z, a: Math.random() * Math.PI * 2, v: 3 + Math.random() * 4 });
      }
      for (let i = boats.length - 1; i >= 0; i--) {
        const b = boats[i];
        const nx = b.x + Math.cos(b.a) * b.v * dt, nz = b.z + Math.sin(b.a) * b.v * dt;
        if (afloat(nx, nz)) { b.x = nx; b.z = nz; } else b.a += Math.PI * 0.6;
        if (Math.hypot(b.x - me.x, b.z - me.z) > 500) boats.splice(i, 1);
      }
      // the job
      if (job) {
        const t = (now - job.started) / 1000;
        if (job.type === 'delivery') {
          const tgt = job.carrying ? job.drop : job.pick;
          if (Math.hypot(tgt.x - me.x, tgt.z - me.z) < 14) {
            if (!job.carrying) { job.carrying = true; say(`Parcel collected. Take it to ${job.drop.n}.`); }
            else { void finish(job.dist, 0, job.limit); }
          } else if (job.carrying && t > job.limit + 15) { say('Too late — the customer gave up.'); job = null; setHud(null); }
        } else if (job.type === 'danfo') {
          const stop = job.stops[job.at];
          if (!me.car || me.car.sprite !== 'car-danfo') { /* waits for you to get back in */ }
          else if (Math.hypot(stop.x - me.x, stop.z - me.z) < 18 && Math.abs(me.car.v) < 1.5) {
            job.wait += dt;
            if (job.wait > 2) {
              const n = 2 + Math.floor(Math.random() * 4);
              job.passengers = Math.min(18, job.passengers + n); job.wait = 0; job.at++;
              say(`${stop.name}: ${n} passengers on. "Wetin be the fare, driver?"`);
              if (job.at >= job.stops.length) void finish(0, job.passengers, 0);
            }
          }
        } else {
          const th = job.thief;
          if (Math.hypot(th.x - me.x, th.z - me.z) < (me.car ? 5 : 3)) { cars.splice(cars.indexOf(th), 1); void finish(0, 0, 0); }
          else if (t > 90) { cars.splice(cars.indexOf(th), 1); job = null; setHud(null); say('The thief got away this time.'); }
        }
      }
      // camera
      const want = me.car ? Math.min(zoom, 11) : zoom; // pull back a little at the wheel, to see the road ahead
      cam.w = W; cam.h = H; cam.dpr = dpr;
      cam.scale += (want - cam.scale) * Math.min(1, dt * 3);
      if (Math.abs(want - cam.scale) < want * 0.002) cam.scale = want; // settle exactly, so the scenery cache can hold
      cam.x += (me.x - cam.x) * Math.min(1, dt * 5);
      cam.z += (me.z - cam.z) * Math.min(1, dt * 5);
      // draw
      const v = viewOf(cam);
      const tiles = [...world.tiles.values()];
      const night = nightRef.current;
      // the still things (landmarks, beach umbrellas and palms) and the moving ones (boats, traffic, people, you)
      const fixed: Sprite[] = [...marks, ...beachProps];
      const spr: Sprite[] = [];
      // boats: the water taxi, seen from every side and camera height like the cars (it moves along (cos a, sin a); a heading h moves along (sin h, cos h))
      for (const b of boats) spr.push({ s: 'boat-taxi', x: b.x, z: b.z, veh: true, heading: Math.atan2(Math.cos(b.a), Math.sin(b.a)) });
      for (const c of cars) spr.push({ s: c.sprite, x: c.x, z: c.z, veh: true, heading: c.rot });
      for (const w of walkers) spr.push({ s: w.sprite, x: w.x, z: w.z, look: w.look, heading: w.heading, walk: (w.s / 0.7) % 2 });
      let playerSprite: Sprite | null = null;
      if (me.car) { playerSprite = { s: me.car.sprite, x: me.x, z: me.z, veh: true, heading: me.car.rot }; spr.push(playerSprite); }
      else {
        // TEN himself: his motion-captured walk, run and idle, played by how far he has moved
        const running = me.moving && keys.has('shift');
        const anim = !me.moving ? 'idle' : running ? 'run' : 'walk';
        // one clip cycle covers about two strides: ~1.5 m walking, ~2.6 m running
        const frame = anim === 'idle' ? (now / 330) : (me.dist / (running ? 2.6 : 1.5)) * 10;
        playerSprite = { s: 'player', x: me.x, z: me.z, heading: me.heading, hero: { who: heroRef.current, anim, frame } };
        spr.push(playerSprite);
      }
      // night lights: each street lamp has two bulbs, on arms out to either side; each one shines, and lights the
      // ground under it. The lamp's picture always faces the camera, so its arms run along the screen: (cos yaw,
      // -sin yaw) in the world. Heights are as the picture stands (upright), so they're divided by the camera's rise.
      const lampPools: Light[] = [], carPools: Light[] = [], airLights: Light[] = [];
      if (night) {
        const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
        for (const t of tiles) for (const p of t.props) if (p.s === 'lamp') {
          for (const [off, up] of LAMP_BULBS) {
            const bx = p.x + rx * off, bz = p.z + rz * off;
            lampPools.push({ x: bx, z: bz + 0.6, r: 8, color: 'rgba(255,214,150,0.34)' });
            if (bx > v.minX && bx < v.maxX && bz > v.minZ && bz < v.maxZ) airLights.push({ x: bx, z: bz, r: 4.5, color: 'rgba(255,230,190,0.3)', y: up / cam.rise }, { x: bx, z: bz, r: 1.4, color: 'rgba(255,250,235,1)', y: up / cam.rise });
          }
        }
        for (const c of cars) carPools.push({ x: c.x + Math.sin(c.rot) * 4, z: c.z + Math.cos(c.rot) * 4, r: 6, color: 'rgba(200,240,255,0.5)' });
        if (me.car) carPools.push({ x: me.x + Math.sin(me.car.rot) * 5, z: me.z + Math.cos(me.car.rot) * 5, r: 9, color: 'rgba(200,240,255,0.6)' });
        for (const m of marks) airLights.push({ x: m.x, z: m.z - 10, r: 40, color: 'rgba(120,80,255,0.18)', y: 20 });
      }
      // the still city from the cache; while the camera turns, tilts or zooms, drawn directly instead
      const cached = scenery.draw(ctx, cam, dpr, night, sea, sand, fixed, lampPools, now);
      let hidden: boolean;
      const upright = (to: CanvasRenderingContext2D, glow?: CanvasRenderingContext2D) => (cached
        ? drawMoving(to, cam, tiles, fixed, spr, v, night, me, glow)
        : drawUpright(to, cam, tiles, [...fixed, ...spr], v, night, me, glow));
      if (!cached) { drawGround(ctx, cam, tiles, sea, v, sand); drawBridges(ctx, cam, tiles, v); }
      if (night) {
        if (!cached) nightGround(ctx, cam, tiles, [...lampPools, ...carPools], v);
        else lightPools(ctx, cam, carPools, v);
        // the upright layer on its own canvas, dimmed, then laid over the ground; what shines laid over that
        if (layer.width !== canvas.width || layer.height !== canvas.height) { layer.width = canvas.width; layer.height = canvas.height; }
        // (clear only what was drawn last frame)
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0); lctx.clearRect(lastLive.x0, lastLive.y0, lastLive.x1 - lastLive.x0, lastLive.y1 - lastLive.y0);
        if (glowC.width !== canvas.width || glowC.height !== canvas.height) { glowC.width = canvas.width; glowC.height = canvas.height; }
        gl.setTransform(1, 0, 0, 1, 0, 0); gl.clearRect(0, 0, glowC.width, glowC.height); gl.setTransform(dpr, 0, 0, dpr, 0, 0);
        hidden = upright(lctx, gl);
        if (hidden && playerSprite) drawGhost(lctx, cam, playerSprite);
        // only the part of the layer holding moving things is darkened and laid over (the whole screen each frame is dear)
        const bx = cached ? { x0: Math.max(0, Math.floor(liveBox.x0) - 4), y0: Math.max(0, Math.floor(liveBox.y0) - 40), x1: Math.min(W, Math.ceil(liveBox.x1) + 4), y1: Math.min(H, Math.ceil(liveBox.y1) + 4) } : { x0: 0, y0: 0, x1: W, y1: H };
        if (bx.x1 > bx.x0 && bx.y1 > bx.y0 && layer.width && layer.height) {
          lctx.save(); lctx.globalCompositeOperation = 'source-atop'; lctx.fillStyle = 'rgba(8,12,26,0.55)'; lctx.fillRect(bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0); lctx.restore();
          ctx.drawImage(layer, bx.x0 * dpr, bx.y0 * dpr, (bx.x1 - bx.x0) * dpr, (bx.y1 - bx.y0) * dpr, bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0);
        }
        lastLive = cached ? { x0: liveBox.x0 - 50, y0: liveBox.y0 - 60, x1: liveBox.x1 + 50, y1: liveBox.y1 + 50 } : { x0: 0, y0: 0, x1: W, y1: H };
        if (glowC.width && glowC.height && (!cached || redrawn)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; ctx.drawImage(glowC, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(glowC, 0, 0, W, H); ctx.restore(); }
        nightLights(ctx, cam, airLights, v, tiles);
      } else {
        hidden = upright(ctx);
        if (hidden && playerSprite) drawGhost(ctx, cam, playerSprite);
      }
      // the job's target: a bouncing marker
      const tgt = !job ? storyTarget : job.type === 'delivery' ? (job.carrying ? job.drop : job.pick) : job.type === 'danfo' ? job.stops[job.at] : job.thief;
      if (tgt) {
        const { sx, sy } = toScreen(cam, tgt.x, tgt.z, 4 + Math.sin(now / 200));
        ctx.fillStyle = '#F2C94C'; ctx.beginPath(); ctx.moveTo(sx, sy + 10); ctx.lineTo(sx - 9, sy - 6); ctx.lineTo(sx + 9, sy - 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
      }
      // the player's marker, as in the poster
      if (!me.car) {
        const { sx, sy } = toScreen(cam, me.x, me.z, 3.4);
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(sx, sy + 6); ctx.lineTo(sx - 6, sy - 5); ctx.lineTo(sx + 6, sy - 5); ctx.closePath(); ctx.fill();
      }
      // (the distance haze is a page layer, set here from the camera's angle)
      if (hazeRef.current) { const hz = Math.max(0, Math.min(1, (0.62 - cam.tilt) / 0.32)); if (hz !== lastHaze || night !== lastHazeNight) { lastHazeNight = night; lastHaze = hz; hazeRef.current.style.opacity = String(hz); hazeRef.current.style.display = hz > 0.01 && !night ? 'block' : 'none'; } } // (a hidden layer costs nothing to composite)
      // HUD, ten times a second
      if (now - hudTick > 100) {
        hudTick = now;
        if (job) {
          const t = (now - job.started) / 1000;
          if (job.type === 'delivery') { const left = Math.max(0, Math.ceil(job.limit - t)); setHud({ kind: 'job', head: 'Delivery', title: job.carrying ? 'Deliver the parcel to' : 'Collect the parcel at', target: (job.carrying ? job.drop.n : job.pick.n) ?? 'the shop', time: job.carrying ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : undefined, urgent: job.carrying && left < 30 }); }
          else if (job.type === 'danfo') setHud({ kind: 'job', head: `Danfo run · ${job.passengers} on board`, title: 'Next stop', target: job.stops[job.at]?.name ?? '' });
          else { const left = Math.max(0, Math.ceil(90 - t)); setHud({ kind: 'job', head: 'Phone snatcher', title: 'Catch the thief', target: 'on the okada', time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, urgent: left < 20 }); }
        }
        // the mission: where to go next, and what happens when you get there
        // one mission at a time: the one under way, else the nearest one waiting to be started
        const st = storyRef.current;
        const stepOf = (m: MissionDef) => st?.missions?.[m.id]?.step ?? '';
        let mission: MissionDef | undefined = st ? MISSIONS.find((m) => stepOf(m) !== '' && stepOf(m) !== 'done') : undefined;
        if (st && !mission) {
          let bd = Infinity;
          for (const m of MISSIONS) {
            if (stepOf(m) !== '') continue;
            const p = beatPoint(m.beats[''], marks);
            const d = p ? Math.hypot(p.x - me.x, p.z - me.z) : Infinity;
            if (d < bd) { bd = d; mission = m; }
          }
        }
        const step = mission ? stepOf(mission) : '';
        const beat = mission ? mission.beats[step] : undefined;
        const tag = mission ? `${mission.id}:${step}` : '';
        storyTarget = beat ? beatPoint(beat, marks) : null;
        if (!job) setHud(beat && mission ? { kind: step === '' ? 'offer' : 'mission', head: mission.title, title: beat.objective, target: beat.place } : null);
        if (beat && mission && storyTarget && !job) {
          const near = Math.hypot(storyTarget.x - me.x, storyTarget.z - me.z) < beat.radius;
          if (!near && dismissed.current === tag) dismissed.current = null;
          if (near && beat.arriveMove) {
            if (beat.vehicle && !me.car) { if (dismissed.current !== tag) { say('Forty baskets won\'t fit on your head — bring a vehicle.'); dismissed.current = tag; } }
            else if (now - lastArrive > 8000) { lastArrive = now; void actRef.current(mission.id, beat.arriveMove); } // the server may say "not that fast": try again every few seconds
          } else if (near && !talkRef.current && dismissed.current !== tag && beat.choices.length) setTalk({ beat, mission: mission.id });
        }
        drawMini(mctx, me, cam, tiles, sea, tgt, now);
        const near = world.nearestRoad(me.x, me.z, 60, KIND.residential);
        setWhere(near?.r.name ?? '');
        let area = '', ad = Infinity;
        for (const d of districtsXZ) { const q = Math.hypot(d.x - me.x, d.z - me.z); if (q < ad) { ad = q; area = d.name; } }
        setLive({ dist: tgt ? (d => (d < 1000 ? Math.round(d / 10) * 10 : Math.round(d / 100) * 100))(Math.hypot(tgt.x - me.x, tgt.z - me.z)) : null, kmh: me.car ? Math.round(Math.abs(me.car.v) * 3.6) : 0, area: ad < 4000 ? area : '' });
      }
    };
    raf = requestAnimationFrame(frame);
    // (debug: time [n] whole frames, waiting for the graphics to finish each one)
    (window as unknown as { __naija: Record<string, unknown> }).__naija.bench = (n = 20) => { const t0 = performance.now(); for (let i = 0; i < n; i++) { frame(performance.now()); cancelAnimationFrame(raf); ctx.getImageData(0, 0, 1, 1); } raf = requestAnimationFrame(frame); return (performance.now() - t0) / n; };
    return () => {
      alive = false; cancelAnimationFrame(raf); clearInterval(aside); radio.current?.off();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerdown', pdown); canvas.removeEventListener('pointermove', pmove);
      canvas.removeEventListener('pointerup', pup); canvas.removeEventListener('pointercancel', pup); canvas.removeEventListener('contextmenu', noMenu);
    };
  }, []);
  // warm the pictures
  useEffect(() => { ['player', 'car-danfo', 'car-red', 'palm', 'lamp', 'lm-civic-centre'].forEach(img); }, []);
  return (
    <View style={s.root}>
      {React.createElement('canvas', { ref: canvasRef, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', background: '#A9C98A' } })}
      {/* the distance haze: low cameras look far up the street, and it fades into the air */}
      {React.createElement('div', { ref: hazeRef, style: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%', pointerEvents: 'none', opacity: 0, display: 'none', background: night ? 'linear-gradient(180deg, rgba(30,10,52,0.95), rgba(30,10,52,0.5) 45%, rgba(30,10,52,0))' : 'linear-gradient(180deg, rgba(222,232,244,0.95), rgba(222,232,244,0.45) 45%, rgba(222,232,244,0))' } })}
      {/* the objective, top left: what to do, where, how far and how long */}
      {(() => {
        const accent = !hud ? CY.muted : hud.kind === 'job' ? CY.cyan : hud.kind === 'offer' ? CY.magenta : CY.yellow;
        const kicker = !hud ? 'FREE ROAM' : hud.kind === 'job' ? 'JOB' : hud.kind === 'offer' ? 'MISSION NEARBY' : 'MISSION';
        return (
          <Pressable onPress={() => { if (!hud) setBoard(true); }} style={s.objective}>
            <Panel accent={accent} edge={hud?.urgent ? CY.red : CY.line} cut={14} pad={0}>
              <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                <View style={[s.objBar, { backgroundColor: accent }]} />
                <View style={{ flex: 1, gap: 1, paddingVertical: 9, paddingHorizontal: 12 }}>
                  <View style={s.kickerRow}>
                    <Text style={[s.kicker, { color: accent }]}>{kicker}</Text>
                    {hud ? <Text style={s.head} numberOfLines={1}>// {hud.head.toUpperCase()}</Text> : null}
                  </View>
                  {hud ? <>
                    <Text style={s.objTitle} numberOfLines={1}>{hud.title}</Text>
                    <Text style={s.objTarget} numberOfLines={1}>{hud.target.toUpperCase()}</Text>
                  </> : <Text style={s.objTarget}>PRESS <Text style={{ color: CY.yellow }}>[M]</Text> FOR THE JOB BOARD</Text>}
                </View>
                {hud ? (
                  <View style={s.objSide}>
                    {live.dist != null ? <Text style={s.readout}>{live.dist >= 1000 ? `${(live.dist / 1000).toFixed(1)}KM` : `${live.dist}M`}</Text> : null}
                    {hud.time ? <Text style={[s.readout, { color: hud.urgent ? CY.red : CY.yellow }]}>{hud.time}</Text> : null}
                  </View>
                ) : null}
              </View>
            </Panel>
          </Pressable>
        );
      })()}

      {/* money and the hour, top right */}
      <View style={s.topRight}>
        <Panel accent={CY.green} cut={10} pad={0}>
          <View style={s.walletCard}>
            <Text style={s.kickerDim}>NAIRA</Text>
            <Text style={s.walletAmount}><Text style={{ color: CY.green }}>₦</Text>{wallet == null ? '——' : Math.round(wallet).toLocaleString('en-NG')}</Text>
          </View>
        </Panel>
        <Pressable onPress={() => setNight((v) => !v)}>
          <Panel accent={night ? CY.magenta : CY.yellow} cut={10} pad={0}>
            <View style={s.sky}>
              <Text style={[s.skyIcon, { color: night ? CY.magenta : CY.yellow }]}>{night ? '◐' : '◉'}</Text>
              <Text style={s.kickerDim}>{night ? 'NIGHT' : 'DAY'}</Text>
            </View>
          </Panel>
        </Pressable>
      </View>

      {/* the minimap and where you are, bottom left */}
      <View style={s.miniWrap}>
        <View style={s.miniRing}>
          {React.createElement('canvas', { ref: miniRef, width: 360, height: 360, style: { width: 172, height: 172, borderRadius: 86, display: 'block' } })}
        </View>
        {React.createElement('div', { style: { position: 'absolute', inset: -6, borderRadius: '50%', border: `1px dashed ${CY.line}`, pointerEvents: 'none' } })}
        <View style={s.miniN}><Text style={s.miniNText}>N</Text></View>
      </View>
      {live.area || where ? (
        <Panel style={s.where} accent={CY.cyan} cut={10} pad={0}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 7, gap: 1 }}>
            {live.area ? <Text style={[s.kicker, { color: CY.cyan }]}>{live.area.toUpperCase()}</Text> : null}
            {where ? <Text style={s.whereText} numberOfLines={1}>{where}</Text> : null}
          </View>
        </Panel>
      ) : null}

      {/* the radio: what's on, with a level meter */}
      {onAir ? (
        <Panel style={s.radio} accent={CY.green} edge="rgba(61,255,154,0.45)" cut={10} pad={0}>
          <View style={s.radioRow}>
            <View style={s.eq}>{[0, 1, 2, 3, 4, 5].map((i) => React.createElement('div', { key: i, className: 'cy-eq', style: { width: 3, background: CY.green, animationDelay: `${i * 0.13}s` } }))}</View>
            <View>
              <Text style={s.radioFreq}>{onAir.freq} FM  <Text style={{ color: CY.text }}>{onAir.name}</Text></Text>
              <Text style={s.kickerDim}>{onAir.tag.toUpperCase()}  ·  [Q] NEXT</Text>
            </View>
          </View>
        </Panel>
      ) : null}
      {/* the speedometer, at the wheel */}
      {driving ? (
        <Panel style={s.speedo} accent={CY.red} cut={12} pad={0}>
          <View style={{ alignItems: 'center', paddingHorizontal: 22, paddingVertical: 4 }}>
            <Text style={s.speed}>{String(live.kmh).padStart(3, '0')}</Text>
            <Text style={s.kickerDim}>KM/H</Text>
          </View>
        </Panel>
      ) : null}

      {/* controls, bottom right: each with its key */}
      <View style={s.controls}>
        <Text style={s.hint}>{driving ? 'W/S DRIVE · A/D STEER · E GET OUT' : 'WASD WALK · SHIFT RUN · E TAKE A CAR · SCROLL ZOOM · DRAG TURN'}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([
            ['TAB', 'MAP', () => setCityMap(true), CY.cyan],
            ['M', 'JOBS', () => setBoard(true), CY.cyan],
            ['R', 'STANDING', () => { setStanding('standing'); api.cityStory().then(setStory).catch(() => {}); }, CY.cyan],
            ['T', 'WYRD', () => setWyrdOpen((v) => !v), CY.magenta],
            ['Q', onAir ? onAir.freq : 'RADIO', () => tuneRadio(), CY.green],
            ['N', night ? 'DAY' : 'NIGHT', () => setNight((v) => !v), CY.yellow],
          ] as const).map(([key, label, go, tone]) => (
            <Pressable key={key} onPress={go} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [(pressed || hovered) && { transform: [{ translateY: -1 }] }]}>
              {((st: { hovered?: boolean }) => (
                <Panel accent={null} edge={st.hovered ? tone : CY.line} cut={8} pad={0}>
                  <View style={s.keyBtn}>
                    <Text style={[s.keycap, { color: CY.ink, backgroundColor: tone }]}>{key}</Text>
                    <Text style={s.keyLabel}>{label}</Text>
                  </View>
                </Panel>
              ))  as unknown as React.ReactNode}
            </Pressable>
          ))}
          <Pressable onPress={onExit}>
            {((st: { hovered?: boolean }) => (
              <Panel accent={null} edge={st.hovered ? CY.red : CY.line} cut={8} pad={0}>
                <View style={s.keyBtn}><Text style={[s.keyLabel, { color: CY.red }]}>EXIT</Text></View>
              </Panel>
            )) as unknown as React.ReactNode}
          </Pressable>
        </View>
      </View>

      {toast ? <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View> : null}
      {wyrdOpen ? <WyrdPanel lines={wyrdLines} onLine={addWyrd} night={night} situation={() => situationRef.current()} onClose={() => setWyrdOpen(false)} /> : null}
      {wyrd && !wyrdOpen ? <View style={s.wyrd}><Text style={s.wyrdWho}>WYRD://CITY.MIND</Text><Text style={s.wyrdText}>{wyrd.replace(/^WYRD city bulletin: /, '')}</Text></View> : null}
      {hero === null ? <ChooseCharacter onDone={(look) => setHero(look.base)} /> : null}
      {talk ? (
        <Dialogue who={talk.beat.who} line={talk.beat.line} choices={talk.beat.choices} busy={talkBusy}
          onChoose={(c: Choice) => void actRef.current(talk.mission, c.move)}
          onClose={() => { dismissed.current = `${talk.mission}:${storyRef.current?.missions?.[talk.mission]?.step ?? ''}`; setTalk(null); }} />
      ) : null}
      {standing ? <Standing story={story} start={standing} onClose={() => setStanding(false)} onLife={(move) => {
        api.cityStoryAct('life', move).then((r) => {
          if (r.error) { setToast(r.error); return; }
          if (r.story) setStory((p) => ({ ...p, ...r.story! }));
          if (r.naira != null) setWallet(r.naira);
          if (r.say) wyrdRef.current(r.say);
        }).catch(() => setToast('The city did not answer. Try again.'));
      }} /> : null}
      {cityMap ? (
        <CityMap overview={mapData.current.overview} sea={mapData.current.sea} sand={mapData.current.sand} me={{ x: mapData.current.me.x, z: mapData.current.me.z }}
          onTravel={(x, z, name) => travelRef.current(x, z, name)} onClose={() => setCityMap(false)} />
      ) : null}
      {board ? (
        <View style={s.boardWrap}>
          <View style={s.board}>
            <Text style={s.boardTitle}>JOB BOARD</Text>
            <Text style={s.boardSub}>Real jobs, paid by the city when you finish them.</Text>
            {([
              ['delivery', 'Delivery', 'Collect a parcel at a real shop nearby and get it across town before the customer gives up.'],
              ['danfo', 'Danfo run', 'Take a yellow danfo (walk up, press E), drive the route and stop at each bus stop to load passengers.'],
              ['chase', 'Phone snatcher', 'A thief on an okada has a woman\'s phone. Catch them inside 90 seconds — a car helps.'],
            ] as const).map(([k, t, d]) => (
              <Pressable key={k} onPress={() => startJobRef.current(k)} style={({ pressed }) => [s.jobRow, pressed && { opacity: 0.8 }]}>
                <Text style={s.jobName}>{t}</Text>
                <Text style={s.jobDesc}>{d}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setBoard(false)} style={[s.btn, { alignSelf: 'flex-end', marginTop: 6 }]}><Text style={s.btnText}>Close</Text></Pressable>
          </View>
        </View>
      ) : null}
      {loading ? <View style={s.loading}><Text style={s.loadingText}>JACKING INTO LAGOS 2099…</Text></View> : null}
    </View>
  );
}
function inside(p: Float32Array, x: number, z: number) {
  let r = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r;
  }
  return r;
}
/** The round minimap: water, roads, you (yellow arrow) and where the job wants you. */
function drawMini(m: CanvasRenderingContext2D, me: { x: number; z: number; car: { rot: number } | null; face: number }, cam: Cam, tiles: import('./tiles').Tile[], sea: { p: Float32Array; island: boolean }[], tgt: { x: number; z: number } | null, now: number) {
  const S = 360, R = S / 2, k = 0.55; // px per metre: ~330 m across
  m.save();
  m.clearRect(0, 0, S, S);
  m.beginPath(); m.arc(R, R, R, 0, Math.PI * 2); m.clip();
  m.fillStyle = '#0A0E14'; m.fillRect(0, 0, S, S);
  const P = (x: number, z: number) => [R + (x - me.x) * k, R + (z - me.z) * k] as const;
  const path = (p: Float32Array) => { for (let i = 0; i < p.length; i += 2) { const [x, y] = P(p[i], p[i + 1]); if (i) m.lineTo(x, y); else m.moveTo(x, y); } };
  for (const q of sea) { m.beginPath(); path(q.p); m.closePath(); m.fillStyle = q.island ? '#0A0E14' : '#0B4A5A'; m.fill(); }
  m.lineCap = 'round';
  for (const t of tiles) for (const r of t.roads) {
    if (r.kind > KIND.residential) continue;
    if (r.maxX < me.x - 340 || r.minX > me.x + 340 || r.maxZ < me.z - 340 || r.minZ > me.z + 340) continue;
    m.strokeStyle = r.kind <= KIND.secondary ? '#FCEE0A' : 'rgba(0,240,255,0.55)'; m.lineWidth = r.kind <= KIND.secondary ? 6 : 3;
    m.beginPath(); path(r.p); m.stroke();
  }
  if (tgt) {
    let [tx, ty] = P(tgt.x, tgt.z);
    const d = Math.hypot(tx - R, ty - R);
    if (d > R - 18) { tx = R + ((tx - R) / d) * (R - 18); ty = R + ((ty - R) / d) * (R - 18); }
    // the objective: a pulsing red diamond
    const pr = 13 + Math.sin(now / 200) * 2;
    m.strokeStyle = 'rgba(255,0,60,0.6)'; m.lineWidth = 3; m.beginPath(); m.moveTo(tx, ty - pr); m.lineTo(tx + pr, ty); m.lineTo(tx, ty + pr); m.lineTo(tx - pr, ty); m.closePath(); m.stroke();
    m.fillStyle = '#FF003C'; m.beginPath(); m.moveTo(tx, ty - 8); m.lineTo(tx + 8, ty); m.lineTo(tx, ty + 8); m.lineTo(tx - 8, ty); m.closePath(); m.fill();
  }
  // you
  m.translate(R, R); m.rotate(Math.PI - (me.car ? me.car.rot : me.face));
  m.fillStyle = '#FCEE0A'; m.strokeStyle = '#05070B'; m.lineWidth = 3;
  m.beginPath(); m.moveTo(0, -16); m.lineTo(11, 12); m.lineTo(0, 6); m.lineTo(-11, 12); m.closePath(); m.fill(); m.stroke();
  m.restore();
  // range rings
  m.strokeStyle = 'rgba(0,240,255,0.18)'; m.lineWidth = 1.5; for (const rr of [R * 0.33, R * 0.66]) { m.beginPath(); m.arc(R, R, rr, 0, Math.PI * 2); m.stroke(); }
  void cam;
}
const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#A9C98A', overflow: 'hidden' },
  objective: { position: 'absolute', top: 16, left: 16, width: 400, maxWidth: '46%' },
  objBar: { width: 4 },
  objSide: { justifyContent: 'center', alignItems: 'flex-end', gap: 4, paddingRight: 14, paddingLeft: 6 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { fontFamily: HEAD, fontSize: 12, fontWeight: '700', letterSpacing: 2.2 },
  kickerDim: { fontFamily: HEAD, fontSize: 10.5, fontWeight: '700', letterSpacing: 2, color: CY.muted },
  head: { fontFamily: MONO, fontSize: 11, color: CY.muted, flexShrink: 1 },
  objTitle: { fontFamily: HEAD, fontSize: 14, fontWeight: '600', color: CY.muted },
  objTarget: { fontFamily: HEAD, fontSize: 20, fontWeight: '700', letterSpacing: 0.8, color: CY.text },
  readout: { fontFamily: MONO, fontSize: 15, color: CY.cyan, fontVariant: ['tabular-nums'] },
  topRight: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  walletCard: { paddingVertical: 8, paddingHorizontal: 16, alignItems: 'flex-end', gap: 1 },
  walletAmount: { fontFamily: MONO, fontSize: 24, color: CY.text, fontVariant: ['tabular-nums'] },
  sky: { width: 66, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 1 },
  skyIcon: { fontSize: 18, lineHeight: 22 },
  miniWrap: { position: 'absolute', left: 22, bottom: 22, width: 180, height: 180 },
  miniRing: { width: 180, height: 180, borderRadius: 90, borderWidth: 4, borderColor: CY.cyan, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: CY.ink,
    shadowColor: CY.cyan, shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  miniN: { position: 'absolute', top: -8, left: 79, width: 22, height: 22, backgroundColor: CY.yellow, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  miniNText: { fontFamily: HEAD, fontSize: 12, fontWeight: '700', color: CY.ink, transform: [{ rotate: '-45deg' }] },
  where: { position: 'absolute', left: 214, bottom: 22, maxWidth: 280 },
  whereText: { fontFamily: HEAD, fontSize: 16, fontWeight: '700', color: CY.text, letterSpacing: 0.5 },
  radio: { position: 'absolute', bottom: 92, alignSelf: 'center' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 7 },
  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },
  radioFreq: { fontFamily: MONO, fontSize: 14, color: CY.green, letterSpacing: 1 },
  speedo: { position: 'absolute', bottom: 22, alignSelf: 'center', minWidth: 120 },
  speed: { fontFamily: MONO, fontSize: 38, color: CY.yellow, lineHeight: 42, letterSpacing: 2, textShadowColor: 'rgba(252,238,10,0.6)', textShadowRadius: 10 },
  controls: { position: 'absolute', right: 16, bottom: 16, alignItems: 'flex-end', gap: 8 },
  hint: { fontFamily: MONO, fontSize: 10.5, color: CY.muted, letterSpacing: 0.6, textShadowColor: '#000', textShadowRadius: 4 },
  keyBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7 },
  keycap: { fontFamily: MONO, fontSize: 10.5, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, textAlign: 'center' },
  keyLabel: { fontFamily: HEAD, fontSize: 14, fontWeight: '700', letterSpacing: 1.4, color: CY.text },
  btn: { backgroundColor: CY.glass, borderWidth: 1, borderColor: CY.line, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { fontFamily: HEAD, fontSize: 14, fontWeight: '700', letterSpacing: 1.2, color: CY.text },
  toast: { position: 'absolute', top: 18, alignSelf: 'center', maxWidth: 560, backgroundColor: CY.glass2, borderLeftWidth: 3, borderLeftColor: CY.yellow, paddingHorizontal: 16, paddingVertical: 10 },
  toastText: { fontFamily: HEAD, fontSize: 15, fontWeight: '600', color: CY.text, textAlign: 'center', letterSpacing: 0.3 },
  wyrd: { position: 'absolute', top: 92, right: 16, width: 320, backgroundColor: 'rgba(14,6,26,0.92)', borderLeftWidth: 3, borderLeftColor: CY.magenta, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  wyrdWho: { fontFamily: MONO, fontSize: 11, color: CY.magenta, letterSpacing: 1.5 },
  wyrdText: { fontFamily: HEAD, fontSize: 15, fontWeight: '500', lineHeight: 20, color: CY.text },
  boardWrap: { position: 'absolute', inset: 0, backgroundColor: 'rgba(2,4,8,0.6)', alignItems: 'center', justifyContent: 'center' } as object,
  board: { width: 460, maxWidth: '92%', backgroundColor: CY.glass2, borderWidth: 1, borderColor: CY.line, borderTopWidth: 3, borderTopColor: CY.yellow, padding: 22, gap: 10 },
  boardTitle: { fontFamily: HEAD, fontSize: 26, fontWeight: '700', letterSpacing: 3, color: CY.yellow },
  boardSub: { fontFamily: MONO, fontSize: 12, color: CY.muted, marginBottom: 4 },
  jobRow: { borderWidth: 1, borderColor: CY.line, borderLeftWidth: 3, borderLeftColor: CY.cyan, padding: 12, gap: 4, backgroundColor: 'rgba(0,240,255,0.04)' },
  jobName: { fontFamily: HEAD, fontSize: 18, fontWeight: '700', letterSpacing: 1.2, color: CY.text },
  jobDesc: { fontFamily: HEAD, fontSize: 14, color: CY.muted, lineHeight: 19 },
  loading: { position: 'absolute', inset: 0, backgroundColor: CY.ink, alignItems: 'center', justifyContent: 'center' } as object,
  loadingText: { fontFamily: MONO, fontSize: 18, color: CY.yellow, letterSpacing: 2 },
  pcWrap: { flex: 1, backgroundColor: '#F7EFE2', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  pcTitle: { fontFamily: font, fontSize: 24, fontWeight: '800', color: '#24316B', textAlign: 'center' },
  pcText: { fontFamily: font, fontSize: 14, color: '#7A6656', textAlign: 'center', maxWidth: 360 },
});