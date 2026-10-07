import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { LANDMARKS, toXZ } from './geo';
import { KIND, World, along, inPoly, type Road } from './tiles';
import { lookFor, type Look } from './person';
import { CityMap, type Overview } from './CityMap';
import { MISSIONS, beatPoint, type Beat, type Choice, type MissionDef } from './story';
import { Dialogue, Standing } from './StoryPanels';
import { ChooseCharacter, LOCAL_LOOK } from './ChooseCharacter';
import type { Story } from '../api/client';
import { type Light, drawGhost, drawHaze, drawBridges, drawGround, nightGround, nightLights, nightTint, drawUpright, img, landmarkSprite, toScreen, viewOf, type Cam, type Sprite } from './render';

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

function Game({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const [hud, setHud] = useState<{ title: string; target: string; time?: string } | null>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [board, setBoard] = useState(false);
  // the story: your standing, the mission's step, and the conversation open now
  const [story, setStory] = useState<Story | null>(null);
  const [standing, setStanding] = useState(false);
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
  const mapData = useRef<{ overview: Overview | null; sea: { p: Float32Array; island: boolean }[]; me: { x: number; z: number } }>({ overview: null, sea: [], me: { x: 0, z: 0 } });
  const travelRef = useRef<(x: number, z: number, name: string) => void>(() => {});
  const [night, setNight] = useState(() => { const h = lagosHour(); return h >= 19 || h < 6; });
  const [where, setWhere] = useState('');
  const [driving, setDriving] = useState(false);
  const [loading, setLoading] = useState(true);
  const nightRef = useRef(night); nightRef.current = night;
  const boardRef = useRef(board); boardRef.current = board;
  const startJobRef = useRef<(t: 'delivery' | 'danfo' | 'chase') => void>(() => {});

  useEffect(() => {
    api.cityWallet().then((w) => setWallet(w.naira)).catch(() => {});
    api.cityStory().then(setStory).catch(() => {});
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
    const world = new World();
    let alive = true;
    const say = (t: string) => { setToast(t); setTimeout(() => setToast((c) => (c === t ? null : c)), 3200); };

    // the landmarks clear their plots of the map's own small buildings
    const marks = LANDMARKS.map((l) => { const p = toXZ(l.at); return { ...landmarkSprite(l.id, l.sprite, p.x, p.z, l.width), width: l.width, open: !!l.open, snapped: false }; });
    // each famous building stands on its real footprint: once its tile is in, the biggest building
    // within ~80 m of the listed spot is taken as it, and the map's own blocks on that plot step aside
    const snapMarks = () => {
      for (const m of marks) {
        if (m.snapped) continue;
        const t = world.tiles.get(`${Math.floor(m.x / 500)}_${Math.floor(m.z / 500)}`);
        if (!t) continue;
        m.snapped = true;
        let best: (typeof t.blds)[number] | null = null;
        for (const tt of world.tiles.values()) for (const b of tt.blds) {
          if (!b.hide && Math.hypot(b.cx - m.x, b.cz - m.z) < 80 && b.area > 300 && (!best || b.area > best.area)) best = b; // (a footprint another landmark took is hidden: never shared)
        }
        if (best && !m.open) { m.x = best.cx; m.z = best.cz + (best.maxZ - best.minZ) * 0.25; }
        if (best && !m.open) best.hide = true; // the landmark's own footprint: its picture stands there instead
        // and any block whose footprint the picture's base stands on
        for (const tt of world.tiles.values()) for (const b of tt.blds) if (!b.hide && inPoly(b.p, m.x, m.z)) b.hide = true;
        const r = m.id === 'link-bridge' ? 0 : m.open ? m.width * 0.3 : Math.max(14, m.width * 0.42); // open places clear less; the bridge stands over water
        for (const tt of world.tiles.values()) for (const b of tt.blds) if (Math.hypot(b.cx - m.x, b.cz - m.z) < r) b.hide = true;
        world.clearings.push({ x: m.x, z: m.z, r }); // and in tiles that load later
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
    const beachProps: Sprite[] = [];
    fetch('world2d/water.json').then((r) => r.json()).then((j: { frame: number[]; land: number[][]; islands: number[][]; water: number[][]; lakeIslands: number[][]; sand?: number[][]; beachLines?: number[][] }) => {
      const f = (a: number[]) => Float32Array.from(a, (v) => v / 10);
      sea = [{ p: f(j.frame), island: false }, ...j.land.map((a) => ({ p: f(a), island: true })), ...j.islands.map((a) => ({ p: f(a), island: true })),
        ...j.water.map((a) => ({ p: f(a), island: false })), ...j.lakeIslands.map((a) => ({ p: f(a), island: true }))];
      mapData.current.sea = sea;
      sand = [...(j.sand ?? []).map((a) => ({ p: f(a), line: false })), ...(j.beachLines ?? []).map((a) => ({ p: f(a), line: true }))];
      // beach life along the Atlantic: umbrellas and loungers on the sand, palms behind (the ocean is to the south)
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (const l of sand) if (l.line) {
        for (let i = 2; i < l.p.length; i += 2) {
          const x0 = l.p[i - 2], z0 = l.p[i - 1], x1 = l.p[i], z1 = l.p[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
          for (let d = 0; d < L; d += 22) {
            const t = d / L, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, k = rnd();
            if (k < 0.45) beachProps.push({ s: k < 0.25 ? 'stall-yellow' : 'stall-blue', x: x + (rnd() - 0.5) * 8, z: z - 4 - rnd() * 8, up: true });
            else if (k < 0.8) beachProps.push({ s: 'palm', x: x + (rnd() - 0.5) * 8, z: z - 16 - rnd() * 6, up: true });
          }
        }
      }
    }).catch(() => {});

    // start on the Marina, Lagos Island, by the lagoon -- then step onto the nearest real road
    const start = toXZ([6.4497, 3.3935]);
    const me = { x: start.x, z: start.z, face: 0, step: 0, dist: 0, heading: 0, moving: false, car: null as null | { sprite: string; v: number; rot: number } };
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
    (window as unknown as { __naija?: unknown }).__naija = { cars, walkers, me, world, get marks() { return marks; } };

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
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === 'e') toggleCar();
      if (k === 'n') setNight((v) => !v);
      if (k === 'r') setStanding((v) => !v);
      if (k === 'm') setBoard((v) => !v);
      if (k === 'tab') { e.preventDefault(); if (!e.repeat) setCityMap((v) => !v); }
      if (k === 'escape') { if (boardRef.current) setBoard(false); }
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
          if (r.story) setStory(r.story);
          if (r.naira != null) setWallet(r.naira);
          setTalk(null);
          if (r.say) say(r.paid ? `${r.say}  (+₦${r.paid.toLocaleString('en-NG')})` : r.say);
        }
      } catch { say('The city did not answer. Try again.'); }
      storyBusy = false; setTalkBusy(false);
    };
    let storyTarget: { x: number; z: number } | null = null, lastArrive = 0;

    // ---- loop ----
    let last = performance.now(), hudTick = 0, raf = 0;
    world.ready.then(() => {
      world.around(me.x, me.z, 900);
      setTimeout(() => {
        const n = world.nearestRoad(me.x, me.z, 400, KIND.secondary);
        if (n) { me.x = n.x - n.r.w; me.z = n.z; cam.x = me.x; cam.z = me.z; }
        if (alive) setLoading(false);
      }, 1200);
    });

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
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
          if (world.blocked(nx, nz, 1.2)) c.v *= -0.3; else { me.x = nx; me.z = nz; }
        } else if (ax || az) {
          const sp = (keys.has('shift') ? 5.2 : 1.55) * dt, L = Math.hypot(ax, az); // a walk is ~1.5 m/s; a run is a real run
          const co = Math.cos(cam.yaw), si = Math.sin(cam.yaw);
          const wx = (co * ax + si * az) / L, wz = (-si * ax + co * az) / L;
          const nx = me.x + wx * sp, nz = me.z + wz * sp;
          if (!world.blocked(nx, me.z)) me.x = nx;
          if (!world.blocked(me.x, nz)) me.z = nz;
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
        if (sea.some((q) => !q.island && inside(q.p, x, z))) boats.push({ x, z, a: Math.random() * Math.PI * 2, v: 3 + Math.random() * 4 });
      }
      for (let i = boats.length - 1; i >= 0; i--) {
        const b = boats[i];
        const nx = b.x + Math.cos(b.a) * b.v * dt, nz = b.z + Math.sin(b.a) * b.v * dt;
        if (sea.some((q) => !q.island && inside(q.p, nx, nz))) { b.x = nx; b.z = nz; } else b.a += Math.PI * 0.6;
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
      cam.x += (me.x - cam.x) * Math.min(1, dt * 5);
      cam.z += (me.z - cam.z) * Math.min(1, dt * 5);

      // draw
      const v = viewOf(cam);
      const tiles = [...world.tiles.values()];
      drawGround(ctx, cam, tiles, sea, v, sand);
      const spr: Sprite[] = [...marks];
      for (const b of beachProps) if (Math.abs(b.x - me.x) < 260 && Math.abs(b.z - me.z) < 260) spr.push(b);
      for (const b of boats) spr.push({ s: 'boat', x: b.x, z: b.z, rot: Math.atan2(Math.cos(b.a), -Math.sin(b.a)) });
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
      drawBridges(ctx, cam, tiles, v);
      const night = nightRef.current;
      let airLights: Light[] = [];
      if (night) {
        // the ground at night: dimmed, neon kerbs and light pools -- buildings and people then stand in front of them
        const pools: Light[] = [];
        airLights = [];
        for (const t of tiles) for (const p of t.props) if (p.s === 'lamp') { pools.push({ x: p.x, z: p.z + 1.5, r: 7, color: 'rgba(255,214,150,0.22)' }); airLights.push({ x: p.x, z: p.z, r: 1.6, color: 'rgba(230,245,255,0.9)', y: 6 }); }
        for (const c of cars) pools.push({ x: c.x + Math.sin(c.rot) * 4, z: c.z + Math.cos(c.rot) * 4, r: 6, color: 'rgba(200,240,255,0.5)' });
        if (me.car) pools.push({ x: me.x + Math.sin(me.car.rot) * 5, z: me.z + Math.cos(me.car.rot) * 5, r: 9, color: 'rgba(200,240,255,0.6)' });
        for (const m of marks) airLights.push({ x: m.x, z: m.z - 10, r: 40, color: 'rgba(120,80,255,0.18)', y: 20 });
        nightGround(ctx, cam, tiles, pools, v);
        // the upright layer on its own canvas, dimmed, then laid over the ground
        if (layer.width !== canvas.width || layer.height !== canvas.height) { layer.width = canvas.width; layer.height = canvas.height; }
        lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const hidden = drawUpright(lctx, cam, tiles, spr, v, true, me);
        if (hidden && playerSprite) drawGhost(lctx, cam, playerSprite);
        nightTint(lctx, cam);
        ctx.drawImage(layer, 0, 0, W, H);
        nightLights(ctx, cam, airLights, v, tiles);
      } else {
        const hidden = drawUpright(ctx, cam, tiles, spr, v, false, me);
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

      drawHaze(ctx, cam, nightRef.current);

      // HUD, ten times a second
      if (now - hudTick > 100) {
        hudTick = now;
        if (job) {
          const t = (now - job.started) / 1000;
          if (job.type === 'delivery') setHud({ title: job.carrying ? 'Deliver the parcel to' : 'Collect the parcel at', target: (job.carrying ? job.drop.n : job.pick.n) ?? 'the shop', time: job.carrying ? `${Math.max(0, Math.ceil(job.limit - t))}s` : undefined });
          else if (job.type === 'danfo') setHud({ title: `Danfo run · ${job.passengers} on board · next stop`, target: job.stops[job.at]?.name ?? '' });
          else setHud({ title: 'Catch the phone snatcher', target: 'on the okada', time: `${Math.max(0, Math.ceil(90 - t))}s` });
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
        if (!job) setHud(beat && mission ? { title: `${mission.title} · ${beat.objective}`, target: beat.place } : null);
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
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false; cancelAnimationFrame(raf);
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
      {React.createElement('canvas', { ref: canvasRef, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', background: '#B9DB9A' } })}

      {/* mission card, top left */}
      {hud ? (
        <View style={s.mission}>
          <View style={s.missionIcon}><Text style={s.missionIconText}>!</Text></View>
          <View>
            <Text style={s.missionTitle}>{hud.title}</Text>
            <Text style={s.missionTarget}>{hud.target}{hud.time ? `  ·  ${hud.time}` : ''}</Text>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setBoard(true)} style={s.mission}>
          <View style={s.missionIcon}><Text style={s.missionIconText}>!</Text></View>
          <View>
            <Text style={s.missionTitle}>No job yet</Text>
            <Text style={s.missionTarget}>Press M for the job board</Text>
          </View>
        </Pressable>
      )}

      {/* wallet, top right */}
      <View style={s.wallet}><Text style={s.walletSign}>₦</Text><Text style={s.walletAmount}>{wallet == null ? '—' : Math.round(wallet).toLocaleString('en-NG')}</Text></View>

      {/* minimap, bottom left */}
      <View style={s.miniWrap}>
        {React.createElement('canvas', { ref: miniRef, width: 360, height: 360, style: { width: 180, height: 180, borderRadius: 90, display: 'block' } })}
        <View style={s.miniN}><Text style={s.miniNText}>N</Text></View>
      </View>
      {where ? <View style={s.where}><Text style={s.whereText}>{where}</Text></View> : null}

      {/* controls, bottom right */}
      <View style={s.controls}>
        <Text style={s.hint}>{driving ? 'W/S drive · A/D steer · E get out' : 'WASD walk · Shift run · E take a car'} · Tab map · R standing · M jobs · N {night ? 'day' : 'night'} · scroll to zoom</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setCityMap(true)} style={s.btn}><Text style={s.btnText}>Map</Text></Pressable>
          <Pressable onPress={() => setBoard(true)} style={s.btn}><Text style={s.btnText}>Jobs</Text></Pressable>
          <Pressable onPress={() => { setStanding(true); api.cityStory().then(setStory).catch(() => {}); }} style={s.btn}><Text style={s.btnText}>Standing</Text></Pressable>
          <Pressable onPress={() => setNight((v) => !v)} style={s.btn}><Text style={s.btnText}>{night ? 'Day' : 'Night'}</Text></Pressable>
          <Pressable onPress={onExit} style={s.btn}><Text style={s.btnText}>Exit</Text></Pressable>
        </View>
      </View>

      {toast ? <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View> : null}

      {hero === null ? <ChooseCharacter onDone={(look) => setHero(look.base)} /> : null}

      {talk ? (
        <Dialogue who={talk.beat.who} line={talk.beat.line} choices={talk.beat.choices} busy={talkBusy}
          onChoose={(c: Choice) => void actRef.current(talk.mission, c.move)}
          onClose={() => { dismissed.current = `${talk.mission}:${storyRef.current?.missions?.[talk.mission]?.step ?? ''}`; setTalk(null); }} />
      ) : null}
      {standing ? <Standing story={story} onClose={() => setStanding(false)} /> : null}

      {cityMap ? (
        <CityMap overview={mapData.current.overview} sea={mapData.current.sea} me={{ x: mapData.current.me.x, z: mapData.current.me.z }}
          onTravel={(x, z, name) => travelRef.current(x, z, name)} onClose={() => setCityMap(false)} />
      ) : null}

      {board ? (
        <View style={s.boardWrap}>
          <View style={s.board}>
            <Text style={s.boardTitle}>Job board</Text>
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

      {loading ? <View style={s.loading}><Text style={s.loadingText}>Entering Lagos, 2099…</Text></View> : null}
      <Text style={s.osm}>Map data © OpenStreetMap contributors</Text>
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
  m.fillStyle = '#E9EDF2'; m.fillRect(0, 0, S, S);
  const P = (x: number, z: number) => [R + (x - me.x) * k, R + (z - me.z) * k] as const;
  const path = (p: Float32Array) => { for (let i = 0; i < p.length; i += 2) { const [x, y] = P(p[i], p[i + 1]); if (i) m.lineTo(x, y); else m.moveTo(x, y); } };
  for (const q of sea) { m.beginPath(); path(q.p); m.closePath(); m.fillStyle = q.island ? '#E9EDF2' : '#2E7FD6'; m.fill(); }
  m.lineCap = 'round';
  for (const t of tiles) for (const r of t.roads) {
    if (r.kind > KIND.residential) continue;
    if (r.maxX < me.x - 340 || r.minX > me.x + 340 || r.maxZ < me.z - 340 || r.minZ > me.z + 340) continue;
    m.strokeStyle = r.kind <= KIND.secondary ? '#F2C94C' : '#FFFFFF'; m.lineWidth = r.kind <= KIND.secondary ? 6 : 3;
    m.beginPath(); path(r.p); m.stroke();
  }
  if (tgt) {
    let [tx, ty] = P(tgt.x, tgt.z);
    const d = Math.hypot(tx - R, ty - R);
    if (d > R - 18) { tx = R + ((tx - R) / d) * (R - 18); ty = R + ((ty - R) / d) * (R - 18); }
    m.fillStyle = '#1E2A44'; m.beginPath(); m.arc(tx, ty, 14 + Math.sin(now / 200) * 2, 0, Math.PI * 2); m.fill();
    m.fillStyle = '#F2C94C'; m.beginPath(); m.arc(tx, ty, 8, 0, Math.PI * 2); m.fill();
  }
  // you
  m.translate(R, R); m.rotate(Math.PI - (me.car ? me.car.rot : me.face));
  m.fillStyle = '#F2C94C'; m.strokeStyle = '#1E2A44'; m.lineWidth = 3;
  m.beginPath(); m.moveTo(0, -16); m.lineTo(11, 12); m.lineTo(0, 6); m.lineTo(-11, 12); m.closePath(); m.fill(); m.stroke();
  m.restore();
  m.strokeStyle = '#1E2A44'; m.lineWidth = 10; m.beginPath(); m.arc(R, R, R - 5, 0, Math.PI * 2); m.stroke();
  void cam;
}

const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#B9DB9A', overflow: 'hidden' },
  mission: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(22,28,38,0.86)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  missionIcon: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#F2C94C', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  missionIconText: { fontFamily: font, fontWeight: '800', fontSize: 17, color: '#1E2A44', transform: [{ rotate: '-45deg' }] },
  missionTitle: { fontFamily: font, fontSize: 15, color: '#FFFFFF', fontWeight: '500' },
  missionTarget: { fontFamily: font, fontSize: 16, color: '#F2C94C', fontWeight: '800' },
  wallet: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(22,28,38,0.86)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  walletSign: { fontFamily: font, fontSize: 20, fontWeight: '800', color: '#3DDC84' },
  walletAmount: { fontFamily: font, fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  miniWrap: { position: 'absolute', left: 16, bottom: 16, width: 180, height: 180 },
  miniN: { position: 'absolute', top: -2, left: 78, width: 24, height: 24, borderRadius: 12, backgroundColor: '#1E2A44', alignItems: 'center', justifyContent: 'center' },
  miniNText: { fontFamily: font, fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  where: { position: 'absolute', left: 206, bottom: 20, backgroundColor: 'rgba(22,28,38,0.78)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  whereText: { fontFamily: font, fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  controls: { position: 'absolute', right: 16, bottom: 16, alignItems: 'flex-end', gap: 8 },
  hint: { fontFamily: font, fontSize: 12, color: '#FFFFFF', backgroundColor: 'rgba(22,28,38,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btn: { backgroundColor: 'rgba(22,28,38,0.86)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { fontFamily: font, fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  toast: { position: 'absolute', top: 18, alignSelf: 'center', maxWidth: 560, backgroundColor: 'rgba(22,28,38,0.9)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  toastText: { fontFamily: font, fontSize: 14, color: '#FFFFFF', textAlign: 'center' },
  boardWrap: { position: 'absolute', inset: 0, backgroundColor: 'rgba(10,14,22,0.45)', alignItems: 'center', justifyContent: 'center' } as object,
  board: { width: 440, maxWidth: '92%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 22, gap: 10 },
  boardTitle: { fontFamily: font, fontSize: 24, fontWeight: '800', color: '#1E2A44' },
  boardSub: { fontFamily: font, fontSize: 13, color: '#5B6475', marginBottom: 4 },
  jobRow: { borderWidth: 1, borderColor: '#E3E7EE', borderRadius: 12, padding: 12, gap: 4 },
  jobName: { fontFamily: font, fontSize: 16, fontWeight: '800', color: '#1E2A44' },
  jobDesc: { fontFamily: font, fontSize: 13, color: '#5B6475', lineHeight: 18 },
  loading: { position: 'absolute', inset: 0, backgroundColor: '#B9DB9A', alignItems: 'center', justifyContent: 'center' } as object,
  loadingText: { fontFamily: font, fontSize: 20, fontWeight: '700', color: '#1E2A44' },
  osm: { position: 'absolute', right: 8, top: 74, fontFamily: font, fontSize: 10, color: 'rgba(30,40,60,0.6)' },
  pcWrap: { flex: 1, backgroundColor: '#F7EFE2', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  pcTitle: { fontFamily: font, fontSize: 24, fontWeight: '800', color: '#24316B', textAlign: 'center' },
  pcText: { fontFamily: font, fontSize: 14, color: '#7A6656', textAlign: 'center', maxWidth: 360 },
});
