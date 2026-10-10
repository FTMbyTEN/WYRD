import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { asset } from './asset';
import { api } from '../api/client';
import { DISTRICTS, LANDMARKS, toXZ } from './geo';
import { modelFor } from './mesh';
import { place, planRect } from './place';
import { KIND, World, along, crosses, inPoly, type Bld, type Road } from './tiles';
import { lookFor, type Look, type Pose } from './person';
import { CityMap, type Overview } from './CityMap';
import { MISSIONS, beatPoint, type Beat, type Choice, type MissionDef } from './story';
import { Dialogue, Standing } from './StoryPanels';
import { WyrdPanel, type WyrdLine } from './WyrdPanel';
import { CY, HEAD, MONO, Panel, loadCyberFonts } from './cyber';
import { Radio, STATIONS, type Station } from './radio';
import { Scenery } from './scenery';
import { Traffic, junctionKey, type Junction } from './traffic';
import { ChooseCharacter, LOCAL_LOOK } from './ChooseCharacter';
import { Phone, type CallResult, type CopStatus, type RideKind, type RideStatus } from './Phone';
import { Router, onRoute, type Route } from './router';
import { areaOf, type Found } from './search';
import type { PoliceStatus, PoliceTick, Settlement, Story } from '../api/client';
import { type Light, depth, drawFlyer, drawMoving, redrawn, liveBox, lightPools, drawGhost, drawHaze, drawBridges, drawGround, nightGround, nightLights, nightTint, drawUpright, img, landmarkSprite, toScreen, viewOf, type Cam, type Sprite } from './render';
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
/** [v]: the speed it cruises at; [cur]: its speed now (it eases towards what the road ahead allows); [stunUntil]: hit,
 *  it stands still until then */
type Car = { r: Road; s: number; dir: 1 | -1; v: number; sprite: string; lane: number; x: number; z: number; rot: number; cur?: number; stunUntil?: number; stopUntil?: number; lastStop?: number };
/** a puff of smoke from a damaged car, or a spark from a crash */
type Puff = { x: number; z: number; y: number; vx: number; vz: number; vy: number; life: number; max: number; kind: 'smoke' | 'spark' };
type Walker = { r: Road; s: number; dir: 1 | -1; v: number; sprite: string; side: number; x: number; z: number; left: boolean; look: Look; heading: number;
  /** what they're doing in the city (not just walking): see ROLES */
  role: Role; label: string; pose?: Pose; goal?: number; until?: number; bought?: boolean; boardAt?: number; t0: number;
  /** a WYRD traffic unit: its call sign, the junction it runs, the queues it last counted, when it last reported */
  unit?: { id: string; key: string; q: [number, number]; reported: number } };
/**
 * Everyone out there has something to do: commuters on their way somewhere (and in through a door when they get
 * there), vendors selling from a tray to whoever stops, people waiting at the roadside for a danfo (which pulls over
 * for them), LAWMA sweepers, WYRD's traffic units running the light junctions (and reporting back to WYRD), friends stopped to gist.
 */
type Role = 'commuter' | 'vendor' | 'sweeper' | 'waiting' | 'warden' | 'chat';
const GOODS = ['gala and Lacasera', 'roasted corn', 'puff-puff', 'pure water', 'phone credit', 'chin-chin', 'boiled groundnuts', 'agege bread'];
const CALLS = ['Fine boy, buy gala!', 'Pure water! Cold one!', 'Customer, come and see!', 'E dey sweet, try am!', 'Two for ₦200!'];
const commuting = () => { const h = lagosHour(); return h >= 6 && h < 10 ? 'Off to work' : h >= 10 && h < 16 ? 'On an errand' : h >= 16 && h < 20 ? 'Heading home' : 'Out late'; };
type Boat = { x: number; z: number; a: number; v: number };
/** a police patrol WYRD sent after you: following the roads to you (re-planned every few seconds), then straight at you */
type Patrol = { id: string; x: number; z: number; h: number; v: number; route: Route | null; s: number; replanAt: number; near: number; farFor: number; leaving: boolean };
/** a flying car: where it is, how high, which way and how fast it flies */
type Flyer = { x: number; z: number; y: number; h: number; v: number; sprite: string };
/** a WYRD ride you ordered on the phone: by road (a car following a real route) or by air (a WYRD flyer) */
type Ride = {
  kind: RideKind; phase: 'coming' | 'waiting' | 'riding' | 'leaving'; dest: { x: number; z: number; name: string };
  route: Route | null; trip: Route | null; s: number; v: number; x: number; z: number; y: number; h: number; sprite: string;
  fast: boolean; from: { x: number; z: number }; to: { x: number; z: number }; t: number;
};
/** what draws the canvas: the graphics card's name, or a software renderer (SwiftShader, llvmpipe, Microsoft Basic
 *  Render Driver) -- Chrome falls back to software on some machines and drivers, and then every frame is slow */
function graphicsName(): { name: string; software: boolean } {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return { name: 'no WebGL', software: true };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return { name, software: /swiftshader|llvmpipe|software|basic render/i.test(name) };
  } catch { return { name: 'unknown', software: false }; }
}
// WYRD's flyers, the city's flying cars run by WYRD: four designs (cab, arrow, bubble, hauler), two paints each
const FLYER_SPRITES = ['wyrd-cab-navy', 'wyrd-cab-pearl', 'wyrd-arrow-crimson', 'wyrd-arrow-black', 'wyrd-bubble-gold', 'wyrd-bubble-mint', 'wyrd-hauler-white', 'wyrd-hauler-orange'];
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

function Game({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  /** the objective card: a job, a mission under way, or one waiting nearby */
  type Hud = { kind: 'job' | 'mission' | 'offer'; head: string; title: string; target: string; time?: string; urgent?: boolean };
  const [hud, setHudRaw] = useState<Hud | null>(null);
  const hudKey = useRef('');
  const setHud = (h: Hud | null) => { const k = JSON.stringify(h); if (k !== hudKey.current) { hudKey.current = k; setHudRaw(h); } };
  /** live readings for the HUD: metres to the objective, speed at the wheel (km/h), and the district you are in */
  const [live, setLiveRaw] = useState<{ dist: number | null; kmh: number; area: string; hp: number }>({ dist: null, kmh: 0, area: '', hp: 100 });
  const setLive = (l: { dist: number | null; kmh: number; area: string; hp: number }) => setLiveRaw((p) => (p.dist === l.dist && p.kmh === l.kmh && p.area === l.area && p.hp === l.hp ? p : l));
  const [wallet, setWallet] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [board, setBoard] = useState(false);
  // the story: your standing, the mission's step, and the conversation open now
  const [story, setStory] = useState<Story | null>(null);
  const [standing, setStanding] = useState<false | 'standing' | 'life'>(false);
  const [wyrd, setWyrd] = useState<string | null>(null); // WYRD speaking: the live wire, its units, its answers
  const [wyrdLive, setWyrdLive] = useState(false); // ...off the live wire
  const [online, setOnline] = useState(0); // citizens on the streets now (from the wire)
  const [wyrdOpen, setWyrdOpen] = useState(false); // the conversation with WYRD (T)
  const radio = useRef<Radio | null>(null); // FM (Q)
  const [onAir, setOnAir] = useState<Station | null>(null);
  const [tuning, setTuning] = useState(false);
  // the performance readout (F8): frames a second, the game's own work per frame, resolution, what draws the pixels
  const [perf, setPerf] = useState<{ fps: number; ms: number; worst: number; res: string; gpu: string; software: boolean } | null>(null);
  const perfOn = useRef(false);
  const tuneRadio = () => {
    if (!radio.current) { radio.current = new Radio(); radio.current.onChange = (st, live) => { setOnAir(st); setTuning(!!st && !live); }; }
    radio.current.tune();
  };
  // the phone (P) and the ride on it
  const [phone, setPhone] = useState(false);
  // the police on you, as the HUD and the phone show it: stars (what WYRD's units logged, cooling with time), the
  // patrols chasing and the nearest one's distance, and how long until it's all cooled off
  const [cop, setCopRaw] = useState<CopStatus & { clearIn: number }>({ stars: 0, chasing: 0, dist: null, clearIn: 0 });
  const copKey = useRef('');
  const setCop = (c: CopStatus & { clearIn: number }) => { const k = JSON.stringify(c); if (k !== copKey.current) { copKey.current = k; setCopRaw(c); } };
  const callRef = useRef<(id: string) => Promise<CallResult>>(async () => ({ lines: [], cleared: 0, outcome: '' }));
  const [clock, setClock] = useState('');
  // whether WYRD may learn from this player's play (asked once; the same consent as WYRD's conversations)
  const [training, setTrainingRaw] = useState<{ optIn: boolean; asked: boolean } | null>(null);
  const optInRef = useRef(false);
  const answerTraining = (optIn: boolean) => {
    setTrainingRaw({ optIn, asked: true }); optInRef.current = optIn;
    api.citySetTraining(optIn).catch(() => {});
  };
  const [rideStatus, setRideRaw] = useState<RideStatus | null>(null);
  const rideKey = useRef('');
  const setRide = (st: RideStatus | null) => { const k = JSON.stringify(st); if (k !== rideKey.current) { rideKey.current = k; setRideRaw(st); } };
  const rideCtl = useRef<{ order: (f: Found, k: RideKind, lift?: boolean) => void; cancel: () => void; skip: () => void; fast: () => void }>({ order: () => {}, cancel: () => {}, skip: () => {}, fast: () => {} });
  const tuneTo = (i: number | null) => {
    if (!radio.current) { radio.current = new Radio(); radio.current.onChange = (st, live) => { setOnAir(st); setTuning(!!st && !live); }; }
    radio.current.tuneTo(i);
  };
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
    api.cityStatus().then((d) => { if (d.trainingAsked !== undefined) { setTrainingRaw({ optIn: !!d.trainingOptIn, asked: !!d.trainingAsked }); optInRef.current = !!d.trainingOptIn; } }).catch(() => {});
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
    // the traffic lights at the main junctions, and the smoke and sparks of crashes
    const traffic = new Traffic();
    const puffs: Puff[] = [];
    let lastCrashSay = 0;
    let alive = true;
    const say = (t: string) => { setToast(t); setTimeout(() => setToast((c) => (c === t ? null : c)), Math.max(3200, t.length * 55)); };
    /** you hit something at [speed] m/s: damage by how hard, sparks where, and a word about it */
    function crash(speed: number, what: 'car' | 'wall', x: number, z: number, now: number) {
      if (!me.car) return;
      const dmg = Math.round(Math.min(45, (speed - (what === 'car' ? 2 : 5)) * 3.2));
      if (dmg <= 0) return;
      me.car.hp = Math.max(0, me.car.hp - dmg);
      for (let k = 0; k < 12; k++) puffs.push({ x, z, y: 0.9, vx: (Math.random() - 0.5) * 7, vz: (Math.random() - 0.5) * 7, vy: 2 + Math.random() * 3, life: 0, max: 0.35 + Math.random() * 0.3, kind: 'spark' });
      if (now - lastCrashSay > 2000) {
        lastCrashSay = now; say(me.car.hp <= 0 ? 'Your car is wrecked. Press E to get out and find another.' : `Crash! The car is at ${me.car.hp}%.`);
        const w = nearestUnit(x, z, 160);
        if (dmg >= 8) signal('crash', world.nearestRoad(x, z, 40, KIND.residential)?.r.name);
        if (dmg >= 8 && what === 'car') report({ code: 'CD-1', place: world.nearestRoad(x, z, 40, KIND.residential)?.r.name ?? areaOf(x, z), unit: w?.unit?.id, witnesses: witnessesAt(x, z) });
        if (w && dmg >= 8) unitSay(w, `collision ${what === 'car' ? 'between two cars' : 'with a wall'} on ${world.nearestRoad(x, z, 40, KIND.residential)?.r.name ?? 'the road'}. Your car at ${me.car.hp}%.`, true);
      }
    }
    const wyrdSay = (t: string, live = false) => { if (t.startsWith('WYRD city bulletin') || live) radio.current?.news.push(t); addWyrd({ from: t.startsWith('WYRD city bulletin') || live ? 'bulletin' : 'wyrd', text: t, at: Date.now() }); setWyrd(t); setWyrdLive(live); setTimeout(() => setWyrd((c) => (c === t ? null : c)), Math.max(6000, t.length * 60)); };
    wyrdRef.current = wyrdSay;
    // WYRD's live wire, the same for everyone in the city: what's happening now (citizens settling missions, city
    // events, WYRD checking in with the hour and who's out), asked for every 20 s
    let wireAt = 0, wireUp = false;
    const pollWire = () => {
      if (document.hidden) return;
      api.cityWire(wireAt).then((r) => {
        const first = !wireUp; wireUp = true;
        const fresh = r.items.filter((i) => i.id > wireAt);
        if (r.last) wireAt = Math.max(wireAt, r.last);
        setOnline(r.online);
        // on joining, only the latest is said aloud; anything newer comes in as it happens
        if (first) { for (const i of fresh.slice(0, -1)) addWyrd({ from: 'bulletin', text: i.text, at: Date.parse(i.at) || Date.now() }); const l = fresh[fresh.length - 1]; if (l) wyrdSay(l.text, true); }
        else fresh.forEach((i, k) => setTimeout(() => { if (alive) wyrdSay(i.text, true); }, k * 7000));
      }).catch(() => {});
    };
    pollWire();
    const wire = setInterval(pollWire, 20000);
    // (nothing scripted in between: the wire is what's actually happening, or quiet)
    // the landmarks clear their plots of the map's own small buildings
    const marks = LANDMARKS.map((l) => { const p = toXZ(l.at); const md = modelFor(l.id); return { ...landmarkSprite(l.id, l.sprite, p.x, p.z, l.width), width: md ? md.radius * 2 : l.width, open: !!l.open, snapped: false, model: md ? l.id : undefined, heading: 0, size: 1 }; });
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
        const md = m.model ? modelFor(m.model) : null;
        let best: Bld | null = null;
        if (md) {
          // its own footprint (the one its true spot stands in), filled, square to it, its front to the street; or,
          // with none, the nearest spot and biggest size that cover no street (see place.ts)
          if (m.id === 'link-bridge') {
            // the bridge is the bridge: on the mapped bridge road nearest its spot, running along it
            let bd = 150;
            for (const tt of world.tiles.values()) for (const rd of tt.roads) {
              if (!rd.bridge) continue;
              for (let i = 2; i < rd.p.length; i += 2) {
                const x0 = rd.p[i - 2], z0 = rd.p[i - 1], dx = rd.p[i] - x0, dz = rd.p[i + 1] - z0, L2 = dx * dx + dz * dz || 1;
                const u = Math.max(0, Math.min(1, ((m.x - x0) * dx + (m.z - z0) * dz) / L2)), px = x0 + dx * u, pz = z0 + dz * u, d = Math.hypot(px - m.x, pz - m.z);
                if (d < bd) { bd = d; m.x = px; m.z = pz; m.heading = Math.atan2(dx, dz); }
              }
            }
            m.size = 1;
          } else {
            const pl = place(world, md, m.x, m.z, m.open, (x, z) => wet(x, z));
            m.x = pl.x; m.z = pl.z; m.heading = pl.heading; m.size = pl.size; best = pl.foot;
          }
          m.width = md.radius * 2 * m.size;
        } else {
          for (const tt of world.tiles.values()) for (const b of tt.blds) {
            if (!b.hide && Math.hypot(b.cx - m.x, b.cz - m.z) < 80 && b.area > 300 && (!best || b.area > best.area)) best = b;
          }
          if (best && !m.open) { m.x = best.cx; m.z = best.cz + (best.maxZ - best.minZ) * 0.25; } // (a picture's base sits a little in front)
        }
        if (best && !m.open) best.hide = true; // the landmark's own footprint: its picture stands there instead
        // never on the carriageway: a picture whose base would cover a road steps back off it
        if (m.id !== 'link-bridge' && !m.model) for (let pass = 0; pass < 3; pass++) {
          const road = world.nearestRoad(m.x, m.z, m.width * 0.4, KIND.residential);
          if (!road) break;
          const keep = m.width * 0.4 + road.r.w / 2, dx = m.x - road.x, dz = m.z - road.z, L = Math.hypot(dx, dz) || 1;
          m.x = road.x + (dx / L) * keep; m.z = road.z + (dz / L) * keep;
        }
        // and any block whose footprint the picture's base stands on
        for (const tt of world.tiles.values()) for (const b of tt.blds) if (!b.hide && inPoly(b.p, m.x, m.z)) b.hide = true;
        let r: number;
        if (md && m.id !== 'link-bridge') {
          // a model clears exactly the ground it stands on: every building with a corner or its middle on its plan
          const plan = planRect(md, m.x, m.z, m.heading, m.size, 1);
          for (const tt of world.tiles.values()) for (const b of tt.blds) {
            if (b.hide) continue;
            let on = inPoly(plan, b.cx, b.cz);
            for (let i = 0; !on && i < b.p.length; i += 2) on = inPoly(plan, b.p[i], b.p[i + 1]);
            for (let i = 0; !on && i < plan.length; i += 2) on = inPoly(b.p, plan[i], plan[i + 1]);
            if (!on) on = crosses(plan, Float32Array.from([...b.p, b.p[0], b.p[1]])); // (or only edges crossing)
            if (on) b.hide = true;
          }
          // and the street furniture on it (a kiosk on the cathedral's steps)
          for (const tt of world.tiles.values()) tt.props = tt.props.filter((p) => !inPoly(plan, p.x, p.z));
          r = Math.min(md.box[1] - md.box[0], md.box[3] - md.box[2]) * m.size * 0.5; // (tiles loading later: the circle inside the plan)
        } else {
          r = m.id === 'link-bridge' ? 0 : m.open ? m.width * 0.4 : Math.max(16, m.width * 0.56); // the picture's whole ground: nothing of the map's own pokes through or over it (open places clear less; the bridge stands over water)
          for (const tt of world.tiles.values()) for (const b of tt.blds) if (Math.hypot(b.cx - m.x, b.cz - m.z) < r) b.hide = true;
        }
        world.clearings.push({ x: m.x, z: m.z, r }); // and in tiles that load later
        world.changed(m.x - 160, m.x + 160, m.z - 160, m.z + 160); // (the cached scenery redraws round it)
        scenery.reset();
      }
    };
    let places: Place[] = [];
    fetch(asset('world/v1/places.json')).then((r) => r.json()).then((p: Place[]) => {
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
    fetch(asset('world2d/water.json')).then((r) => r.json()).then((j: { frame: number[]; land: number[][]; islands: number[][]; water: number[][]; lakeIslands: number[][]; sand?: number[][]; beachLines?: number[][] }) => {
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
    const me = { x: start.x, z: start.z, face: 0, step: 0, dist: 0, heading: 0, moving: false, car: null as null | { sprite: string; v: number; rot: number; hp: number } }; // (hp: the car's condition, 100 to wrecked at 0)
    situationRef.current = () => {
      const road = world.nearestRoad(me.x, me.z, 80, KIND.residential);
      let area = '', ad = Infinity;
      for (const d of DISTRICTS) { const p = toXZ(d.at), q = Math.hypot(p.x - me.x, p.z - me.z); if (q < ad) { ad = q; area = d.name; } }
      const near = LANDMARKS.map((l) => ({ name: l.name, ...toXZ(l.at) })).map((l) => ({ name: l.name, m: Math.round(Math.hypot(l.x - me.x, l.z - me.z)) })).filter((l) => l.m < 1500).sort((p, q) => p.m - q.m).slice(0, 4);
      const doing = hudKey.current ? JSON.parse(hudKey.current) : null;
      return { game: 'NAIJA 2099 (2D)', district: ad < 4000 ? area : 'outskirts', street: road?.r.name ?? null, landmarksNear: near,
        travelling: me.car ? 'driving' : me.moving ? 'walking' : 'standing', time: nightRef.current ? 'night' : 'day', doing,
        trafficUnitReports: unitLog.slice(-5), wantedStars: cops.stars, policeState: cops.state, policeChasing: patrols.filter((p) => !p.leaving).length };
    };
    mapData.current.me = me;
    fetch(asset('world2d/overview.json')).then((r) => r.json()).then((o: Overview) => { mapData.current.overview = o; }).catch(() => {});
    // a ride across town: pay the danfo fare, arrive, and step off onto the nearest street once it has loaded
    let arriving = false;
    travelRef.current = async (x, z, name) => {
      setCityMap(false);
      if (job) { say('Finish your job first -- the customer is waiting.'); return; }
      if (ride) { say('You have a WYRD ride on — cancel it on your phone first.'); return; }
      if (Math.hypot(x - me.x, z - me.z) < 150) { say('You are already there. Walk it!'); return; }
      try {
        const r = await api.cityPay('danfo');
        if ('error' in r && r.error) { say(String(r.error)); return; }
        setWallet((r as { naira: number }).naira);
        if ('credit' in r && r.credit) setTimeout(() => say(`Short of fare: the conductor let you ride on credit. ₦${r.credit} goes on your plan, paid from what you earn next.`), 3600);
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
    const cars: Car[] = [], walkers: Walker[] = [], boats: Boat[] = [], flyers: Flyer[] = [];
    let job: Job | null = null;
    const keys = new Set<string>();
    (window as unknown as { __naija?: unknown }).__naija = { cars, walkers, boats, me, world, get marks() { return marks; }, get ride() { return ride; }, rideCtl, get police() { return { patrols, cops }; }, snap: snapMarks, wet, scenery, cam, get traffic() { return traffic; },
      /** debugging: stand at (x, z) and look from [yaw], tipped to [p] (radians), at [zm] px per metre */
      view: (x: number, z: number, yaw?: number, p?: number, zm?: number) => {
        me.x = x; me.z = z; cam.x = x; cam.z = z;
        if (yaw != null) cam.yaw = yaw;
        if (p != null) { pitch = p; cam.tilt = Math.sin(p); cam.rise = Math.cos(p); }
        if (zm != null) { zoom = zm; cam.scale = zm; }
      } };
    // cars per 100 m of road, by kind: Third Mainland and the expressways are packed, side streets nearly empty
    // (half what it was: the roads of 2099 are lighter -- much of the traffic has taken to the air)
    const DENSITY = [1.6, 1.2, 0.35, 0.15, 0.05];
    let roadPool: Road[] = [], poolAt = { x: Infinity, z: 0 }, wanted = 0, poolTime = 0;
    const refreshPool = () => {
      roadPool = world.roadsNear(me.x, me.z, 170, KIND.tertiary).filter((r) => r.kind !== KIND.link);
      wanted = Math.min(24, Math.round(roadPool.reduce((n, r) => n + (r.len * (DENSITY[r.kind] ?? 0)) / 100, 0) * 0.55));
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
      const look = lookFor(1 + Math.floor(Math.random() * 1e6)), now = performance.now();
      const base = { r, s: s0, dir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1, sprite: WALKERS[Math.floor(Math.random() * 4)], side, x: px, z: pz, left: false, t0: Math.random() * 10 };
      const toRoad = Math.atan2(a.x - px, a.z - pz); // (facing the street)
      // (each kind of work only so many at a time: commuters come and go, the others stay put)
      const has = (k: Role) => walkers.filter((w) => w.role === k).length, CAP: Partial<Record<Role, number>> = { vendor: 5, waiting: 6, sweeper: 2, chat: 6 };
      let roll = Math.random();
      const main = r.kind <= KIND.tertiary;
      const role: Role = roll < 0.14 ? 'vendor' : roll < 0.24 && main ? 'waiting' : roll < 0.29 ? 'sweeper' : roll < 0.37 ? 'chat' : 'commuter';
      if (role !== 'commuter' && has(role) >= (CAP[role] ?? 99)) roll = 1;
      if (roll < 0.14) {
        walkers.push({ ...base, v: 0, look: { ...look, load: undefined }, heading: toRoad, role: 'vendor', pose: 'hold', label: `Selling ${GOODS[Math.floor(Math.random() * GOODS.length)]}` });
      } else if (roll < 0.24 && main) {
        walkers.push({ ...base, v: 0, look, heading: toRoad, role: 'waiting', label: 'Waiting for a danfo' });
      } else if (roll < 0.29) {
        walkers.push({ ...base, v: 0.35, look: { ...look, wrap: undefined, gele: undefined, kaftan: false, load: undefined, vest: '#FF7A1A', cap: '#1B5E20', top: '#2E7D32' }, heading: 0, role: 'sweeper', pose: 'sweep', label: 'LAWMA · sweeping the street' });
      } else if (roll < 0.37) {
        // two friends stopped to talk, facing each other (or one alone on the phone)
        if (Math.random() < 0.35) { walkers.push({ ...base, v: 0, look, heading: toRoad + Math.PI / 2, role: 'chat', pose: 'phone', label: 'On the phone' }); return; }
        const b = along(r.p, r.cum, Math.min(r.len, s0 + 1.3)), bx = b.x - b.dz * off, bz = b.z + b.dx * off;
        const h = Math.atan2(bx - px, bz - pz);
        walkers.push({ ...base, v: 0, look, heading: h, role: 'chat', label: 'Gisting with a friend' });
        walkers.push({ ...base, x: bx, z: bz, v: 0, look: lookFor(1 + Math.floor(Math.random() * 1e6)), heading: h + Math.PI, role: 'chat', label: 'Gisting with a friend' });
      } else {
        walkers.push({ ...base, v: 1 + Math.random() * 0.6, look, heading: 0, role: 'commuter', label: commuting(), goal: 30 + Math.random() * 120 });
      }
      void now;
    };
    // ---- WYRD's traffic units: each runs a junction's lights by the queues it sees, and reports to WYRD ----
    const roadOf = (j: Junction, g: 0 | 1) => j.approaches.find((a) => a.group === g && a.r.name)?.r.name;
    const junctionName = (j: Junction) => { const a = roadOf(j, 0), b = roadOf(j, 1); return a && b && a !== b ? `${a} / ${b}` : a ?? b ?? 'the junction'; };
    const unitLog: string[] = []; // the latest reports, for WYRD (and what it's told when you talk to it)
    /**
     * What the city saw around you, for WYRD to learn from -- only if you agreed, and anonymous: a tally of what
     * happened at which named street, junction or district (no position, no player), sent once a minute. See the
     * server's CitySignals.
     */
    const tallies = new Map<string, { k: string; p: string; n: number; v: number }>();
    const signal = (k: string, p: string | null | undefined, v = 0) => {
      if (!optInRef.current || !p) return;
      const key = `${k}|${p}`, t = tallies.get(key);
      if (t) { t.n++; t.v += v; } else if (tallies.size < 80) tallies.set(key, { k, p, n: 1, v });
    };
    const sendTallies = () => {
      if (!tallies.size || !optInRef.current) { tallies.clear(); return; }
      const batch = JSON.stringify([...tallies.values()].map((t) => ({ ...t, v: Math.round(t.v * 10) / 10 })));
      tallies.clear();
      api.citySignals(batch).catch(() => {});
    };
    const tallyTimer = setInterval(sendTallies, 60000);
    /** unit [w] reports [text] to WYRD: into WYRD's feed; [loud]: up in WYRD's box too, and WYRD answers */
    const unitSay = (w: Walker, text: string, loud: boolean, reply?: string) => {
      const line = `Traffic unit ${w.unit!.id} → WYRD: ${text}`;
      unitLog.push(line); if (unitLog.length > 8) unitLog.shift();
      if (loud) wyrdSay(line); else addWyrd({ from: 'bulletin', text: line, at: Date.now() });
      if (reply) setTimeout(() => wyrdSay(`WYRD → ${w.unit!.id}: ${reply}`), 1800);
    };
    const units = () => walkers.filter((w) => w.unit);
    const nearestUnit = (x: number, z: number, max: number) => { let b: Walker | null = null, bd = max; for (const w of units()) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; b = w; } } return b; };
    /** which way (light group) something heading (hx, hz) comes into junction [j] */
    const groupInto = (j: Junction, hx: number, hz: number) => { let best: 0 | 1 | -1 = -1, bd = 0.5; for (const a of j.approaches) { const d = a.ix * hx + a.iz * hz; if (d > bd) { bd = d; best = a.group; } } return best; };
    const ranRed = new Map<string, number>();
    let speedLogged = 0;
    /** each unit's look at its junction: count the queues, run the lights, report now and then; and watch you */
    const runUnits = (now: number) => {
      for (const w of units()) {
        const u = w.unit!, j = traffic.junctions.find((k) => junctionKey(k) === u.key);
        if (!j) continue;
        const c = traffic.take(j, u.id, now);
        const q: [number, number] = [0, 0];
        const count = (x: number, z: number, rot: number, v: number) => { if (v > 1.5 || Math.hypot(x - j.x, z - j.z) > 50) return; const gi = groupInto(j, Math.sin(rot), Math.cos(rot)); if (gi !== -1) q[gi]++; };
        for (const o of cars) count(o.x, o.z, o.rot, o.cur ?? o.v);
        if (me.car) count(me.x, me.z, me.car.rot, Math.abs(me.car.v));
        u.q = q;
        const was = c.group;
        const switched = traffic.run(j, q, now) === 'switch';
        if (switched) signal('queue', junctionName(j), q[1 - was]);
        if (switched && Math.hypot(w.x - me.x, w.z - me.z) < 300 && now - u.reported > 25000) {
          u.reported = now;
          unitSay(w, `${junctionName(j)}: ${q[1 - was]} waiting on ${roadOf(j, (1 - was) as 0 | 1) ?? 'the cross road'}, ${q[was]} on ${roadOf(j, was) ?? 'the main road'}. Switching.`, false);
        }
        const way = roadOf(j, c.group) ?? (c.group === 0 ? 'main road' : 'cross road');
        w.label = `WYRD unit ${u.id} · ${c.phase === 'g' ? `${way} go` : c.phase === 'a' ? 'clearing' : 'all stop'} · ${q[0] + q[1]} waiting`;
        w.heading = Math.atan2(j.x - w.x, j.z - w.z);
      }
      // you, at the wheel, as the units see it: through a red light, or far too fast
      if (!me.car || Math.abs(me.car.v) < 4) return;
      const hx = Math.sin(me.car.rot) * Math.sign(me.car.v), hz = Math.cos(me.car.rot) * Math.sign(me.car.v), kmh = Math.round(Math.abs(me.car.v) * 3.6);
      for (const j of traffic.junctions) {
        if (Math.hypot(j.x - me.x, j.z - me.z) > 6) continue;
        const k = junctionKey(j), gi = groupInto(j, hx, hz);
        if (gi === -1 || traffic.light(j, gi, now) !== 'r' || now - (ranRed.get(k) ?? -1e9) < 20000) continue;
        ranRed.set(k, now);
        const w = nearestUnit(j.x, j.z, 250);
        signal('redlight', junctionName(j));
        const pat = patrols.find((p) => !p.leaving && Math.hypot(p.x - me.x, p.z - me.z) < 60);
        if (w || pat) {
          if (w) unitSay(w, `red light run at ${junctionName(j)} -- your car, ${kmh} km/h.`, true);
          report({ code: 'RL-1', place: junctionName(j), unit: w?.unit?.id, kmh, patrol: !!pat, patrolId: pat?.id, witnesses: witnessesAt(me.x, me.z) });
        }
      }
      // speeding past a unit: over 75 km/h (the city's 60 limit, plus 15) is SP-1; over 90, SP-2
      if (kmh > 75 && now - speedLogged > 30000) {
        const w = nearestUnit(me.x, me.z, 60);
        if (w) {
          const road = world.nearestRoad(me.x, me.z, 40, KIND.residential)?.r.name ?? 'the road';
          signal('speeding', road, kmh); speedLogged = now;
          unitSay(w, `speed logged: ${kmh} km/h on ${road}.`, true);
          report({ code: kmh > 90 ? 'SP-2' : 'SP-1', place: road, unit: w.unit!.id, kmh, witnesses: 0 });
        }
      }
    };
    // ---- the police (Fair Streets): the server holds your record and decides; the game drives the patrols ----
    let cops: PoliceStatus = { stars: 0, heat: 0, state: 'clear', calm: false, pending: 0, clearIn: null, pursuitLeft: null, searchLeft: null };
    let patrolNo = 0, rammedAt = -1e9, hazards = false, lastTick = -1e9, ticking = false;
    const patrols: Patrol[] = [];
    let router: Router | null = null;
    const active = () => cops.state === 'pursuit' || cops.state === 'complying' || cops.state === 'searching';
    const fmt = (n: number) => n.toLocaleString('en-NG');
    /** people near enough to have seen it (up to three) */
    const witnessesAt = (x: number, z: number) => Math.min(3, walkers.filter((w) => !w.unit && Math.hypot(w.x - x, w.z - z) < 40).length);
    /** what a settlement cost, in a sentence */
    const costLine = (s: Settlement) => s.caution ? 'It stands as a caution: no money.'
      : `₦${fmt(s.fine)}${s.paid ? `: ₦${fmt(s.paid)} paid now` : ''}${s.owed ? `, ₦${fmt(s.owed)} on your payment plan` : ''}${s.waived ? `, ₦${fmt(s.waived)} waived` : ''}.`;
    const applyCops = (s: Partial<PoliceStatus> | null | undefined) => {
      if (!s || s.stars === undefined) return;
      cops = { ...cops, ...s } as PoliceStatus;
      if (!active()) { hazards = false; patrols.forEach((p) => { p.leaving = true; }); }
    };
    const refreshWallet = () => { api.cityWallet().then((w) => setWallet(w.naira)).catch(() => {}); };
    /** an offence the game saw goes to the server, which decides what it is */
    const report = (r: Parameters<typeof api.policeReport>[0]) => {
      api.policeReport(r).then((res) => {
        if (res.error || !res.citation) return;
        applyCops(res);
        const c = res.citation, who = r.unit ?? r.patrolId ?? 'WYRD';
        if (c.outcome === 'note') return; // (too little to go on: written down, nothing more)
        if (c.outcome === 'warning') wyrdSay(`WYRD → ${who}: ${c.code} at ${c.place}. First this week, so it's a warning. Next time it's a fine.`);
        else wyrdSay(`WYRD → ${who}: ${c.code} at ${c.place}, ${c.confidence}% sure. ₦${fmt(c.amount)} pending${res.stars >= 2 ? ' -- sending a patrol' : ''}.`);
      }).catch(() => {});
    };
    /** the pursuit as the game sees it, every couple of seconds while anything is going on */
    const policeTick = (now: number) => {
      if (ticking) return;
      const due = active() || cops.stars >= 2 ? 2000 : cops.stars > 0 || cops.state !== 'clear' ? 15000 : Infinity;
      if (now - lastTick < due) return;
      lastTick = now; ticking = true;
      const chasers = patrols.filter((p) => !p.leaving);
      const near = chasers.reduce((m, p) => Math.min(m, Math.hypot(p.x - me.x, p.z - me.z)), Infinity);
      const seen = near < 160 || walkers.some((w) => w.unit && Math.hypot(w.x - me.x, w.z - me.z) < 60);
      const speed = me.car ? Math.abs(me.car.v) : me.moving ? (keys.has('shift') ? 5 : 1.5) : 0;
      api.policeTick({ dist: near === Infinity ? null : Math.round(near), speed: Math.round(speed * 10) / 10, seen, hazards, onFoot: !me.car,
        place: world.nearestRoad(me.x, me.z, 60, KIND.residential)?.r.name ?? areaOf(me.x, me.z) })
        .then((t) => onTick(t, performance.now())).catch(() => {}).finally(() => { ticking = false; });
    };
    const onTick = (t: PoliceTick, now: number) => {
      if (t.error) return;
      applyCops(t);
      if (t.dispatch) for (let i = 0; i < t.dispatch; i++) void dispatch(now);
      if (t.stop) {
        const s = t.stop, p = patrols.find((q) => !q.leaving);
        signal('caught', world.nearestRoad(me.x, me.z, 60, KIND.residential)?.r.name ?? areaOf(me.x, me.z));
        say(t.complied
          ? `Officer: "Thank you for stopping well." ${s.codes.join(', ')}: ${costLine(s)}`
          : `Officer: "Oga, you dey drive like say na your papa road." ${s.codes.join(', ')}: ${costLine(s)}`);
        wyrdSay(`WYRD → ${p?.id ?? 'patrol'}: Stop made. Record settled. Receipts and citations are on the phone.`);
        refreshWallet();
      }
      if (t.breakOff) { say(`The patrol has broken off: three minutes is long enough for anyone. Citation posted: ${t.posted ? costLine(t.posted) : ''}`); refreshWallet(); }
      if (t.searching) say('They\'ve lost sight of you. They\'ll look for a minute. The citation still comes.');
      if (t.escaped) { signal('lost', world.nearestRoad(me.x, me.z, 60, KIND.residential)?.r.name ?? areaOf(me.x, me.z)); say(`You got away. The citation still comes: ${t.posted ? costLine(t.posted) : ''}`); refreshWallet(); }
      if (t.posted && t.why) {
        wyrdSay(t.why === 'calm' ? `WYRD: Calm streets is on, so no patrol. Your citation is posted: ${costLine(t.posted)}` : `WYRD: You were stopped not long ago, so no chase this time. Citation posted: ${costLine(t.posted)}`);
        refreshWallet();
      }
    };
    /** WYRD sends a patrol: from a few streets away, by road to you */
    const dispatch = async (now: number) => {
      router ??= await Router.load().catch(() => null);
      let x = me.x, z = me.z, route: Route | null = null;
      // from whichever of eight spots round you has the shortest drive in
      const to = router?.nearest(me.x, me.z, 400);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, st = router?.nearest(me.x + Math.cos(a) * 240, me.z + Math.sin(a) * 240, 300);
        if (!st) continue;
        const R = to ? router!.route(st, to, true) : null;
        if (R && (!route || R.len < route.len)) { route = R; x = st.x; z = st.z; }
        else if (!route && x === me.x) { x = st.x; z = st.z; }
      }
      if (x === me.x && z === me.z) { const n = world.nearestRoad(me.x + 150, me.z, 300, KIND.tertiary); if (!n) return; x = n.x; z = n.z; }
      const id = `P-${++patrolNo}`;
      patrols.push({ id, x, z, h: 0, v: 0, route, s: 0, replanAt: now + 4000, near: 0, farFor: 0, leaving: false });
      const street = world.nearestRoad(me.x, me.z, 60, KIND.residential)?.r.name ?? 'the city';
      const unit = nearestUnit(me.x, me.z, 400);
      wyrdSay(`WYRD → Police: car flagged${unit ? ` by ${unit.unit!.id}` : ''} near ${street}. Patrol ${id} dispatched.`);
      say(`Police patrol ${id} is coming for you. Stop and take the fine, or lose them.`);
    };
    /** the patrols called off */
    const standDown = (why: string) => {
      const on = patrols.filter((p) => !p.leaving);
      on.forEach((p) => { p.leaving = true; });
      if (on.length) wyrdSay(`WYRD → ${on.map((p) => p.id).join(', ')}: Stand down. ${why}`);
    };

    /** a call from the phone: who picks up, what's said, and what it does to the stars */
    const CALLED: Record<string, string> = { fines: 'Alagbon Fines Desk', wyrd: 'WYRD', daddy: 'Family connections', lawyer: 'A lawyer', uncle: 'Family connections', sgt: 'Community connections', chairman: 'Community connections' };
    callRef.current = async (id) => { const res = await placeCall(id); if (res.cleared) signal('call', CALLED[id] ?? 'Someone', res.cleared); return res; };
    /** a call from the phone: the server decides what it does; the conversation is written here */
    const placeCall = async (id: string): Promise<CallResult> => {
      let r: Awaited<ReturnType<typeof api.policeCall>>;
      try { r = await api.policeCall(id); } catch { return { lines: [['them', '(The line is busy. Try again.)']], cleared: 0, outcome: 'No answer' }; }
      applyCops(r);
      const n = r.cleared ?? 0;
      if (r.standDown) standDown(id === 'lawyer' ? 'Counsel has filed.' : id === 'uncle' ? 'Orders from Force HQ.' : 'Word came down.');
      if (r.fee) refreshWallet();
      if (!r.ok) {
        switch (r.reason) {
          case 'clean': return { lines: [['you', 'Hello?'], ['them', id === 'fines' ? 'Alagbon fines desk. Your record is clean. Go and enjoy Lagos.' : id === 'daddy' ? 'Ah, my son. You\'re calling for no reason? Is everything fine?' : 'You\'re not in any trouble. Go and enjoy Lagos.']], cleared: 0, outcome: 'Nothing to clear' };
          case 'busy': return { lines: [['them', `(Missed call. They called back to say: "Not again so soon. Try me in ${r.wait} min.")`]], cleared: 0, outcome: `Try again in ${r.wait} min` };
          case 'too_many': return { lines: [['you', 'WYRD, can you talk to the police for me?'], ['them', 'Not with that record. Get it to two stars or less and I\'ll put in a word.']], cleared: 0, outcome: 'Too many stars for WYRD' };
          case 'no_answer': return { lines: [['them', '(The number you are calling is not available at the moment. Please try again later.)']], cleared: 0, outcome: `No answer · try in ${r.wait ?? 5} min` };
          case 'payment_failed': return { lines: [['you', 'I want to settle this.'], ['them', id === 'lawyer' ? 'My retainer first, and your account can\'t cover it.' : 'The payment didn\'t go through.']], cleared: 0, outcome: 'Payment failed' };
          default: return { lines: [['them', '(This number is not reachable.)']], cleared: 0, outcome: 'No answer' };
        }
      }
      const did = n ? `${n} star${n > 1 ? 's' : ''} cleared` : 'Record settled';
      switch (id) {
        case 'fines': return { lines: [['you', 'Good day. I want to settle a traffic matter.'], ['them', 'I see it on WYRD\'s log.'], ['them', `₦${fmt(r.fee ?? 0)}${r.owed ? `, ₦${fmt(r.owed)} of it on your plan` : ''}. Received. Drive with sense.`]], cleared: n, outcome: `${did} · ₦${fmt(r.fee ?? 0)}` };
        case 'wyrd': wyrdSay('WYRD: I\'ve told my units you\'re known to me. Don\'t make me regret it.'); return { lines: [['you', 'WYRD, can you put in a word for me?'], ['them', 'Already done. My units are still watching, though.']], cleared: n, outcome: did };
        case 'daddy': return { lines: [['you', 'Daddy, small wahala with the police...'], ['them', 'Again? Which division this time?'], ['you', 'WYRD flagged the car.'], ['them', 'Hmm. I will call the AIG. And stop driving like a danfo driver.']], cleared: n, outcome: did };
        case 'lawyer': return { lines: [['them', 'Funmi Adeyemi chambers.'], ['you', 'Barrister, the police are after me.'], ['them', 'Say nothing to anyone. I\'m filing now... Done. They have been told to stand down.'], ['them', 'My invoice is in your inbox: ₦10,000.']], cleared: n, outcome: `${did} · ₦10,000 retainer` };
        case 'uncle': setTimeout(() => wyrdSay('WYRD: Noted. A call from Force HQ cleared your record. Money talks in Lagos; I keep the minutes.'), 2500); return { lines: [['them', 'Ah, my boy! How is Chief?'], ['you', 'He\'s fine, Uncle. It\'s the police again.'], ['them', 'Leave it with me. Nobody will disturb you today.']], cleared: n, outcome: did };
        case 'sgt': return { lines: [['them', 'Nurse! How far?'], ['you', 'Sergeant, your boys are after me.'], ['them', 'For you? Ehen. Give me five minutes.']], cleared: n, outcome: did };
        default: return { lines: [['them', 'Who be this?'], ['you', 'Na me, Mama Bisi pikin, from Ojuelegba.'], ['them', 'Ah! No wahala. I go talk to them.']], cleared: n, outcome: did };
      }
    };
    const stepPolice = (dt: number, now: number) => {
      policeTick(now);
      const searching = cops.state === 'searching';
      for (let i = patrols.length - 1; i >= 0; i--) {
        const p = patrols[i], d = Math.hypot(me.x - p.x, me.z - p.z);
        if (p.leaving) {
          p.v = Math.min(20, p.v + 6 * dt); p.x += Math.sin(p.h) * p.v * dt; p.z += Math.cos(p.h) * p.v * dt;
          if (d > 300) patrols.splice(i, 1);
          continue;
        }
        let want: number;
        if (d < 40 || !p.route) {
          // close: straight at you, stopping a car's length off (and not through walls)
          want = Math.min(24, Math.sqrt(2 * 7 * Math.max(0, d - 9))); // (braking to stop a car's length off)
          const th = Math.atan2(me.x - p.x, me.z - p.z);
          let dh = th - p.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
          p.h += Math.max(-3 * dt, Math.min(3 * dt, dh));
          const nx = p.x + Math.sin(p.h) * p.v * dt, nz = p.z + Math.cos(p.h) * p.v * dt;
          if (!world.blocked(nx, nz, 1.2)) { p.x = nx; p.z = nz; } else p.v *= 0.5;
          if (d > 60) p.route = null, p.replanAt = Math.min(p.replanAt, now); // (got away again: back to the roads)
        } else {
          want = searching ? 10 : 22; // (searching: slow, looking)
          const R = p.route, ahead = onRoute(R, p.s + 15);
          let turn = Math.abs(ahead.heading - p.h); if (turn > Math.PI) turn = Math.PI * 2 - turn;
          if (turn > 0.5) want = 10;
          p.s = Math.min(R.len, p.s + p.v * dt);
          const a = onRoute(R, p.s); p.x = a.x; p.z = a.z; p.h = a.heading;
          if (p.s >= R.len - 1) p.route = null;
        }
        // where you are now: a fresh way there by road every few seconds
        if (now > p.replanAt && router && d >= 40) {
          p.replanAt = now + 4000;
          const st = router.nearest(p.x, p.z, 200), to = router.nearest(me.x, me.z, 400);
          const R = st && to ? router.route(st, to, true) : null;
          if (R) { p.route = R; p.s = 0; }
        }
        p.v += Math.max(-10 * dt, Math.min(6 * dt, want - p.v));
        // (whether you've stopped, complied, or got away is the server's call: see policeTick)
      }
    };
    /** a WYRD traffic unit at the corner of the light junctions near you: it takes the junction over and runs it */
    const spawnWardens = () => {
      if (walkers.filter((w) => w.role === 'warden').length >= 2) return;
      for (const j of traffic.junctions) {
        if (Math.hypot(j.x - me.x, j.z - me.z) > 130 || walkers.some((w) => w.role === 'warden' && Math.hypot(w.x - j.x, w.z - j.z) < 40)) continue;
        for (let k = 0; k < 8; k++) {
          const a = Math.PI / 4 + (k % 4) * Math.PI / 2, d = 9 + Math.floor(k / 4) * 5, x = j.x + Math.sin(a) * d, z = j.z + Math.cos(a) * d;
          const n = world.nearestRoad(x, z, 30, KIND.residential);
          if (!n || n.d < n.r.w / 2 + 0.6 || world.blocked(x, z, 2)) continue; // (on the pavement, clear of the walls)
          const key = junctionKey(j), id = `T-${String(Math.abs(Math.round(j.x * 3 + j.z * 7)) % 90 + 10)}`;
          const look: Look = { ...lookFor(1), bot: '#00F0FF' };
          walkers.push({ r: n.r, s: n.s, dir: 1, v: 0, sprite: WALKERS[0], side: 1, x, z, left: false, look, heading: Math.atan2(j.x - x, j.z - z), role: 'warden', pose: 'wave', label: `WYRD unit ${id}`, t0: Math.random() * 10, unit: { id, key, q: [0, 0], reported: performance.now() - 30000 } });
          traffic.take(j, id, performance.now());
          unitSay(walkers[walkers.length - 1], `On station at ${junctionName(j)}. Taking the lights.`, false);
          return;
        }
      }
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
      if (k === 'e' && !boardRide()) toggleCar();
      if (k === 'p' && !e.repeat) setPhone((v) => !v);
      if (k === 'h' && !e.repeat && active()) { hazards = !hazards; say(hazards ? (me.car ? 'Hazards on. Slow down and the patrol will stop you where it\'s safe.' : 'Hands up. Stay where you are.') : 'Hazards off.'); }
      if (k === 'n') setNight((v) => !v);
      if (k === 'r') setStanding((v) => (v ? false : 'standing'));
      if (k === 'm') setBoard((v) => !v);
      if (k === 't') { e.preventDefault(); setWyrdOpen((v) => !v); }
      if (k === 'q' && !e.repeat) tuneRadio();
      if (k === 'f8' && !e.repeat) { perfOn.current = !perfOn.current; if (!perfOn.current) setPerf(null); }
      if (k === 'tab') { e.preventDefault(); if (!e.repeat) setCityMap((v) => !v); }
      if (k === 'escape') { if (boardRef.current) setBoard(false); setWyrdOpen(false); setPhone(false); }
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
      me.x = c.x; me.z = c.z; me.car = { sprite: c.sprite, v: 0, rot: c.rot, hp: 100 };
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
    // ---- rides: ordered on the phone; the car or flyer comes for you, you get in (E), and it takes you there ----
    let ride: Ride | null = null;
    const RIDE_V = { road: 18, air: 45 };
    rideCtl.current.order = async (f, kind, lift) => {
      if (ride) { say('You already have a ride on its way.'); return; }
      if (job) { say('Finish your job first -- the customer is waiting.'); return; }
      if (me.car) { say('Park and step out first (E), then order.'); return; }
      if (Math.hypot(f.x - me.x, f.z - me.z) < 150) { say(`${f.name} is right here. Walk it!`); return; }
      let route: Route | null = null, trip: Route | null = null;
      if (kind === 'road') {
        // the way there by road, worked out before you pay: pickup on the main road nearest you, drop-off nearest there
        let router: Router;
        try { router = await Router.load(); } catch { say('WYRD Ride could not reach the city. Try again.'); return; }
        const pick = router.nearest(me.x, me.z, 600), drop = router.nearest(f.x, f.z, 1500);
        if (!pick) { say('No main road near you for a pickup. Walk to a bigger road, or take WYRD Air.'); return; }
        if (!drop) { say(`No road reaches ${f.name}. WYRD Air can fly you there.`); return; }
        trip = router.route(pick, drop);
        if (!trip || trip.len < 40) { say(`No way there by road. WYRD Air can fly you there.`); return; }
        // the car starts a few streets away and drives to you (one-way systems can make the way round long: it
        // starts the last 450 m of it, out of sight)
        for (let i = 0; i < 8 && !route; i++) {
          const a = Math.random() * Math.PI * 2, st = router.nearest(me.x + Math.cos(a) * 260, me.z + Math.sin(a) * 260, 300);
          const r = st && router.route(st, pick);
          if (r && r.len > 120) route = r;
        }
      }
      try {
        const r = await api.cityPay(lift ? 'lift' : kind === 'air' ? 'air' : 'ride');
        if ('error' in r && r.error) { say(String(r.error)); return; }
        setWallet((r as { naira: number }).naira);
      } catch { say('WYRD could not take the payment. Try again.'); return; }
      const dest = { x: f.x, z: f.z, name: f.name };
      signal(kind === 'air' ? 'air' : 'ride', areaOf(f.x, f.z), Math.hypot(f.x - me.x, f.z - me.z) / 1000);
      if (kind === 'road') {
        const s0 = route ? Math.max(0, route.len - 450) : 0, at = route ? onRoute(route, s0) : onRoute(trip!, 0);
        ride = { kind, phase: route ? 'coming' : 'waiting', dest, route, trip, s: s0, v: 0, x: at.x, z: at.z, y: 0, h: at.heading, sprite: 'car-white', fast: false, from: { x: at.x, z: at.z }, to: dest, t: 0 };
        say(route ? `WYRD Ride ordered to ${f.name}. Your car is on its way — watch for the arrow.` : 'Your WYRD Ride is right here. Walk over and press E.');
      } else {
        // a WYRD flyer: in from over the roofs, down beside you
        const a = Math.random() * Math.PI * 2, x = me.x + Math.cos(a) * 320, z = me.z + Math.sin(a) * 320;
        const st = world.nearestRoad(me.x, me.z, 60, KIND.residential), land = st ? { x: st.x, z: st.z } : { x: me.x + 4, z: me.z + 3 }; // (down on the street)
        const sprite = ['wyrd-cab-navy', 'wyrd-cab-pearl', 'wyrd-bubble-gold', 'wyrd-bubble-mint'][Math.floor(Math.random() * 4)];
        ride = { kind, phase: 'coming', dest, route: null, trip: null, s: 0, v: 0, x, z, y: 45, h: Math.atan2(land.x - x, land.z - z), sprite, fast: false, from: { x, z }, to: land, t: 0 };
        say(`WYRD Air ordered to ${f.name}. Your flyer is coming in over the roofs.`);
      }
    };
    /** get into the ride when it's here and you're beside it (E); true if E was about the ride */
    const boardRide = () => {
      if (!ride || ride.phase === 'leaving') return false;
      if (ride.phase === 'riding') return true; // (sit tight: Skip on the phone if you want to be there now)
      // still pulling in, but right beside you: it stops for you there
      if (ride.phase === 'coming') {
        if (Math.hypot(ride.x - me.x, ride.z - me.z) > 12 || (ride.kind === 'air' && ride.y > 6)) return false;
        if (ride.kind === 'road') { ride.s = ride.route!.len; const a = onRoute(ride.route!, ride.s); ride.x = a.x; ride.z = a.z; ride.h = a.heading; }
        else { ride.x = ride.to.x; ride.z = ride.to.z; ride.y = 1.5; }
        ride.phase = 'waiting';
      }
      if (Math.hypot(ride.x - me.x, ride.z - me.z) > 12) { say('Walk up to your ride (the yellow arrow), then press E.'); return true; }
      if (ride.kind === 'road') { ride.route = ride.trip; ride.s = 0; }
      else { ride.from = { x: ride.x, z: ride.z }; ride.to = { x: ride.dest.x, z: ride.dest.z }; ride.s = 0; ride.h = Math.atan2(ride.to.x - ride.x, ride.to.z - ride.z); }
      ride.phase = 'riding'; ride.v = 0; me.moving = false;
      say(ride.kind === 'air' ? `Up and away to ${ride.dest.name}.` : `On the way to ${ride.dest.name}. Sit back — WYRD is driving.`);
      return true;
    };
    /** you're there: out onto the street, and the ride goes on its way */
    const arrive = () => {
      if (!ride) return;
      if (ride.kind === 'road') {
        const a = onRoute(ride.route!, ride.route!.len);
        me.x = a.x + Math.cos(a.heading) * 2.8; me.z = a.z - Math.sin(a.heading) * 2.8; // (out on the kerb side)
      } else { me.x = ride.x - 3; me.z = ride.z; arriving = true; } // (stepped off onto the nearest street once it's in)
      cam.x = me.x; cam.z = me.z;
      say(`You have arrived at ${ride.dest.name}. Thank you for riding with WYRD.`);
      ride.phase = 'leaving'; ride.t = 0;
    };
    rideCtl.current.cancel = () => {
      if (!ride || ride.phase === 'riding') return;
      ride.phase = 'leaving'; ride.t = 0;
      say('Ride cancelled.');
      api.cityRefundRide().then((r) => {
        if (r.error) return;
        setWallet(r.naira);
        if (r.refund) say(`Ride cancelled: ₦${r.refund.toLocaleString('en-NG')} back in your wallet.`);
      }).catch(() => {});
    };
    rideCtl.current.fast = () => { if (ride) ride.fast = !ride.fast; };
    rideCtl.current.skip = () => {
      if (!ride) return;
      if (ride.phase === 'coming') {
        // straight to the pickup
        if (ride.kind === 'road') { ride.s = ride.route!.len; const a = onRoute(ride.route!, ride.s); ride.x = a.x; ride.z = a.z; ride.h = a.heading; }
        else { ride.x = ride.to.x; ride.z = ride.to.z; ride.y = 1.5; }
        ride.phase = 'waiting'; say('Your ride is here. Walk over and press E.');
      } else if (ride.phase === 'riding') {
        // straight to the drop-off (the city there loads in around you)
        if (ride.kind === 'road') { ride.s = ride.route!.len; const a = onRoute(ride.route!, ride.s); ride.x = a.x; ride.z = a.z; ride.h = a.heading; }
        else { ride.x = ride.to.x; ride.z = ride.to.z; ride.y = 1.5; }
        me.x = ride.x; me.z = ride.z; cam.x = me.x; cam.z = me.z;
        cars.length = 0; walkers.length = 0; arriving = ride.kind === 'air';
        arrive();
      }
    };
    /** the ride moves on: [dt] seconds (four times as many when fast-forwarded) */
    const stepRide = (dt0: number) => {
      if (!ride) return;
      const dt = dt0 * (ride.fast && ride.phase !== 'waiting' ? 4 : 1);
      ride.t += dt;
      if (ride.kind === 'road') {
        if (ride.phase === 'leaving') {
          // pulls away down the road and is gone
          if (world.nearestRoad(ride.x, ride.z, 30, KIND.residential)) cars.push({ ...nearestRoadCar(ride.x, ride.z, ride.sprite), v: 12, rot: ride.h } as Car);
          ride = null; return;
        }
        if (ride.phase === 'waiting') return;
        const R = ride.route!;
        // as a careful driver: up to speed gently, slower round corners, and keeping a gap to whatever's ahead
        let want = ride.phase === 'coming' ? 15 : RIDE_V.road;
        const ahead = onRoute(R, ride.s + 18);
        let turn = Math.abs(ahead.heading - ride.h); if (turn > Math.PI) turn = Math.PI * 2 - turn;
        if (turn > 0.5) want = Math.min(want, 8); else if (turn > 0.25) want = Math.min(want, 12);
        const hx = Math.sin(ride.h), hz = Math.cos(ride.h);
        let gap = Infinity;
        for (const o of cars) { const dx = o.x - ride.x, dz = o.z - ride.z, al = dx * hx + dz * hz; if (al > 0 && al < 20 && Math.abs(dx * hz - dz * hx) < 2.1) gap = Math.min(gap, al); }
        if (ride.phase === 'coming' && !me.car) { const dx = me.x - ride.x, dz = me.z - ride.z, al = dx * hx + dz * hz; if (al > 0 && al < 8 && Math.abs(dx * hz - dz * hx) < 2) gap = Math.min(gap, al); }
        if (gap < Infinity) want = Math.min(want, gap < 6.5 ? 0 : want * Math.min(1, (gap - 6.5) / 9));
        // ...and it slows to a stop at the end
        want = Math.min(want, Math.sqrt(2 * 3 * Math.max(0, R.len - ride.s)) + 0.5);
        ride.v += Math.max(-9 * dt, Math.min(3 * dt, want - ride.v));
        ride.s = Math.min(R.len, ride.s + ride.v * dt);
        const a = onRoute(R, ride.s);
        ride.x = a.x; ride.z = a.z; ride.h = a.heading;
        if (ride.s >= R.len - 0.05) {
          if (ride.phase === 'coming') { ride.phase = 'waiting'; ride.v = 0; say('Your WYRD Ride is here. Walk over and press E.'); }
          else arrive();
        }
      } else {
        if (ride.phase === 'leaving') {
          // climbs away and is gone
          ride.y += 9 * dt; ride.x += Math.sin(ride.h) * 22 * dt; ride.z += Math.cos(ride.h) * 22 * dt;
          if (ride.y > 60 || Math.hypot(ride.x - me.x, ride.z - me.z) > 400) ride = null;
          return;
        }
        if (ride.phase === 'waiting') { ride.y = 1.5 + Math.sin(ride.t * 2) * 0.15; return; }
        // flies at cruising height and comes down at the end: up off the ground first when you're aboard
        const dx = ride.to.x - ride.x, dz = ride.to.z - ride.z, left = Math.hypot(dx, dz);
        const gone = Math.hypot(ride.x - ride.from.x, ride.z - ride.from.z);
        const top = ride.phase === 'riding' ? Math.min(45, 1.5 + gone * 0.5) : 45;
        const wantY = Math.max(1.5, Math.min(top, 1.5 + left * 0.35));
        const climbing = ride.phase === 'riding' && ride.y < wantY - 0.5 && gone < 30;
        const want = climbing ? 6 : Math.min(RIDE_V.air, 4 + left * 0.6);
        ride.v += Math.max(-14 * dt, Math.min(8 * dt, want - ride.v));
        const step = Math.min(left, ride.v * dt);
        if (left > 0.01) { ride.x += (dx / left) * step; ride.z += (dz / left) * step; ride.h = Math.atan2(dx, dz); }
        ride.y += Math.max(-10 * dt, Math.min(10 * dt, wantY - ride.y));
        if (left < 0.3 && ride.y < 2) {
          ride.x = ride.to.x; ride.z = ride.to.z; ride.y = 1.5;
          if (ride.phase === 'coming') { ride.phase = 'waiting'; say('Your WYRD Air flyer has landed. Walk over and press E.'); }
          else arrive();
        }
      }
      if (ride && ride.phase === 'riding') { me.x = ride.x; me.z = ride.z; me.moving = false; }
    };
    const rideStatus = (): RideStatus | null => {
      if (!ride || ride.phase === 'leaving') return null;
      const R = ride.route;
      const m = ride.kind === 'road' ? (R ? R.len - ride.s : 0) : Math.hypot(ride.to.x - ride.x, ride.to.z - ride.z);
      const sp = (ride.kind === 'road' ? (ride.phase === 'coming' ? 12 : 13) : 35) * (ride.fast ? 4 : 1);
      return { kind: ride.kind, phase: ride.phase, dest: ride.dest.name, metres: Math.round(m / 50) * 50, seconds: Math.round(m / sp / 5) * 5, fast: ride.fast };
    };
    const siren = (() => {
      let ac: AudioContext | null = null, osc: OscillatorNode | null = null, lfo: OscillatorNode | null = null, gain: GainNode | null = null;
      return {
        /** the nearest chasing patrol is [d] metres off (Infinity: none) */
        set(d: number) {
          const vol = d === Infinity ? 0 : Math.max(0, 1 - d / 220) * 0.05;
          if (!vol && !gain) return;
          if (!ac) {
            try { ac = new AudioContext(); } catch { return; }
            osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 760;
            lfo = ac.createOscillator(); lfo.frequency.value = 0.45; const depth = ac.createGain(); depth.gain.value = 260; lfo.connect(depth).connect(osc.frequency);
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
            gain = ac.createGain(); gain.gain.value = 0;
            osc.connect(lp).connect(gain).connect(ac.destination); osc.start(); lfo.start();
          }
          gain!.gain.setTargetAtTime(vol, ac.currentTime, 0.2);
        },
        off() { try { osc?.stop(); lfo?.stop(); void ac?.close(); } catch { /* already off */ } ac = null; gain = null; },
      };
    })();
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
    let camMovedAt = -1e9, camWas = { yaw: 0, tilt: 0 }; // (turning and tipping only: a zoom is shown by scaling the scenery)
    let zoomAt = -1e9, scaleWas = 0, raisedAt = -1e9, raiseFailedAt = -1e9;
    let slowAvg = 16, quality = 2, qualityAt = performance.now(), lastHaze = -1, lastHazeNight = false, lastLive = { x0: 0, y0: 0, x1: 99999, y1: 99999 };
    const gpu = graphicsName();
    if (gpu.software) quality = 0.75; // drawn in software: a lighter resolution from the start, so it stays smooth
    let perfAt = performance.now(), perfFrames = 0, perfWork = 0, perfWorst = 0;
    const frame = (now: number) => {
      const t0 = performance.now();
      frameBody(now);
      const work = performance.now() - t0;
      perfFrames++; perfWork += work; perfWorst = Math.max(perfWorst, work);
      if (t0 - perfAt >= 1000) {
        if (perfOn.current) setPerf({ fps: Math.round((perfFrames * 1000) / (t0 - perfAt)), ms: +(perfWork / perfFrames).toFixed(1), worst: Math.round(perfWorst), res: `${canvas.width}×${canvas.height}`, gpu: gpu.name, software: gpu.software });
        perfAt = t0; perfFrames = 0; perfWork = 0; perfWorst = 0;
      }
    };
    const frameBody = (now: number) => {
      raf = requestAnimationFrame(frame);
      // the world runs on real time, however long a frame takes to draw (turning the camera redraws the whole city):
      // a slow frame advances it in several small steps instead of slowing it down -- up to a quarter-second at once
      const realDt = Math.max(0, Math.min(0.25, (now - last) / 1000)); last = Math.max(last, now); // (never backwards)
      const steps = Math.max(1, Math.ceil(realDt / 0.05));
      let dt = realDt / steps;
      // sharpness that keeps up: full device resolution while frames are quick; standard resolution on slower
      // graphics (a 1.25x screen draws half again as many pixels), judged over the last couple of seconds
      // (frames during and just after a camera turn or zoom don't count: those pass, and judging by them left the
      // picture soft for good)
      const calm = now - camMovedAt > 1500 && now - zoomAt > 1500;
      if (calm) slowAvg = slowAvg * 0.97 + Math.min(100, realDt * 1000) * 0.03;
      // ...and on modest graphics (a laptop's built-in chip filling the screen is the slow part, not the game), a step
      // lighter at a time -- standard, then 85%, then 72% -- until frames keep up: a touch softer, much smoother
      if (calm && slowAvg > 24 && now - qualityAt > 3000) {
        const next = quality > 1 ? 1 : quality > 0.85 ? 0.85 : quality > 0.72 ? 0.72 : quality;
        if (next !== quality) { if (now - raisedAt < 10000) raiseFailedAt = now; quality = next; qualityAt = now; slowAvg = 20; }
      }
      // and back up, a step sharper, once frames have been quick for a few seconds -- unless that step was just tried
      // and couldn't keep up (then not again for a minute)
      if (calm && slowAvg < 18 && quality < 2 && now - qualityAt > 4000 && now - raiseFailedAt > 60000) {
        quality = quality < 0.85 ? 0.85 : quality < 1 ? 1 : 2; qualityAt = now; raisedAt = now;
      }
      // while the camera turns or tips the whole city is drawn afresh every frame (no cached scenery fits a
      // view that keeps changing): it's drawn at three-quarters resolution then -- in motion the eye can't tell, and
      // a quarter fewer pixels each way is nearly half the filling -- and sharp again the moment the camera rests
      const turning = now - camMovedAt < 150;
      const dpr = Math.min(2, window.devicePixelRatio || 1, quality) * (turning ? 0.75 : 1);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let step = 0; step < steps; step++) {
        // move
        const ax = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        const az = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
        const riding = ride?.phase === 'riding';
        if (!boardRef.current && !riding) {
          if (me.car) {
            const c = me.car;
            const wrecked = c.hp <= 0; // (wrecked: it won't go -- get out and take another)
            c.v += (wrecked ? 0 : -az) * (az < 0 ? 9 : 14) * dt;
            if (!az || wrecked) c.v *= 1 - (wrecked ? 3 : 0.8) * dt;
            c.v = Math.max(-5, Math.min(24 * (0.55 + 0.45 * c.hp / 100), c.v)); // (a battered car is slower)
            c.rot -= ax * dt * 2.2 * Math.min(1, Math.abs(c.v) / 6) * Math.sign(c.v || 1);
            const fx = Math.sin(c.rot), fz = Math.cos(c.rot);
            const nx = me.x + fx * c.v * dt, nz = me.z + fz * c.v * dt;
            if (stop(nx, nz, 1.2)) { crash(Math.abs(c.v), 'wall', me.x + fx * 2.2, me.z + fz * 2.2, now); c.v *= -0.3; } else { me.x = nx; me.z = nz; }
            // other cars are solid: you're pushed back off them, and hitting one hard does damage (and stops it dead)
            for (const o of cars) {
              const dx = o.x - me.x, dz = o.z - me.z, d = Math.hypot(dx, dz);
              if (d > 3.3 || d < 0.01) continue;
              const ux = dx / d, uz = dz / d, closing = (fx * ux + fz * uz) * c.v;
              me.x -= ux * (3.3 - d); me.z -= uz * (3.3 - d);
              if (closing > 0.8) { crash(closing, 'car', me.x + ux * 1.7, me.z + uz * 1.7, now); c.v *= -0.25; o.stunUntil = now + 3000; o.cur = 0; }
            }
            for (const p of patrols) {
              const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz);
              if (d > 3.3 || d < 0.01) continue;
              const ux = dx / d, uz = dz / d, closing = (fx * ux + fz * uz) * c.v;
              me.x -= ux * (3.3 - d); me.z -= uz * (3.3 - d);
              if (closing > 0.8) { crash(closing, 'car', me.x + ux * 1.7, me.z + uz * 1.7, now); c.v *= -0.25; p.v = 0; if (now - rammedAt > 5000) { rammedAt = now; report({ code: 'PT-1', place: world.nearestRoad(me.x, me.z, 40, KIND.residential)?.r.name ?? areaOf(me.x, me.z), patrol: true, patrolId: p.id, witnesses: witnessesAt(me.x, me.z) }); wyrdSay(`${p.id} → WYRD: Struck by the car we're following. Nobody hurt. Requesting backup.`); } }
            }
            // people: you can't drive through them -- the car stops short
            for (const w of walkers) {
              const dx = w.x - me.x, dz = w.z - me.z, d = Math.hypot(dx, dz);
              if (d < 3 && (dx * fx + dz * fz) * Math.sign(c.v) > 0 && Math.abs(c.v) > 0.5) { c.v *= 0.2; if (now - lastCrashSay > 4000) { lastCrashSay = now; say('Mind the people!'); } }
            }
            // a damaged car smokes, more the worse it gets
            if (c.hp < 55 && Math.random() < dt * (4 + (55 - c.hp) / 5)) puffs.push({ x: me.x - fx * 1.8, z: me.z - fz * 1.8, y: 1.2, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: 1.4 + Math.random(), life: 0, max: 1.8 + Math.random(), kind: 'smoke' });
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
        stepRide(dt);
        world.around(me.x, me.z, 800);
        traffic.update(world, me.x, me.z);
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
        if (step === 0 && Math.random() < 0.05) spawnWardens();
        if (step === 0) runUnits(now);
        stepPolice(dt, now);
        for (let i = cars.length - 1; i >= 0; i--) {
          const c = cars[i];
          if (!c.r) continue;
          // what the road ahead allows: a gap to whatever's in front in its lane (another car on any road, or you), and
          // the light at the junction it's coming to; it eases to that -- braking hard, pulling away gently
          const thief = job?.type === 'chase' && job.thief === c;
          const cruise = thief ? 8.5 : c.v || 11;
          const hx = Math.sin(c.rot), hz = Math.cos(c.rot);
          let gap = Infinity;
          const look = (ox: number, oz: number) => { const dx = ox - c.x, dz = oz - c.z, al = dx * hx + dz * hz; if (al > 0 && al < 20 && Math.abs(dx * hz - dz * hx) < 2.1) gap = Math.min(gap, al); };
          for (const o of cars) if (o !== c) look(o.x, o.z);
          if (me.car) look(me.x, me.z);
          if (ride?.kind === 'road' && ride.phase !== 'leaving') look(ride.x, ride.z);
          for (const p of patrols) look(p.x, p.z);
          let want = !me.car && !riding && Math.hypot(c.x - me.x, c.z - me.z) < 5 ? 0 : cruise;
          if (!thief) {
            if (gap < Infinity) want = Math.min(want, gap < 6.5 ? 0 : cruise * Math.min(1, (gap - 6.5) / 9));
            const line = traffic.stopFor(c.r, c.dir, c.s, now);
            if (line < Infinity) want = Math.min(want, line < 0.6 ? 0 : Math.sqrt(2 * 4.5 * line));
          }
          if ((c.stunUntil ?? 0) > now) want = 0;
          // a danfo (or BRT bus) pulls over for people waiting at the roadside, and they get on
          if (!thief && (c.sprite === 'car-danfo' || c.sprite === 'bus-brt') && now - (c.lastStop ?? -1e9) > 20000) {
            const by = walkers.filter((w) => w.role === 'waiting' && !w.boardAt && Math.hypot(w.x - c.x, w.z - c.z) < 7);
            if (by.length) { c.stopUntil = now + 4000; c.lastStop = now; by.forEach((w) => { w.boardAt = now + 1500 + Math.random() * 1800; w.label = c.sprite === 'bus-brt' ? 'Getting on the BRT' : 'Getting on the danfo'; }); }
          }
          if ((c.stopUntil ?? 0) > now) want = 0;
          const cur = c.cur ?? want;
          c.cur = cur + Math.max(-9 * dt, Math.min(3.5 * dt, want - cur));
          c.s += c.cur * dt;
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
          if (Math.hypot(w.x - me.x, w.z - me.z) > 180) { if (w.unit) traffic.release(w.unit.key); walkers.splice(i, 1); continue; }
          // got on the danfo that pulled over for them
          if (w.boardAt && now > w.boardAt) { walkers.splice(i, 1); continue; }
          if (w.role !== 'commuter' && w.role !== 'sweeper') continue; // (the rest stay where they are, at work)
          if ((w.until ?? 0) > now) continue; // (stopped to buy something)
          if (w.until) { w.until = 0; w.label = commuting(); }
          w.s += w.v * dt;
          if (w.s >= w.r.len) { w.dir = (-w.dir) as 1 | -1; w.s = 0; w.goal = 30 + Math.random() * 120; }
          const a = along(w.r.p, w.r.cum, w.dir === 1 ? w.s : w.r.len - w.s), off = pavementOffset(w.r) * w.side;
          const nx = a.x - a.dz * off, nz = a.z + a.dx * off;
          if (Math.hypot(nx - w.x, nz - w.z) > 0.001) w.heading = Math.atan2(nx - w.x, nz - w.z);
          w.x = nx; w.z = nz;
          if (w.role !== 'commuter') continue;
          // passing a vendor: sometimes stops to buy
          if (!w.bought) for (const v of walkers) {
            if (v.role !== 'vendor' || Math.hypot(v.x - w.x, v.z - w.z) > 1.6) continue;
            w.bought = true;
            if (Math.random() < 0.4) { w.until = now + 3500 + Math.random() * 2500; w.heading = Math.atan2(v.x - w.x, v.z - w.z); w.label = `Buying ${v.label.replace(/^Selling /, '')}`; }
            break;
          }
          // where they were going: in through the door of the building beside them
          if (w.s >= (w.goal ?? Infinity)) {
            const out = pavementOffset(w.r) + 3.5, gx = a.x - a.dz * out * w.side, gz = a.z + a.dx * out * w.side;
            if (world.blocked(gx, gz, 0.6)) { walkers.splice(i, 1); continue; }
            w.goal = w.s + 20 + Math.random() * 60;
          }
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
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.life += dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
          if (p.kind === 'spark') p.vy -= 12 * dt;
          if (p.life > p.max || p.y < 0) puffs.splice(i, 1);
        }
        // flying cars: sky lanes across the city, 30-60 m up, each crossing near you and flying on out of sight
        if (flyers.length < 3) { // (a few at a time: the sky over Lagos is busy, not crowded)
          const a = Math.random() * Math.PI * 2, x = me.x + Math.cos(a) * 320, z = me.z + Math.sin(a) * 320;
          const tx = me.x + (Math.random() - 0.5) * 240, tz = me.z + (Math.random() - 0.5) * 240;
          flyers.push({ x, z, y: 30 + Math.floor(Math.random() * 4) * 10, h: Math.atan2(tx - x, tz - z), v: 22 + Math.random() * 16, sprite: FLYER_SPRITES[Math.floor(Math.random() * FLYER_SPRITES.length)] });
        }
        for (let i = flyers.length - 1; i >= 0; i--) {
          const f = flyers[i];
          f.x += Math.sin(f.h) * f.v * dt; f.z += Math.cos(f.h) * f.v * dt;
          if (Math.hypot(f.x - me.x, f.z - me.z) > 420) flyers.splice(i, 1);
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
      }
      dt = realDt;
      // camera
      const want = me.car ? Math.min(zoom, 11) : zoom; // pull back a little at the wheel, to see the road ahead
      cam.w = W; cam.h = H; cam.dpr = dpr;
      cam.scale += (want - cam.scale) * Math.min(1, dt * 9); // (a third of a second or so: the sharp scenery can start coming in)
      if (Math.abs(want - cam.scale) < want * 0.01) cam.scale = want; // settle exactly, so the scenery cache can hold
      cam.x += (me.x - cam.x) * Math.min(1, dt * 5);
      cam.z += (me.z - cam.z) * Math.min(1, dt * 5);
      if (cam.yaw !== camWas.yaw || cam.tilt !== camWas.tilt) { camMovedAt = now; camWas = { yaw: cam.yaw, tilt: cam.tilt }; }
      if (cam.scale !== scaleWas) { zoomAt = now; scaleWas = cam.scale; }
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
      const inRide = ride?.phase === 'riding';
      if (ride?.kind === 'road') spr.push({ s: ride.sprite, x: ride.x, z: ride.z, veh: true, heading: ride.h });
      for (const p of patrols) spr.push({ s: 'car-police', x: p.x, z: p.z, veh: true, heading: p.h });
      for (const w of walkers) {
        const moving = (w.role === 'commuter' || w.role === 'sweeper') && !((w.until ?? 0) > now);
        spr.push({ s: w.sprite, x: w.x, z: w.z, look: w.look, heading: w.heading, walk: moving ? (w.s / 0.7) % 2 : undefined, pose: w.pose, t: now / 1000 + w.t0 });
      }
      let playerSprite: Sprite | null = null;
      if (me.car) { playerSprite = { s: me.car.sprite, x: me.x, z: me.z, veh: true, heading: me.car.rot }; spr.push(playerSprite); }
      else if (inRide) { if (ride!.kind === 'road') playerSprite = spr[spr.length - 1]; } // (you're in it: it's the one to keep in sight)
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
      const cached = !turning && scenery.draw(ctx, cam, dpr, night, sea, sand, fixed, lampPools, now); // (not mid-turn: it would start the scenery afresh at the passing view)
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
      // the traffic lights, then smoke and sparks
      traffic.draw(ctx, (x, z, y) => toScreen(cam, x, z, y), cam.scale, W, H, now, night);
      for (const p of puffs) {
        const q = toScreen(cam, p.x, p.z, p.y), t = p.life / p.max;
        if (p.kind === 'smoke') { ctx.fillStyle = `rgba(70,74,82,${(0.45 * (1 - t)).toFixed(3)})`; ctx.beginPath(); ctx.arc(q.sx, q.sy, (0.5 + t * 1.6) * cam.scale, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = t < 0.5 ? '#FFF3B0' : '#FFB23D'; ctx.beginPath(); ctx.arc(q.sx, q.sy, Math.max(1, 0.12 * cam.scale), 0, Math.PI * 2); ctx.fill(); }
      }
      // flying cars, over the roofs, far ones first
      const sky = ride?.kind === 'air' ? [...flyers, ride] : flyers;
      for (const f of [...sky].sort((p, q) => depth(cam, p.x, p.z) - depth(cam, q.x, q.z))) drawFlyer(ctx, cam, { s: f.sprite, x: f.x, z: f.z, veh: true, heading: f.h, lift: f.y }, night);
      // your hazards, flashing amber
      if (hazards && me.car && Math.floor(now / 400) % 2) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [fx, fz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const c0 = Math.cos(me.car.rot), s0 = Math.sin(me.car.rot), q = toScreen(cam, me.x + (fx * 0.9) * c0 + (fz * 2) * s0, me.z - (fx * 0.9) * s0 + (fz * 2) * c0, 0.8), rr = 0.7 * cam.scale;
          const gr = ctx.createRadialGradient(q.sx, q.sy, 0, q.sx, q.sy, rr); gr.addColorStop(0, 'rgba(255,170,40,0.95)'); gr.addColorStop(1, 'rgba(255,170,40,0)');
          ctx.fillStyle = gr; ctx.fillRect(q.sx - rr, q.sy - rr, rr * 2, rr * 2);
        }
        ctx.restore();
      }
      // the patrols' light bars, flashing red and blue
      if (patrols.length) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const flip = Math.floor(now / 160) % 2;
        for (const p of patrols) {
          if (p.leaving) continue;
          const q = toScreen(cam, p.x, p.z, 1.75), rx = Math.cos(cam.yaw) * 0.45 * cam.scale, rr = (night ? 2.2 : 1.3) * cam.scale;
          for (const [side, col] of [[-1, flip ? 'rgba(255,26,60,' : 'rgba(26,107,255,'], [1, flip ? 'rgba(26,107,255,' : 'rgba(255,26,60,']] as const) {
            const gx = q.sx + side * rx, gr = ctx.createRadialGradient(gx, q.sy, 0, gx, q.sy, rr);
            gr.addColorStop(0, col + '0.9)'); gr.addColorStop(1, col + '0)');
            ctx.fillStyle = gr; ctx.fillRect(gx - rr, q.sy - rr, rr * 2, rr * 2);
          }
        }
        ctx.restore();
      }
      siren.set(patrols.filter((p) => !p.leaving).reduce((m, p) => Math.min(m, Math.hypot(p.x - me.x, p.z - me.z)), Infinity));
      // what the people near you are doing: a tag over each of the nearest few (vendors call out when you're close)
      if (cam.scale >= 9 && !me.car && !inRide) {
        const near = walkers.map((w) => ({ w, d: Math.hypot(w.x - me.x, w.z - me.z) })).filter((p) => p.d < 14).sort((p, q) => p.d - q.d).slice(0, 4);
        ctx.font = `600 ${Math.round(Math.max(10, Math.min(13, cam.scale * 0.7)))}px "Share Tech Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const { w, d } of near) {
          const text = w.role === 'vendor' && d < 4 ? `“${CALLS[Math.floor((now / 4000 + w.t0) % CALLS.length)]}”` : w.label;
          const q = toScreen(cam, w.x, w.z, w.unit ? 4.3 : 3.75), tw = ctx.measureText(text).width + 12, th = 18;
          ctx.globalAlpha = Math.max(0, Math.min(1, (14 - d) / 4));
          ctx.fillStyle = 'rgba(6,9,14,0.82)'; ctx.fillRect(q.sx - tw / 2, q.sy - th / 2, tw, th);
          ctx.fillStyle = w.role === 'warden' ? '#FF2BD6' : w.role === 'sweeper' ? '#FF9A3D' : w.role === 'vendor' ? '#3DFF9A' : '#00F0FF';
          ctx.fillRect(q.sx - tw / 2, q.sy - th / 2, 2, th);
          ctx.fillStyle = '#E8F7FF'; ctx.fillText(text, q.sx + 1, q.sy + 1);
          ctx.globalAlpha = 1;
        }
      }
      // the job's target: a bouncing marker
      const tgt = ride && ride.phase !== 'leaving' ? (ride.phase === 'riding' ? ride.dest : ride) : !job ? storyTarget : job.type === 'delivery' ? (job.carrying ? job.drop : job.pick) : job.type === 'danfo' ? job.stops[job.at] : job.thief;
      if (tgt) {
        const { sx, sy } = toScreen(cam, tgt.x, tgt.z, 4 + Math.sin(now / 200));
        ctx.fillStyle = '#F2C94C'; ctx.beginPath(); ctx.moveTo(sx, sy + 10); ctx.lineTo(sx - 9, sy - 6); ctx.lineTo(sx + 9, sy - 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
      }
      // the player's marker, as in the poster
      if (!me.car && !inRide) {
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
        setRide(rideStatus());
        const chasers = patrols.filter((p) => !p.leaving);
        const nearCop = chasers.reduce((m, p) => Math.min(m, Math.hypot(p.x - me.x, p.z - me.z)), Infinity);
        setCop({ stars: cops.stars, chasing: chasers.length, dist: nearCop === Infinity ? null : Math.round(nearCop / 10) * 10, clearIn: cops.clearIn ?? 0, state: cops.state, calm: cops.calm, hazards, pursuitLeft: cops.pursuitLeft ?? null });
        { const t = new Date(Date.now() + 3600_000); setClock(`${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`); }
        const rs = rideStatus();
        if (rs && !job) setHud({ kind: 'job', head: rs.kind === 'air' ? 'WYRD Air' : 'WYRD Ride', title: rs.phase === 'coming' ? 'Your ride is on its way' : rs.phase === 'waiting' ? 'Your ride is here — walk to it, press E' : 'Riding to', target: rs.dest, time: rs.phase === 'waiting' ? undefined : rs.seconds < 60 ? `${rs.seconds}s` : `${Math.round(rs.seconds / 60)} min` });
        else if (!job) setHud(beat && mission ? { kind: step === '' ? 'offer' : 'mission', head: mission.title, title: beat.objective, target: beat.place } : null);
        if (beat && mission && storyTarget && !job && !ride) {
          const near = Math.hypot(storyTarget.x - me.x, storyTarget.z - me.z) < beat.radius;
          if (!near && dismissed.current === tag) dismissed.current = null;
          if (near && beat.arriveMove) {
            if (beat.vehicle && !me.car) { if (dismissed.current !== tag) { say('Forty baskets won\'t fit on your head — bring a vehicle.'); dismissed.current = tag; } }
            else if (now - lastArrive > 8000) { lastArrive = now; void actRef.current(mission.id, beat.arriveMove); } // the server may say "not that fast": try again every few seconds
          } else if (near && !talkRef.current && dismissed.current !== tag && beat.choices.length) setTalk({ beat, mission: mission.id });
        }
        const blips: { x: number; z: number; c: string }[] = [];
        for (const w of walkers) if (w.unit) blips.push({ x: w.x, z: w.z, c: CY.magenta });
        if (ride && ride.phase !== 'leaving' && ride.phase !== 'riding') blips.push({ x: ride.x, z: ride.z, c: CY.yellow });
        for (const p of patrols) if (!p.leaving) blips.push({ x: p.x, z: p.z, c: Math.floor(now / 250) % 2 ? '#FF1A3C' : '#1A6BFF' });
        drawMini(mctx, me, cam, tiles, sea, tgt, now, blips);
        const near = world.nearestRoad(me.x, me.z, 60, KIND.residential);
        setWhere(near?.r.name ?? '');
        let area = '', ad = Infinity;
        for (const d of districtsXZ) { const q = Math.hypot(d.x - me.x, d.z - me.z); if (q < ad) { ad = q; area = d.name; } }
        setLive({ dist: tgt ? (d => (d < 1000 ? Math.round(d / 10) * 10 : Math.round(d / 100) * 100))(Math.hypot(tgt.x - me.x, tgt.z - me.z)) : null, kmh: me.car ? Math.round(Math.abs(me.car.v) * 3.6) : 0, area: ad < 4000 ? area : '', hp: me.car ? Math.round(me.car.hp) : 100 });
      }
    };
    raf = requestAnimationFrame(frame);
    // (debug: time [n] whole frames, waiting for the graphics to finish each one)
    (window as unknown as { __naija: Record<string, unknown> }).__naija.bench = (n = 20) => { const t0 = performance.now(); for (let i = 0; i < n; i++) { frame(performance.now()); cancelAnimationFrame(raf); ctx.getImageData(0, 0, 1, 1); } raf = requestAnimationFrame(frame); return (performance.now() - t0) / n; };
    return () => {
      alive = false; cancelAnimationFrame(raf); clearInterval(wire); clearInterval(tallyTimer); sendTallies(); radio.current?.off(); siren.off();
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

      {/* top right: the Lagos clock (tap: day/night), your naira, the police on you, WYRD speaking */}
      <View style={s.topRight} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setNight((v) => !v)} accessibilityLabel="Toggle day and night">
            <Panel accent={night ? CY.magenta : CY.yellow} cut={10} pad={0}>
              <View style={s.clockCard}>
                <Text style={s.clockTime}>{clock || '--:--'}</Text>
                <Text style={s.kickerDim}><Text style={{ color: night ? CY.magenta : CY.yellow }}>{night ? '◐' : '◉'}</Text>  {night ? 'NIGHT' : 'DAY'} · LAGOS</Text>
              </View>
            </Panel>
          </Pressable>
          <Panel accent={CY.green} cut={10} pad={0}>
            <View style={s.walletCard}>
              <Text style={s.kickerDim}>NAIRA</Text>
              <Text style={s.walletAmount}><Text style={{ color: CY.green }}>₦</Text>{wallet == null ? '——' : Math.round(wallet).toLocaleString('en-NG')}</Text>
            </View>
          </Panel>
        </View>
        {cop.stars > 0 || cop.chasing ? React.createElement('div', { className: cop.chasing ? 'cy-siren' : '', style: { alignSelf: 'flex-end' } },
          <Pressable onPress={() => setPhone(true)} accessibilityLabel="Wanted: open the phone to make a call">
            <Panel accent={CY.red} edge="rgba(255,0,60,0.6)" cut={10} pad={0} fill="rgba(30,4,10,0.9)">
              <View style={s.wantedCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={[s.kicker, { color: CY.red }]}>WANTED</Text>
                  <Text style={s.wantedStars}>{'★'.repeat(cop.stars)}<Text style={{ color: 'rgba(255,255,255,0.18)' }}>{'★'.repeat(Math.max(0, 5 - cop.stars))}</Text></Text>
                </View>
                <Text style={s.wantedLine}>{cop.state === 'searching' ? '● THEY\'VE LOST SIGHT OF YOU' : cop.state === 'complying' ? '● COMPLYING · PULL OVER WHEN SAFE' : cop.chasing ? `● POLICE ON YOU${cop.dist != null ? ` · ${cop.dist} M` : ''}` : 'LOGGED BY WYRD\'S UNITS'}</Text>
                <Text style={s.wantedSub}>{cop.chasing
                  ? `[H] COMPLY · LESS TO PAY${cop.pursuitLeft != null ? ` · BREAKS OFF IN ${cop.pursuitLeft}S` : ''} · [P] CALL`
                  : `CLEARS IN ${Math.floor(cop.clearIn / 60)}:${String(cop.clearIn % 60).padStart(2, '0')} · [P] MAKE A CALL`}</Text>
              </View>
            </Panel>
          </Pressable>) : null}
        {wyrd && !wyrdOpen ? <View style={s.wyrd}><Text style={s.wyrdWho}>WYRD://CITY.MIND{wyrdLive ? <Text style={{ color: CY.red }}>  ● LIVE{online > 1 ? `  ·  ${online} ON THE STREETS` : ''}</Text> : null}</Text><Text style={s.wyrdText}>{wyrd.replace(/^WYRD city bulletin: /, '')}</Text></View> : null}
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

      {perf ? (
        <View style={s.perf} pointerEvents="none">
          <Text style={s.perfText}>{perf.fps} FPS  ·  GAME {perf.ms} MS/FRAME (WORST {perf.worst})  ·  {perf.res}</Text>
          <Text style={[s.perfText, perf.software && { color: CY.red }]}>{perf.software ? 'SOFTWARE DRAWING — turn on hardware acceleration in Chrome settings' : `GPU: ${perf.gpu.slice(0, 60)}`}</Text>
        </View>
      ) : null}
      {/* the radio: what's on, with a level meter */}
      {onAir ? (
        <Panel style={s.radio} accent={CY.green} edge="rgba(61,255,154,0.45)" cut={10} pad={0}>
          <View style={s.radioRow}>
            <View style={s.eq}>{[0, 1, 2, 3, 4, 5].map((i) => React.createElement('div', { key: i, className: 'cy-eq', style: { width: 3, background: CY.green, animationDelay: `${i * 0.13}s` } }))}</View>
            <View>
              <Text style={s.radioFreq}>{onAir.freq} FM  <Text style={{ color: CY.text }}>{onAir.name}</Text></Text>
              <Text style={s.kickerDim}>{tuning ? 'TUNING…' : `${onAir.kind === 'live' ? '● LIVE  ·  ' : ''}${onAir.tag.toUpperCase()}`}  ·  [Q] NEXT</Text>
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
            <View style={s.hpTrack}><View style={[s.hpFill, { width: `${live.hp}%`, backgroundColor: live.hp > 60 ? CY.green : live.hp > 25 ? CY.yellow : CY.red }]} /></View>
            <Text style={[s.kickerDim, live.hp <= 25 && { color: CY.red }]}>{live.hp <= 0 ? 'WRECKED' : `CAR ${live.hp}%`}</Text>
          </View>
        </Panel>
      ) : null}

      {/* controls, bottom right: each with its key */}
      <View style={s.controls}>
        <Text style={s.hintPill}>{cop.chasing ? (cop.hazards ? 'COMPLYING · SLOW DOWN · THE PATROL WILL STOP YOU WHERE IT\'S SAFE' : 'POLICE ON YOU · H HAZARDS TO COMPLY (LESS TO PAY) · OR LOSE THEM · P CALL SOMEONE') : rideStatus?.phase === 'riding' ? 'RIDING · P PHONE (SKIP / ×4) · SCROLL ZOOM · DRAG TURN' : rideStatus?.phase === 'waiting' ? 'WALK TO YOUR RIDE · E GET IN' : driving ? 'W/S DRIVE · A/D STEER · E GET OUT' : 'WASD WALK · SHIFT RUN · E TAKE A CAR · P PHONE · SCROLL ZOOM · DRAG TURN'}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([
            ['P', 'PHONE', () => setPhone((v) => !v), CY.yellow],
            ['TAB', 'MAP', () => setCityMap(true), CY.cyan],
            ['T', 'WYRD', () => setWyrdOpen((v) => !v), CY.magenta],
            ['M', 'JOBS', () => setBoard(true), CY.cyan],
            ['Q', onAir ? onAir.freq : 'RADIO', () => tuneRadio(), CY.green],
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
        </View>
        <View style={s.minorRow}>
          <Pressable onPress={() => { setStanding('standing'); api.cityStory().then(setStory).catch(() => {}); }}><Text style={s.minor}><Text style={s.minorKey}>R</Text> STANDING</Text></Pressable>
          <Pressable onPress={() => setNight((v) => !v)}><Text style={s.minor}><Text style={s.minorKey}>N</Text> {night ? 'DAY' : 'NIGHT'}</Text></Pressable>
          <Pressable onPress={onExit}><Text style={[s.minor, { color: CY.red }]}>EXIT</Text></Pressable>
        </View>
      </View>

      {phone ? (
        <Phone wallet={wallet} me={mapData.current.me} ride={rideStatus}
          onOrder={(f, k, lift) => rideCtl.current.order(f, k, lift)} onCancel={() => rideCtl.current.cancel()} onSkip={() => rideCtl.current.skip()} onFast={() => rideCtl.current.fast()}
          stations={STATIONS} onAir={onAir} onTune={tuneTo} live={wyrdLines}
          background={story?.background} cop={cop} onCall={(id) => callRef.current(id)}
          onCalm={(on) => { api.policeSettings(on).then((s) => setCop({ ...cop, calm: s.calm })).catch(() => {}); }}
          teach={training?.optIn ?? false} onTeach={answerTraining}
          onMap={() => { setPhone(false); setCityMap(true); }} onWyrd={() => { setPhone(false); setWyrdOpen(true); }} onClose={() => setPhone(false)} />
      ) : null}
      {toast ? <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View> : null}
      {wyrdOpen ? <WyrdPanel lines={wyrdLines} onLine={addWyrd} night={night} situation={() => situationRef.current()} onClose={() => setWyrdOpen(false)} /> : null}
      {training && !training.asked && hero && !loading ? (
        <View style={s.consentWrap} pointerEvents="box-none">
          <Panel accent={CY.magenta} edge="rgba(255,43,214,0.5)" cut={14} pad={0}>
            <View style={s.consent}>
              <Text style={s.wyrdWho}>WYRD · THE CITY MIND</Text>
              <Text style={s.consentText}>I learn from this city as it's lived in. May I learn from your play — what you say to me, the missions you take, and what the city sees around you (traffic, rides, crashes, police stops)?</Text>
              <Text style={s.consentSmall}>It helps train WYRD. What the city sees is kept only as anonymous counts per street and hour, and may show on the city's live feed by street ("Crash on Ikorodu Road") — never you, never where you are. Personal details are stripped from anything you say, and nothing is kept past 180 days. Change your mind any time: Phone → Settings.</Text>
              <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <Pressable onPress={() => answerTraining(false)} style={s.consentBtn}><Text style={s.consentBtnText}>NOT NOW</Text></Pressable>
                <Pressable onPress={() => answerTraining(true)} style={[s.consentBtn, s.consentYes]}><Text style={[s.consentBtnText, { color: CY.ink }]}>YES, LEARN FROM MY PLAY</Text></Pressable>
              </View>
            </View>
          </Panel>
        </View>
      ) : null}
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
function drawMini(m: CanvasRenderingContext2D, me: { x: number; z: number; car: { rot: number } | null; face: number }, cam: Cam, tiles: import('./tiles').Tile[], sea: { p: Float32Array; island: boolean }[], tgt: { x: number; z: number } | null, now: number, blips: { x: number; z: number; c: string }[] = []) {
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
  // the patrols (flashing), WYRD's traffic units, your ride -- kept on the rim when they're further off
  for (const b of blips) {
    let [bx, by] = P(b.x, b.z);
    const d = Math.hypot(bx - R, by - R);
    if (d > R - 12) { bx = R + ((bx - R) / d) * (R - 12); by = R + ((by - R) / d) * (R - 12); }
    m.fillStyle = b.c; m.strokeStyle = '#05070B'; m.lineWidth = 3;
    m.beginPath(); m.arc(bx, by, 9, 0, Math.PI * 2); m.fill(); m.stroke();
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
  topRight: { position: 'absolute', top: 16, right: 16, alignItems: 'flex-end', gap: 8, maxWidth: 360 },
  clockCard: { paddingVertical: 6, paddingHorizontal: 14, alignItems: 'flex-start', gap: 0 },
  clockTime: { fontFamily: MONO, fontSize: 24, color: CY.text, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  wantedCard: { paddingVertical: 8, paddingHorizontal: 14, gap: 2, minWidth: 250 },
  wantedStars: { fontSize: 22, color: '#FF2A4A', letterSpacing: 2, textShadowColor: 'rgba(255,0,60,0.7)', textShadowRadius: 8 },
  wantedLine: { fontFamily: MONO, fontSize: 12.5, color: CY.text, letterSpacing: 1 },
  wantedSub: { fontFamily: HEAD, fontSize: 11.5, fontWeight: '700', color: 'rgba(255,170,185,0.85)', letterSpacing: 1.2 },
  consentWrap: { position: 'absolute', left: 0, right: 0, bottom: 150, alignItems: 'center' },
  consent: { width: 520, maxWidth: '92%', padding: 16, gap: 6 } as object,
  consentText: { fontFamily: HEAD, fontSize: 16, fontWeight: '600', color: CY.text, lineHeight: 21 },
  consentSmall: { fontFamily: HEAD, fontSize: 12.5, color: CY.muted, lineHeight: 17 },
  consentBtn: { borderWidth: 1, borderColor: CY.line, paddingHorizontal: 14, paddingVertical: 8 },
  consentYes: { backgroundColor: CY.magenta, borderColor: CY.magenta },
  consentBtnText: { fontFamily: HEAD, fontSize: 13, fontWeight: '700', letterSpacing: 1.4, color: CY.text },
  hintPill: { fontFamily: MONO, fontSize: 12, color: CY.text, letterSpacing: 0.6, backgroundColor: 'rgba(5,7,11,0.78)', paddingHorizontal: 12, paddingVertical: 6, borderLeftWidth: 2, borderLeftColor: CY.cyan },
  minorRow: { flexDirection: 'row', gap: 16, paddingRight: 4 },
  minor: { fontFamily: HEAD, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.4, color: CY.muted, textShadowColor: '#000', textShadowRadius: 4 },
  minorKey: { fontFamily: MONO, color: CY.cyan },
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
  hpTrack: { width: 70, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 4 },
  hpFill: { height: 4 },
  perf: { position: 'absolute', top: 70, left: 14, backgroundColor: 'rgba(5,8,15,0.8)', paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  perfText: { fontFamily: MONO, fontSize: 11, color: CY.green, letterSpacing: 0.5 },
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
  toast: { position: 'absolute', top: 104, alignSelf: 'center', maxWidth: 520, backgroundColor: CY.glass2, borderLeftWidth: 3, borderLeftColor: CY.yellow, paddingHorizontal: 16, paddingVertical: 10 },
  toastText: { fontFamily: HEAD, fontSize: 15, fontWeight: '600', color: CY.text, textAlign: 'center', letterSpacing: 0.3 },
  wyrd: { width: 320, backgroundColor: 'rgba(14,6,26,0.92)', borderLeftWidth: 3, borderLeftColor: CY.magenta, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
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