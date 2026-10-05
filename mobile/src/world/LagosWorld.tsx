import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Display, Mono } from '../components/ui';
import { colors } from '../theme';
import { useBrainMap, useMind } from '../api/hooks';
import { LITE } from '../util/perf';
import { getSound } from '../util/sound';
import { animatePerson, makePerson, randomBuild, type Person } from './people';
import { makeDanfo, makeKeke, makeOkada } from './vehicles';
import { facadeUniforms } from './facade';
import { dirAt, GROUND_HEX, KIND, OsmCity, pointAt, roadY, type Road } from './osmCity';
import { makeAuthority, type Weather } from './authority';
import { loadCharacter, makeCastHero } from './cast';
import { DISTRICTS, makeLandmarks } from './landmarks';
import { makeHoverCar } from './hovercar';
import { along, Router, type Path, type Stop } from './routes';
import { PREFABS, place } from './props';
import { makeHoloTalk } from './holoTalk';
import { api } from '../api/client';
import type { CityCharter, CityDecree, CityLiveDesign, CityMission } from '../api/types';
import { DesignStudio } from './DesignStudio';
import { CharacterCreator } from './CharacterCreator';
import { Compass, KeyCap, Minimap, newFeed, Panel, PauseMenu, StandingBar, VehicleGauges } from './Hud';
import type { CharacterLook } from '../api/types';
import { AutoTier, loadChoice, saveChoice, startTier, TIERS, type GfxChoice, type Tier } from './quality';

/**
 * NAIJA 2099 · OPEN WORLD: the real mainland Lagos, from OpenStreetMap, raised into a neon future --
 * megatowers, holograms, hover-danfos -- starting at Ojuelegba junction under Western Avenue, run by
 * WYRD's real mind. Sci-fi, rooted in Lagos: its streets, its danfo yellow, its Adire, its voices.
 *
 *  - The city: every real street, bridge and building footprint, streamed in tiles round you
 *    (osmCity.ts), with light baked into the geometry so it looks shaded on any device.
 *  - Light: ACES tone mapping, an environment map for sky light and reflections, the sun at Lagos'
 *    real hour; a sun shadow over ~60 m round you on mid and high; bloom on high.
 *  - Quality: AUTO picks a tier for the device and steps down if frames run slow (quality.ts).
 *  - Traffic and people follow the real road network; only what's near you is simulated.
 *  - Physics: you accelerate, jump, slide along real walls; vehicles are solid and brake for you.
 *  - WYRD: its mood tints the sky, its real brain crowns a tower near the junction, and every real
 *    thought it fires sends a cobalt beam across the city.
 *  - WYRD is the Authority (server: city endpoint). Players reach it by speaking to it anywhere (T),
 *    petitioning at its tower, answering its drone; the world reports to it (a mission done, a
 *    player blocking traffic). It answers and governs: missions from the board it writes itself,
 *    weather, traffic, its drone, city-wide broadcasts, a danfo sent to you, your standing.
 *  - WYRD co-designs the game with its owner (DesignStudio). Approved proposals are applied here
 *    live: how busy the streets are, what locals say, city events at set Lagos hours, new missions.
 *
 * Map data © OpenStreetMap contributors (ODbL).
 */

// mood -> sky tint (by day): the light of the city follows how WYRD feels
const MOOD_SKY: [RegExp, number, number][] = [
  [/curious|playful|excited|eager/, 0x7fb8ef, 0xf6e2c3],
  [/reflective|pensive|calm|quiet/, 0x9f97cf, 0xf0dcef],
  [/uncertain|confused|anxious|uneasy/, 0x9aa4b0, 0xdfe2e5],
  [/assured|confident|self-assured|focused|determined/, 0x6fa8e6, 0xffe0a8],
  [/sad|tired|low/, 0x8693a1, 0xd2d8de],
];
function skyFor(mood?: string): [number, number] {
  const m = (mood ?? '').toLowerCase();
  for (const [re, top, bottom] of MOOD_SKY) if (re.test(m)) return [top, bottom];
  return [0x78b4ee, 0xf7ead2];
}

/** Lagos is UTC+1, all year. Hours as a fraction, 0..24. */
const lagosHour = () => {
  // a test can pin the hour (window.__lagosHour) to see the city by day or by night
  const pinned = (globalThis as { __lagosHour?: number }).__lagosHour;
  if (typeof pinned === 'number') return pinned;
  const d = new Date();
  return (d.getUTCHours() + 1 + d.getUTCMinutes() / 60) % 24;
};

const COBALT = 0x2a46ff;
const SIM = 260; // traffic and walkers further than this from you are moved back near you
const GFX_NEXT: Record<GfxChoice, GfxChoice> = { auto: 'low', low: 'mid', mid: 'high', high: 'auto' };

const LOOK_KEY = 'naija2099.look';
const localLook = (): CharacterLook | null => { try { const s = localStorage.getItem(LOOK_KEY); return s ? (JSON.parse(s) as CharacterLook) : null; } catch { return null; } };
const keepLook = (l: CharacterLook) => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(l)); } catch { /* no storage */ } };

/**
 * NAIJA 2099's front door: a player makes their character first (the creator), then enters the city.
 * Their character is saved on the server (the same on every device); a copy is kept on this device
 * so the game still works offline or before sign-in.
 */
export function LagosWorld({ onExit }: { onExit: () => void }) {
  const [look, setLook] = useState<CharacterLook | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.myCharacter().then((l) => setLook(l ?? localLook())).catch(() => setLook(localLook()));
  }, []);
  const save = (l: CharacterLook) => {
    setSaving(true); setError(null);
    keepLook(l);
    api.saveCharacter(l)
      .then((saved) => setLook(saved))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : '';
        // a rule the server checks (the name): say so; otherwise (offline, signed out) enter anyway
        if (/name|neon|body/i.test(msg)) setError(msg); else setLook(l);
      })
      .finally(() => setSaving(false));
  };
  if (look === undefined) return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0f14' }]} />;
  if (look === null) return <CharacterCreator onDone={save} saving={saving} error={error} />;
  return <LagosWorldGame onExit={onExit} look={look} onLook={(l) => { keepLook(l); setLook(l); api.saveCharacter(l).catch(() => {}); }} />;
}

function LagosWorldGame({ onExit, look, onLook }: { onExit: () => void; look: CharacterLook; onLook: (l: CharacterLook) => void }) {
  const [editing, setEditing] = useState(false);
  // the HUD: its live feed (written by the game each frame), the pause menu, the controls card, weather
  const feed = useRef(newFeed());
  const [menu, setMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [weatherNow, setWeatherNow] = useState('clear');
  // health and lives: what the HUD shows (the game owns the real numbers)
  const [vitals, setVitals] = useState({ hp: 100, lives: 3 });
  const [hurtFlash, setHurtFlash] = useState(false);
  const [down, setDown] = useState<string | null>(null);
  // the intro: letterboxed, a caption over the city, skippable
  const [intro, setIntro] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
  // a phone on its side is short: the HUD corners shrink so the city stays in view
  const { height: screenH } = useWindowDimensions();
  const compact = screenH < 500;
  const shrink = compact ? { transform: [{ scale: 0.7 }] } : null;
  useEffect(() => { const t = setTimeout(() => setShowHelp(false), 25000); return () => clearTimeout(t); }, []);
  const host = useRef<View>(null);
  const { mind } = useMind();
  const brain = useBrainMap();
  const [thought, setThought] = useState<string | null>(null);
  const [bird, setBird] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [speech, setSpeech] = useState<string | null>(null);
  const [street, setStreet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gfx, setGfx] = useState<GfxChoice>(loadChoice);
  const [tierNow, setTierNow] = useState<Tier>(() => startTier(loadChoice()));
  // the Authority
  const [authLine, setAuthLine] = useState<string | null>(null);
  const [authNote, setAuthNote] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [standing, setStanding] = useState<{ standing: number; rank: string; missionsDone: number } | null>(null);
  const [mission, setMission] = useState<CityMission | null>(null);
  const [missionDist, setMissionDist] = useState<number | null>(null);
  const [ask, setAsk] = useState<null | 'speak' | 'petition' | 'drone'>(null);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [board, setBoard] = useState<CityCharter | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  // consent: may WYRD learn from this player's play? asked once, changeable in the Authority panel
  const [training, setTraining] = useState<{ optIn: boolean; asked: boolean } | null>(null);
  const answerTraining = (optIn: boolean) => {
    setTraining({ optIn, asked: true });
    api.citySetTraining(optIn).catch(() => {});
  };
  const [canDesign, setCanDesign] = useState(false);
  useEffect(() => { api.cityCanDesign().then(setCanDesign).catch(() => setCanDesign(false)); }, []);
  const ctl = useRef<{ skipIntro: () => void; act: () => void; jump: () => void; setLook: (l: CharacterLook) => void; address: (channel: 'speak' | 'petition' | 'drone' | 'event', text: string, extra?: object) => void; reloadDesign: () => void; findMe: () => void; callCar: () => void } | null>(null);
  const [flying, setFlying] = useState(false);
  const live = useRef({ mood: mind?.mood, brain, lastFiring: '', bird: false, gfx, typing: false, look });
  live.current.look = look;
  live.current.typing = intro || ask !== null || boardOpen || studioOpen || editing || menu || (training !== null && !training.asked);
  live.current.mood = mind?.mood;
  live.current.brain = brain;
  live.current.bird = bird;
  live.current.gfx = gfx;

  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    let tier: Tier = startTier(live.current.gfx);
    let auto: AutoTier | null = live.current.gfx === 'auto' ? new AutoTier(tier) : null;
    const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // refreshed every few frames, not every frame
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
    renderer.domElement.tabIndex = 0;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.4, 16000);
    // sky light and reflections: one environment map, a single texture lookup per pixel
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // ---- sky: gradient from WYRD's mood, the sun at Lagos' real hour, stars at night ----
    const skyU = {
      top: { value: new THREE.Color(0x78b4ee) }, bottom: { value: new THREE.Color(0xf7ead2) },
      sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) }, night: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top, bottom, sunDir; uniform float night; varying vec3 p;
        float hash(vec3 q){ return fract(sin(dot(q, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          float h = clamp(p.y * 1.25 + 0.15, 0.0, 1.0);
          vec3 day = mix(bottom, top, pow(h, 0.8));
          vec3 dusk = mix(vec3(0.98,0.55,0.32), vec3(0.32,0.26,0.48), h);
          vec3 dark = mix(vec3(0.05,0.07,0.13), vec3(0.01,0.015,0.04), h);
          float sunUp = clamp(sunDir.y * 3.0 + 0.3, 0.0, 1.0);
          vec3 col = mix(dark, mix(dusk, day, clamp(sunDir.y * 4.0, 0.0, 1.0)), sunUp);
          float d = max(dot(p, normalize(sunDir)), 0.0);
          col += vec3(1.0,0.85,0.6) * (pow(d, 600.0) * 8.0 + pow(d, 12.0) * 0.25) * sunUp; // the sun and its haze
          vec3 cell = floor(p * 260.0);
          col += vec3(0.9) * step(0.9965, hash(cell)) * night * step(0.05, p.y); // stars
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
    sky.frustumCulled = false;
    scene.add(sky);
    scene.fog = new THREE.Fog(0xf2e2c4, 60, 700); // the warm, dusty haze of a Lagos afternoon

    const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7a66, 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);

    // ---- ground (follows you) and the real city ----
    // the ground: Lagos laterite -- reddish dust that varies, grey concrete slabs, darker trodden earth,
    // and puddles that catch the sky and the neon (all in the shader: one plane, no textures)
    const groundMat = new THREE.MeshStandardMaterial({ color: GROUND_HEX, roughness: 1 });
    groundMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGw;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vGw;
          float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
          float gPuddle = 0.0;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 p = vGw.xz;
            float big = gn(p * 0.035), mid = gn(p * 0.21), fine = gn(p * 1.7);
            vec3 c = diffuseColor.rgb * (0.82 + 0.3 * big) * (0.92 + 0.16 * fine);
            c = mix(c, c * vec3(1.12, 0.9, 0.78), smoothstep(0.55, 0.8, mid) * 0.6); // redder laterite
            // grey concrete slabs in places, with joints
            float slab = step(0.66, gn(floor(p / 4.0) * 0.37 + 3.1));
            float joint = step(0.94, max(fract(p.x / 4.0), fract(p.y / 4.0)));
            c = mix(c, vec3(0.22, 0.21, 0.2) * (0.9 + 0.2 * fine) * (1.0 - joint * 0.4), slab * 0.85);
            // trodden earth: darker, smoother
            c *= 1.0 - smoothstep(0.62, 0.85, gn(p * 0.09 + 7.0)) * 0.25;
            // puddles: dark, still water
            gPuddle = smoothstep(0.74, 0.8, gn(p * 0.12 + 13.0)) * (1.0 - slab);
            c = mix(c, vec3(0.05, 0.06, 0.07), gPuddle * 0.85);
            diffuseColor.rgb = c;
          }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.05, gPuddle);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.6, gPuddle);');
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const city = new OsmCity(scene, TIERS[tier].shadows);
    let landmarks: ReturnType<typeof makeLandmarks> | null = null;
    void city.ready.then(() => { if (city.index) landmarks = makeLandmarks(scene, city.index.origin); });
    // ---- bird's-eye is a map: pan and zoom across Lagos; a beacon marks TEN ----
    const mapTarget = new THREE.Vector3();
    const flyTo = new THREE.Vector3();
    let follow = true, flying = false;
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, fog: false });
    const marker = new THREE.Group();
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true).translate(0, 0.5, 0);
    marker.add(new THREE.Mesh(beamGeo, markerMat), new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), markerMat));
    marker.visible = false;
    scene.add(marker);
    // district labels over the map (clickable: the camera flies there)
    const labels = DISTRICTS.map((d) => {
      const div = document.createElement('div');
      div.textContent = d.name.toUpperCase();
      div.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-9999px,0);padding:3px 8px;background:rgba(22,23,26,0.82);color:#8ea0ff;border-left:2px solid #2a46ff;font:10px/1.3 "Share Tech Mono",monospace;letter-spacing:1.6px;white-space:nowrap;cursor:pointer;user-select:none';
      div.onclick = () => { if (!landmarks) return; const p = landmarks.toWorld(d.at); flyTo.set(p.x, 0, p.y); flying = true; follow = false; };
      el.appendChild(div);
      return { d, div };
    });
    const proj = new THREE.Vector3();
    city.far = TIERS[tier].far;

    // ---- WYRD's tower, crowned with its real brain (placed on open ground near the junction) ----
    const rnd = (() => { let s = 20261005; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const c = new THREE.Color();
    const plaza = { x: 0, z: 0, r: 6, placed: false };
    const towerH = 38;
    const towerGroup = new THREE.Group();
    towerGroup.visible = false;
    scene.add(towerGroup);
    const steel = new THREE.MeshStandardMaterial({ color: 0x1d1f24, metalness: 0.85, roughness: 0.25 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.0, towerH, 8), steel);
    tower.position.y = towerH / 2;
    tower.castShadow = true;
    towerGroup.add(tower);
    const ringMat = new THREE.MeshBasicMaterial({ color: COBALT, transparent: true, opacity: 0.45 });
    const plazaRing = new THREE.Mesh(new THREE.RingGeometry(plaza.r - 0.6, plaza.r, 48), ringMat);
    plazaRing.rotation.x = -Math.PI / 2;
    plazaRing.position.y = 0.06;
    towerGroup.add(plazaRing);
    const MAXN = 160;
    const neuronGeo = new THREE.BufferGeometry();
    const neuronPos = new Float32Array(MAXN * 3), neuronCol = new Float32Array(MAXN * 3);
    neuronGeo.setAttribute('position', new THREE.BufferAttribute(neuronPos, 3));
    neuronGeo.setAttribute('color', new THREE.BufferAttribute(neuronCol, 3));
    const neurons = new THREE.Points(neuronGeo, new THREE.PointsMaterial({ size: 1.0, vertexColors: true, sizeAttenuation: true, toneMapped: false }));
    neurons.position.y = towerH + 7;
    towerGroup.add(neurons);
    const ids: string[] = [];
    const layoutBrain = () => {
      const ns = live.current.brain?.neurons ?? [];
      ids.length = 0;
      for (let i = 0; i < MAXN; i++) {
        const n = ns[i];
        if (!n) { neuronPos.set([0, -999, 0], i * 3); continue; }
        ids.push(n.id);
        const golden = i * 2.399963, rr = 2 + 5.5 * Math.sqrt((i + 0.5) / Math.max(1, ns.length));
        const y = (((i * 37) % 100) / 100) * 2 - 1;
        neuronPos.set([Math.cos(golden) * rr, y * 4, Math.sin(golden) * rr * 0.8], i * 3);
        c.setHex(0x22242a);
        neuronCol.set([c.r, c.g, c.b], i * 3);
      }
      neuronGeo.attributes.position.needsUpdate = true;
      neuronGeo.attributes.color.needsUpdate = true;
    };
    layoutBrain();
    const beamMat = new THREE.MeshBasicMaterial({ color: COBALT, transparent: true, opacity: 0, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 8, 1, true), beamMat);
    scene.add(beam);
    let beamAt = -1e9;
    let beamDir = new THREE.Vector3(1, 0, 0);
    const pulseNeurons = new Set<number>();
    // open ground near the junction: off every road, clear of buildings for the tower's ring
    const placeTower = () => {
      for (let r = 30; r < 320; r += 10) for (let a = 0; a < Math.PI * 2; a += 0.35) {
        const x = (startAt?.x ?? 0) + Math.cos(a) * r, z = (startAt?.z ?? 0) + Math.sin(a) * r;
        let clear = true;
        for (let k = 0; k < 8 && clear; k++) if (city.solidAt(x + Math.cos(k) * (plaza.r + 1), 0.5, z + Math.sin(k) * (plaza.r + 1)) || city.solidAt(x, 0.5, z)) clear = false;
        if (!clear) continue;
        const nr = city.nearestRoad(x, z);
        if (nr && nr.d < nr.road.width / 2 + plaza.r + 1) continue;
        Object.assign(plaza, { x, z, placed: true });
        towerGroup.position.set(x, 0, z);
        towerGroup.visible = true;
        return;
      }
      plaza.placed = true; // nowhere open: no tower
    };

    // ---- traffic: danfos, okadas and kekes on the real roads ----
    type Vehicle = { route?: Path | null; rs?: number; dwell?: number; atStop?: Stop | null; mesh: THREE.Group; wheels: THREE.Group[]; road: Road | null; s: number; dir: number; speed: number; cruise: number; len: number; width: number; okada: boolean; honkAt: number; pos: THREE.Vector3; fwd: THREE.Vector3; heading: number };
    const vehicles: Vehicle[] = [];
    const maxV = Math.round(TIERS[LITE ? 'low' : 'high'].vehicles * (LITE ? 1.2 : 1.4));
    for (let i = 0; i < maxV; i++) {
      const okada = i % 3 === 0, keke = !okada && i % 4 === 1;
      const built = okada ? makeOkada(!LITE) : keke ? makeKeke(!LITE) : makeDanfo(!LITE);
      const cruise = okada ? 10 + rnd() * 4 : keke ? 5 + rnd() * 2 : 7 + rnd() * 4;
      built.group.visible = false;
      for (const wh of built.wheels) wh.visible = false; // NAIJA 2099: hover-danfos ride on light
      scene.add(built.group);
      vehicles.push({ mesh: built.group, wheels: built.wheels, road: null, s: 0, dir: 1, speed: cruise, cruise, len: built.length, width: built.width, okada: okada || keke, honkAt: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), heading: 0 });
    }
    // the modelled danfo (generated from concept art) replaces the built one once it has loaded
    loadCharacter('world/vehicles/danfo.glb').then((gltf) => {
      if (disposed) return;
      const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3());
      const k = 4.7 / Math.max(size.x, size.z); // ~4.7 m long
      for (const v of vehicles) {
        if (v.okada) continue;
        const body = v.mesh.children[0];
        if (body) body.visible = false;
        const model = gltf.scene.clone(true);
        model.scale.setScalar(k);
        // its length along the bus's +x, nose first (the model was built facing the other way)
        model.rotation.y = (size.z > size.x ? Math.PI / 2 : 0) + Math.PI;
        model.position.y = -box.min.y * k + 0.15;
        model.traverse((o) => {
          const mm = o as THREE.Mesh;
          if (!mm.isMesh) return;
          mm.castShadow = TIERS[tier].shadows;
          const map = (mm.material as THREE.MeshStandardMaterial).map;
          if (map) map.anisotropy = renderer.capabilities.getMaxAnisotropy(); // crisp at an angle
        });
        // the conductor stands in the open sliding door, a little behind the middle on the kerb side
        const cond = v.mesh.children[1];
        if (cond) cond.position.set(-0.35, 0.55, 0.98);
        model.userData.detail = true;
        v.mesh.add(model);
      }
    }).catch((e) => console.warn('[world] danfo model failed; keeping the built one', e));
    // ---- getting around: stop-to-stop danfo routes and the mission GPS, on the real streets ----
    const busRouter = new Router(), walkRouter = new Router();
    let realStops: Stop[] = [], stopsMade = false, nextRouting = 0;
    fetch('world/v1/stops.json').then((r) => r.json()).then((j) => { realStops = (j as Stop[]).map((x) => ({ x: x.x, z: x.z, name: x.name ?? 'Bus stop' })); }).catch(() => {});
    const shelterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    let shelters: THREE.Mesh | null = null;
    const buildShelters = (stops: Stop[]) => {
      const geos: THREE.BufferGeometry[] = [];
      const shelter = [
        { g: new THREE.BoxGeometry(3.2, 0.12, 1.6).translate(0, 2.6, 0), color: 0x16171a },
        { g: new THREE.BoxGeometry(3.2, 0.06, 1.62).translate(0, 2.52, 0), color: 0xf2b705 as number },
        { g: new THREE.BoxGeometry(0.08, 2.6, 0.08).translate(-1.5, 1.3, -0.7), color: 0x8a8d92 },
        { g: new THREE.BoxGeometry(0.08, 2.6, 0.08).translate(1.5, 1.3, -0.7), color: 0x8a8d92 },
        { g: new THREE.BoxGeometry(3.0, 2.0, 0.04).translate(0, 1.3, -0.75), color: 0x2a3a48 },
        { g: new THREE.BoxGeometry(2.4, 0.1, 0.45).translate(0, 0.5, -0.45), color: 0x5a5d63 },
        { g: new THREE.BoxGeometry(0.9, 0.5, 0.05).translate(1.0, 2.25, 0.82), color: 0x00e5ff },
      ];
      for (const st of stops) {
        const nr = city.nearestRoad(st.x, st.z, (r) => r.kind <= KIND.residential);
        let yaw = 0, x = st.x, z = st.z;
        if (nr) { const p = pointAt(nr.road, nr.s), d = dirAt(nr.road, nr.s); const off = nr.road.width / 2 + 2.2; x = p.x - d.y * off; z = p.y + d.x * off; yaw = Math.atan2(-d.y, d.x) + Math.PI / 2; }
        for (const part of place(shelter.map((p) => ({ g: p.g, color: p.color })), x, 0, z, yaw)) geos.push(part);
      }
      if (!geos.length) return;
      if (shelters) { scene.remove(shelters); shelters.geometry.dispose(); }
      const merged = new THREE.BufferGeometry();
      const n = geos.reduce((a, g) => a + (g.index ? g.index.count : g.attributes.position.count), 0);
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
      let o = 0;
      for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; pos.set(g.attributes.position.array as Float32Array, o * 3); nrm.set(g.attributes.normal.array as Float32Array, o * 3); col.set(g.attributes.color.array as Float32Array, o * 3); o += g.attributes.position.count; }
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
      shelters = new THREE.Mesh(merged, shelterMat);
      shelters.castShadow = true;
      scene.add(shelters);
    };
    // a danfo's next leg: from where it is to a stop 300 m - 1.5 km away
    const nextLeg = (v: Vehicle) => {
      const stops = busRouter.stops;
      if (stops.length < 2) { v.route = null; return; }
      const far = stops.filter((st) => { const d = Math.hypot(st.x - v.pos.x, st.z - v.pos.z); return d > 300 && d < 1500; });
      const pickFrom = far.length ? far : stops;
      const target = pickFrom[Math.floor(rnd() * pickFrom.length)];
      v.route = busRouter.route(v.pos.x, v.pos.z, target.x, target.z);
      v.rs = 0; v.atStop = target; v.dwell = 0;
    };
    // the mission GPS: a gold line along the streets to the target, and on the minimap
    const gpsMat = new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
    let gpsLine: THREE.Mesh | null = null, gpsPath: Path | null = null;
    const drawGps = (path: Path | null) => {
      if (gpsLine) { scene.remove(gpsLine); gpsLine.geometry.dispose(); gpsLine = null; }
      gpsPath = path;
      if (!path) return;
      const pos: number[] = [];
      for (let i = 1; i < path.pts.length; i++) {
        const a = path.pts[i - 1], b = path.pts[i], d = b.clone().sub(a).normalize(), nx = -d.y * 0.45, nz = d.x * 0.45;
        pos.push(a.x + nx, 0.14, a.y + nz, b.x + nx, 0.14, b.y + nz, a.x - nx, 0.14, a.y - nz, a.x - nx, 0.14, a.y - nz, b.x + nx, 0.14, b.y + nz, b.x - nx, 0.14, b.y - nz);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      gpsLine = new THREE.Mesh(g, gpsMat);
      gpsLine.renderOrder = 3;
      scene.add(gpsLine);
    };
    // the on-screen waypoint: a diamond over the target with its distance, held at the edge when off-screen
    const wp = document.createElement('div');
    wp.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-9999px,0);pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:2px;font:11px/1.2 "Share Tech Mono",monospace;color:#ffc400;letter-spacing:1px;text-shadow:0 0 6px rgba(0,0,0,0.8)';
    wp.innerHTML = '<div style="width:14px;height:14px;border:2px solid #ffc400;transform:rotate(45deg);background:rgba(255,196,0,0.25)"></div><span></span>';
    el.appendChild(wp);
    const wpText = wp.querySelector('span') as HTMLSpanElement;
    // near: the modelled danfo and its conductor; far (150 m+): the cheap built bus, no conductor
    const lod = (v: Vehicle) => {
      if (v.okada) return;
      const d = v.pos.distanceTo(camera.position);
      const kids = v.mesh.children;
      const model = kids.find((k) => k.userData.detail);
      if (model) { model.visible = d < 150; if (kids[0]) kids[0].visible = d >= 150; }
      if (kids[1]) kids[1].visible = d < 60;
    };
    const drivable = (r: Road) => r.kind <= KIND.residential && r.len > 15;
    // a random road (matching [ok]) passing within [radius] of a point
    const roadNear = (x: number, z: number, radius: number, ok: (r: Road) => boolean) => {
      const list = city.roads().filter((r) => ok(r) && r.pts.some((p) => Math.abs(p.x - x) < radius && Math.abs(p.y - z) < radius));
      return list.length ? list[Math.floor(rnd() * list.length)] : null;
    };
    const lane = (v: Vehicle) => (v.road!.oneway ? 0 : Math.min(3.4, v.road!.width / 4)); // Nigeria drives on the right
    const placeVehicle = (v: Vehicle) => {
      const r = v.road!, p = pointAt(r, v.s), d = dirAt(r, v.s).multiplyScalar(v.dir);
      const off = lane(v);
      v.pos.set(p.x - d.y * off, roadY(r, v.s), p.y + d.x * off);
      v.fwd.set(d.x, 0, d.y);
      const h = Math.atan2(-d.y, d.x);
      v.heading += angleDiff(v.heading, h) * 0.25;
      v.mesh.position.copy(v.pos);
      v.mesh.position.y += 0.5 + Math.sin(performance.now() / 380 + v.cruise * 7) * 0.05; // hovering
      v.mesh.rotation.y = v.heading;
      v.mesh.rotation.z = THREE.MathUtils.clamp((v.speed - v.cruise) * 0.01, -0.04, 0.04); // nose dips as it brakes
    };
    const spawnVehicle = (v: Vehicle, x: number, z: number) => {
      const r = roadNear(x, z, SIM * 0.8, drivable);
      if (!r) { v.road = null; v.mesh.visible = false; return; }
      v.road = r;
      v.route = null;
      v.s = rnd() * r.len;
      v.dir = r.oneway ? 1 : rnd() < 0.5 ? 1 : -1;
      v.speed = v.cruise;
      v.heading = Math.atan2(-dirAt(r, v.s).y * v.dir, dirAt(r, v.s).x * v.dir);
      placeVehicle(v);
    };
    // at the end of a street: on to a connecting one (never against a one-way), or turn round
    const nextRoad = <T extends { road: Road | null; s: number; dir: number }>(a: T, ok: (r: Road) => boolean, oneways: boolean) => {
      const r = a.road!, atStart = a.dir < 0;
      // every way out of the junction: along each meeting street, forwards (unless it ends here)
      // and backwards (unless it starts here, or it's one-way)
      const outs: { road: Road; s: number; dir: number }[] = [];
      for (const l of city.linksAt(r, atStart)) {
        if (!ok(l.road)) continue;
        if (!l.atEnd) outs.push({ road: l.road, s: l.s, dir: 1 });
        if (!l.atStart && (!oneways || !l.road.oneway)) outs.push({ road: l.road, s: l.s, dir: -1 });
      }
      if (!outs.length) { a.dir = -a.dir; a.s = Math.max(0, Math.min(r.len, a.s)); return; }
      Object.assign(a, outs[Math.floor(rnd() * outs.length)]);
    };

    // ---- people: locals walking the pavements of the real streets ----
    type Walker = { person: Person; road: Road | null; s: number; dir: number; side: number; step: number; speed: number; greetAt: number };
    const walkers: Walker[] = [];
    const maxP = 0; // the streets belong to TEN for now: no walking locals (traffic and the Authority remain)
    for (let i = 0; i < maxP; i++) {
      const person = makePerson(randomBuild(rnd), { shadows: false });
      person.root.visible = false;
      scene.add(person.root);
      walkers.push({ person, road: null, s: 0, dir: 1, side: rnd() < 0.5 ? 1 : -1, step: 0, speed: 1.1 + rnd() * 0.6, greetAt: 0 });
    }
    const walkable = (r: Road) => !r.bridge && r.len > 8 && r.kind >= KIND.secondary;
    const spawnWalker = (w: Walker, x: number, z: number) => {
      const r = roadNear(x, z, 140, walkable);
      if (!r) { w.road = null; w.person.root.visible = false; return; }
      Object.assign(w, { road: r, s: rnd() * r.len, dir: rnd() < 0.5 ? 1 : -1 });
    };
    const walkerOffset = (w: Walker) => (w.road!.kind === KIND.foot ? 0 : w.road!.width / 2 + 1.1) * w.side + w.step * w.side;

    // ---- you ----
    const me = makePerson({ sex: 'm', height: 1.0, weight: 0.25, skin: 0x5b3726, hair: 0x111111, shoes: 0xf2f2f2, outfit: 'shirt', top: COBALT, bottom: 0x1b1d22, hairStyle: 'short', bag: 0x22252c, neon: 0x00e5ff, visor: true });
    me.root.position.set(0, 0.18, 0);
    scene.add(me.root);
    // the player is TEN, a modelled character; until he loads (or if he can't), the built body stands in
    let disposed = false;
    const clip = (n: string) => loadCharacter(`world/people/ten-${n}.glb`).catch(() => undefined);
    const base = live.current.look.base ?? 'ten';
    Promise.all([loadCharacter(`world/people/${base}.glb`), loadCharacter('world/people/ten.glb'), clip('run'), clip('idle'), clip('jump')]).then(([gltf, walk, run, idle, jump]) => {
      if (disposed) return;
      const ten = makeCastHero(gltf, { walk, run, idle, jump }, { height: 1.0, shadows: TIERS[tier].shadows, look: live.current.look });
      ten.root.position.copy(me.root.position);
      ten.root.rotation.copy(me.root.rotation);
      ten.root.visible = me.root.visible;
      scene.remove(me.root);
      Object.assign(me, ten);
      scene.add(me.root);
      (globalThis as { __world?: { pos: THREE.Vector3 } }).__world!.pos = me.root.position;
    }).catch((e) => console.warn('[world] player model failed; keeping the built body', e));
    const vel = new THREE.Vector3();
    let vy = 0, grounded = true, yaw = Math.PI, pitch = 0.32, birdH = 110, lastFacing = 0, lastSpeed = 0;
    let riding: Vehicle | null = null;
    // ---- health and lives ----
    // health 0..100: hard falls, being hit by traffic, crashing the hover-car; it recovers after a
    // few seconds unhurt. At zero, TEN is knocked down: a life is lost and he's back on his feet at the
    // junction. With none left, WYRD brings him back (and reacts). Lives return, one per 10 minutes.
    const VKEY = 'naija2099.vitals', MAX_LIVES = 3, LIFE_EVERY = 10 * 60 * 1000;
    let hp = 100, lives = MAX_LIVES, lifeAt = Date.now(), lastHurt = -1e9, downUntil = 0, lastHit = 0, shownHp = 100, shownLives = MAX_LIVES;
    try { const v = JSON.parse(localStorage.getItem(VKEY) ?? 'null'); if (v) { hp = Math.max(30, v.hp ?? 100); lives = v.lives ?? MAX_LIVES; lifeAt = v.lifeAt ?? Date.now(); } } catch { /* fresh */ }
    const saveVitals = () => { try { localStorage.setItem(VKEY, JSON.stringify({ hp, lives, lifeAt })); } catch { /* no storage */ } };
    const showVitals = () => {
      const h = Math.round(hp);
      if (h !== shownHp || lives !== shownLives) { shownHp = h; shownLives = lives; setVitals({ hp: h, lives }); }
    };
    let knockDown = () => {};
    const hurt = (amount: number, why: string) => {
      const now = performance.now();
      if (now < downUntil || amount <= 0) return;
      hp = Math.max(0, hp - amount);
      lastHurt = now;
      setHurtFlash(true); setTimeout(() => setHurtFlash(false), 450);
      happened(why);
      showVitals();
      if (hp <= 0) knockDown();
    };
    // TEN's hover-car, and whether he's flying it
    const car = makeHoverCar(scene);
    let inCar = false;
    const world = { floorAt: (x: number, z: number, maxY?: number) => city.floorAt(x, z, maxY), collide: (p: THREE.Vector3, r: number) => city.collide(p, r) };
    // the camera: zoom (wheel), how far it can actually be (walls), last time you dragged it
    let camDist = 6.5, camDistNow = 6.5, lastDrag = -1e9;
    const lookNow = new THREE.Vector3();
    let wantAct = false;
    let spawned = false;
    let startAt: { key: string; x: number; z: number } | null = null;
    const dist2 = (k: string) => { const [x, z] = k.split('_').map(Number); return (x + 0.5) ** 2 + (z + 0.5) ** 2; };
    const RADIUS = 0.42;

    let lastHint: string | null = null;
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    let sayTimer: ReturnType<typeof setTimeout> | undefined;
    const say = (text: string) => { setSpeech(text); clearTimeout(sayTimer); sayTimer = setTimeout(() => setSpeech(null), 3200); };
    // a horn, made on the spot (two detuned square waves): danfos honk when you block them
    let audio: AudioContext | null = null;
    const honk = (okada: boolean) => {
      try {
        if (!getSound().sfx) return;
        audio ??= new AudioContext();
        const t = audio.currentTime, g = audio.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + (okada ? 0.18 : 0.35));
        g.connect(audio.destination);
        for (const f of okada ? [620, 640] : [392, 470]) {
          const o = audio.createOscillator(); o.type = 'square'; o.frequency.value = f;
          o.connect(g); o.start(t); o.stop(t + 0.4);
        }
      } catch { /* no sound: fine */ }
    };

    knockDown = () => {
      const now = performance.now();
      lives -= 1;
      downUntil = now + 3500;
      if (inCar) { car.leave(); inCar = false; setFlying(false); }
      riding = null;
      me.root.visible = true;
      const out = lives <= 0;
      setDown(out ? 'OUT OF LIVES' : `KNOCKED DOWN · ${lives} ${lives === 1 ? 'LIFE' : 'LIVES'} LEFT`);
      setTimeout(() => {
        // back on your feet at the junction, healed
        if (startAt) {
          const nr = city.nearestRoad(startAt.x, startAt.z, (r) => !r.bridge && r.kind <= KIND.residential);
          const p = nr ? pointAt(nr.road, nr.s) : new THREE.Vector2(startAt.x, startAt.z);
          me.root.position.set(p.x, 0.18, p.y);
        }
        vel.set(0, 0, 0); vy = 0;
        hp = 100;
        if (out) {
          lives = MAX_LIVES;
          lifeAt = Date.now();
          address('event', '', { event: 'player_ran_out_of_lives_and_was_revived' });
          say('WYRD brought you back. "The city is not done with you."');
        } else say('You get back up. Ojuelegba keeps moving.');
        setDown(null);
        showVitals();
        saveVitals();
      }, 3500);
      showVitals();
      saveVitals();
    };

    // ---- the intro: arriving in Lagos (once per player; Space / Enter / Esc skips) ----
    const INTRO_KEY = 'naija2099.introDone';
    let introOn = false, introT = 0, introStep = 0, introBus: Vehicle | null = null;
    const introDone = (() => { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; } })();
    const firstJob = { kind: 'deliver' as const, title: 'Pepper for Mama Bisi', brief: "Take a bag of tatashe from the junction to Mama Bisi's stall on Ishaga Road.", street: 'Ishaga Road', reward: 4 };
    const line = (t: string) => { setAuthLine(t); clearTimeout(lineTimer); lineTimer = setTimeout(() => setAuthLine(null), 7000); };
    const endIntro = () => {
      if (!introOn) return;
      introOn = false;
      me.root.visible = true;
      setIntro(false); setCaption(null);
      if (!task) setTask(firstJob);
      try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* no storage */ }
      happened('arrived in Lagos by danfo at Ojuelegba');
    };
    const startIntro = () => {
      if (introDone) return;
      introOn = true; introT = 0; introStep = 0;
      me.root.visible = false; // on the danfo, until it stops
      setIntro(true);
    };
    // the camera's path: high over the lagoon and the skyline, sweeping down to the junction
    const introCam = (t: number, S: THREE.Vector3) => {
      const keys = [
        { t: 0, p: new THREE.Vector3(S.x - 260, 260, S.z + 340), l: new THREE.Vector3(S.x + 2600, 40, S.z + 3200) },
        { t: 6, p: new THREE.Vector3(S.x - 120, 150, S.z + 160), l: new THREE.Vector3(S.x + 900, 20, S.z + 600) },
        { t: 10, p: new THREE.Vector3(S.x + 40, 45, S.z + 55), l: new THREE.Vector3(S.x, 2, S.z) },
        { t: 14, p: camTarget.clone(), l: head.clone() }, // into the gameplay camera, which keeps clear of walls
        { t: 99, p: camTarget.clone(), l: head.clone() },
      ];
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1].t < t) i++;
      const a = keys[i], b = keys[i + 1], u = THREE.MathUtils.smoothstep(t, a.t, b.t);
      camera.position.lerpVectors(a.p, b.p, u);
      camera.lookAt(new THREE.Vector3().lerpVectors(a.l, b.l, u));
    };

    // ---- input ----
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => {
      if (introOn && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) { endIntro(); e.preventDefault(); return; }
      if (e.key === 'Escape' || (e.key.toLowerCase() === 'm' && !live.current.typing)) { setMenu((m) => !m); keys.clear(); return; }
      const tg = e.target as HTMLElement | null;
      if (live.current.typing || tg?.tagName === 'INPUT' || tg?.tagName === 'TEXTAREA') { keys.clear(); return; } // typing to WYRD never drives the game
      const k = e.key.toLowerCase();
      if (k === 't') { setAsk('speak'); keys.clear(); e.preventDefault(); return; }
      if (k === 'v') { setBird((b) => !b); return; }
      if (k === 'e') { wantAct = true; return; }
      if (k === 'f' && !inCar) { car.call(me.root.position, me.root.rotation.y, world); say('You call your hover-car. It drops out of the sky.'); return; }
      if (k === ' ' && inCar) { keys.add(' '); e.preventDefault(); return; }
      if (k === ' ' && grounded) { vy = 7.2; grounded = false; e.preventDefault(); }
      keys.add(k);
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const canvas = renderer.domElement;
    const touches = new Map<number, { x: number; y: number; ox: number; oy: number; move: boolean }>();
    const stick = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      canvas.focus();
      canvas.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, move: e.pointerType === 'touch' && e.clientX < canvas.clientWidth / 2 });
    };
    const onMove = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      if (t.move) {
        stick.x = Math.max(-1, Math.min(1, (e.clientX - t.ox) / 60));
        stick.y = Math.max(-1, Math.min(1, (e.clientY - t.oy) / 60));
      } else if (live.current.bird) {
        const k = birdH * 0.0022;
        mapTarget.x -= (e.clientX - t.x) * k;
        mapTarget.z -= (e.clientY - t.y) * k;
        follow = false; flying = false;
      } else {
        yaw -= (e.clientX - t.x) * 0.006;
        lastDrag = performance.now();
        pitch = Math.max(0.05, Math.min(1.15, pitch + (e.clientY - t.y) * 0.004));
      }
      t.x = e.clientX; t.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => { if (touches.get(e.pointerId)?.move) { stick.x = 0; stick.y = 0; } touches.delete(e.pointerId); };
    const onWheel = (e: WheelEvent) => {
      if (live.current.bird) birdH = Math.max(40, Math.min(9000, birdH * Math.exp(e.deltaY * 0.0012)));
      else camDist = Math.max(2.6, Math.min(18, camDist * Math.exp(e.deltaY * 0.001))); // zoom in on TEN, or out
      e.preventDefault();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const onLook = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas || live.current.bird) return;
      yaw -= e.movementX * 0.0024;
      pitch = Math.max(-0.35, Math.min(1.2, pitch + e.movementY * 0.0019));
      lastDrag = performance.now();
    };
    document.addEventListener('mousemove', onLook);
    // click-and-drag always turns the camera; a double-click captures the mouse for free look (Esc releases)
    const onDbl = () => { if (!live.current.bird && !live.current.typing && document.pointerLockElement !== canvas) { try { void (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* not allowed here: drag works */ } } };
    canvas.addEventListener('dblclick', onDbl);

    // a vehicle, as a box in its own frame: are you inside it? push you out the short way
    const pushFromVehicle = (pos: THREE.Vector3, v: Vehicle) => {
      if (!v.road || pos.y > v.pos.y + 2.6 || pos.y < v.pos.y - 0.5) return;
      const rx = pos.x - v.pos.x, rz = pos.z - v.pos.z;
      const along = rx * v.fwd.x + rz * v.fwd.z, side = -rx * v.fwd.z + rz * v.fwd.x;
      const oa = v.len / 2 + RADIUS - Math.abs(along), os = v.width / 2 + RADIUS - Math.abs(side);
      if (oa <= 0 || os <= 0) return;
      if (v === riding || riding || inCar) return; // you're aboard (or in your car): no collisions with traffic
      if (v.speed > 3 && v !== summoned && performance.now() - lastHit > 1200) { lastHit = performance.now(); hurt(v.speed * 3.2, v.okada ? 'was hit by an okada' : 'was hit by a danfo'); }
      if (oa < os) { const k = Math.sign(along || 1) * oa; pos.x += v.fwd.x * k; pos.z += v.fwd.z * k; }
      else { const k = Math.sign(side || 1) * os; pos.x += -v.fwd.z * k; pos.z += v.fwd.x * k; vel.x += -v.fwd.z * Math.sign(side || 1) * 3; vel.z += v.fwd.x * Math.sign(side || 1) * 3; }
    };

    // ---- post-processing: bloom on high only, at half resolution ----
    let composer: EffectComposer | null = null;
    let bloom: UnrealBloomPass | null = null;
    const ensureComposer = () => {
      if (composer) return;
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.35, 0.96); // a halo on the brightest neon only
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    };

    const resize = () => {
      const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      composer?.setSize(w, h);
      bloom?.setSize(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const applyTier = (t: Tier) => {
      tier = t;
      const q = TIERS[t];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
      sun.castShadow = q.shadows;
      city.setShadows(q.shadows);
      city.far = q.far;
      city.propDensity = t === 'low' ? 0.35 : t === 'mid' ? 0.7 : 1; // street life halves on low-end devices
      (scene.fog as THREE.Fog).far = q.fog;
      sky.scale.setScalar((camera.far * 0.9) / 900); // the dome always inside the far plane (16 km: the island skylines show)
      camera.updateProjectionMatrix();
      if (q.bloom) ensureComposer();
      resize();
      renderer.shadowMap.needsUpdate = true;
      setTierNow(t);
    };
    applyTier(tier);
    window.addEventListener('resize', resize);

    // ---- WYRD, the Authority ----
    const authority = makeAuthority(scene);
    let trafficMode: 'normal' | 'stop' | 'rush' = 'normal';
    let task: (CityMission & { at: THREE.Vector3 | null; greets: number; done: boolean }) | null = null;
    const happenings: string[] = [];
    const happened = (h: string) => { happenings.push(h); if (happenings.length > 6) happenings.shift(); };
    let honks: number[] = [], lastReport = 0, summoned: Vehicle | null = null, summonedAt = 0, droneAnswered = true, talking = false;
    let lineTimer: ReturnType<typeof setTimeout> | undefined, noteTimer: ReturnType<typeof setTimeout> | undefined, castTimer: ReturnType<typeof setTimeout> | undefined;
    // what WYRD is told about the moment: where you are, the real streets round you, what just happened
    const situation = () => {
      const p = me.root.position, near = new Map<string, number>();
      for (const r of city.roads()) {
        if (!r.name || near.has(r.name)) continue;
        let best = Infinity;
        for (const q of r.pts) best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.z));
        if (best < 450) near.set(r.name, Math.round(best));
      }
      return {
        player: live.current.look.name, x: Math.round(p.x), z: Math.round(p.z), street: lastStreet || null, lagosTime: fmtHour(), weather: authority.weather, traffic: trafficMode,
        riding: !!riding, nearbyStreets: [...near.entries()].sort((a, b) => a[1] - b[1]).slice(0, 14).map(([name, m]) => `${name} (${m} m)`),
        mission: task ? { title: task.title, kind: task.kind, street: task.street } : null, recently: happenings,
      };
    };
    // a mission's place: its x/z, or the nearest stretch of its real street once that street is loaded
    // every named street in the downloaded city, so a mission anywhere can be found before its tile loads
    let streetIndex: Record<string, [number, number]> = {};
    fetch('world/v1/streets.json').then((r) => r.json()).then((j) => { streetIndex = j; if (task && !task.at) locate(); }).catch(() => {});
    const locate = () => {
      if (!task) { authority.setBeacon(null); return; }
      if (task.x != null && task.z != null) task.at = new THREE.Vector3(task.x, 0, task.z);
      else if (task.street) {
        const want = task.street.toLowerCase(), p = me.root.position;
        const nr = city.nearestRoad(p.x, p.z, (r) => r.name?.toLowerCase() === want);
        if (nr) { const q = pointAt(nr.road, nr.s); task.at = new THREE.Vector3(q.x, 0, q.y); }
        else { const hit = Object.entries(streetIndex).find(([n]) => n.toLowerCase() === want); if (hit) task.at = new THREE.Vector3(hit[1][0], 0, hit[1][1]); }
      }
      authority.setBeacon(task.done ? null : task.at);
    };
    const setTask = (m: CityMission | null) => {
      task = m ? { ...m, at: null, greets: 0, done: false } : null;
      locate();
      setMission(m);
      if (!m) setMissionDist(null);
    };
    const summonDanfo = () => {
      const p = me.root.position;
      const nr = city.nearestRoad(p.x, p.z, drivable);
      const v = vehicles.filter((o) => !o.okada && o !== riding).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
      if (!nr || !v) return;
      const fwd = nr.s > 60 || nr.road.oneway;
      Object.assign(v, { road: nr.road, dir: fwd ? 1 : -1, s: fwd ? Math.max(0, nr.s - 60) : Math.min(nr.road.len, nr.s + 60), speed: v.cruise });
      v.heading = Math.atan2(-dirAt(nr.road, v.s).y * v.dir, dirAt(nr.road, v.s).x * v.dir);
      placeVehicle(v);
      summoned = v; summonedAt = performance.now();
    };
    const apply = (d: CityDecree) => {
      setStanding({ standing: d.standing, rank: d.rank, missionsDone: d.missionsDone });
      if (d.trainingAsked !== undefined) setTraining({ optIn: !!d.trainingOptIn, asked: !!d.trainingAsked });
      if (d.say && !holo.active) { setAuthLine(d.say); clearTimeout(lineTimer); lineTimer = setTimeout(() => setAuthLine(null), 9000); }
      for (const a of d.actions) {
        switch (a.type) {
          case 'mission': setTask(a); break;
          case 'mission_done': setTask(null); break;
          case 'standing':
            setAuthNote(`${a.delta > 0 ? '+' : ''}${a.delta} STANDING · ${a.reason}`);
            clearTimeout(noteTimer); noteTimer = setTimeout(() => setAuthNote(null), 6000);
            break;
          case 'weather': authority.setWeather(a.weather as Weather); setWeatherNow(a.weather); break;
          case 'traffic': trafficMode = a.mode; break;
          case 'drone': authority.sendDrone(a.toPlayer || a.x == null || a.z == null ? null : new THREE.Vector3(a.x, 0, a.z)); droneAnswered = false; break;
          case 'broadcast': setBroadcast(a.text); clearTimeout(castTimer); castTimer = setTimeout(() => setBroadcast(null), 10000); break;
          case 'danfo': summonDanfo(); break;
        }
      }
      if (d.mission && !task) setTask(d.mission); // a mission from an earlier visit
      if (!d.mission && task && task.done) setTask(null);
    };
    const holo = makeHoloTalk(scene);
    let handDown = 0;
    const address = (channel: 'speak' | 'petition' | 'drone' | 'event', text: string, extra?: object) => {
      if (talking) return;
      talking = true;
      const spoken = channel !== 'event';
      if (spoken) { holo.listen(); me.raise = 1; handDown = 0; }
      api.cityAddress(channel, text, { ...situation(), ...extra })
        .then((d) => { apply(d); if (spoken) holo.say(d.say || '…'); })
        .catch(async () => {
          if (!spoken) return;
          // the game channel isn't on the server yet (not deployed): WYRD answers through its everyday chat
          try {
            const r = await api.chat(`[You are speaking inside NAIJA 2099, your open-world Lagos of the year 2099, as its Authority. Stay in character: answer ${live.current.look.name} (a player standing on ${lastStreet || 'Ojuelegba Road'}) in one to three short lines, plain words, a little Lagos flavour, no lists.] ${text}`);
            holo.say(r.reply);
          } catch { holo.say("I can't hear you just now -- are you signed in? Try again in a moment."); }
        })
        .finally(() => { talking = false; if (spoken) handDown = performance.now() + 1800; });
    };
    // ---- the live design (what the owner and WYRD have approved in the studio) ----
    let design: CityLiveDesign = { traffic: 1, crowd: 1, npcLines: [], events: [], missions: [] };
    let eventOn: string | null = null, eventSetWeather = false, eventSetTraffic = false, nextEventCheck = 0;
    const reloadDesign = () => { api.cityDesign().then((d) => { design = d; nextEventCheck = 0; }).catch(() => {}); };
    reloadDesign();
    // city events run at their Lagos hours; when one ends, what it changed goes back
    const runEvents = () => {
      const h = lagosHour();
      const ev = design.events.find((e) => (e.startHour < e.endHour ? h >= e.startHour && h < e.endHour : h >= e.startHour || h < e.endHour)) ?? null;
      const id = ev ? `${ev.title}:${ev.startHour}` : null;
      if (id === eventOn) return;
      if (eventOn) {
        if (eventSetWeather) { authority.setWeather('clear'); setWeatherNow('clear'); }
        if (eventSetTraffic) trafficMode = 'normal';
      }
      eventOn = id; eventSetWeather = eventSetTraffic = false;
      if (!ev) return;
      if (ev.weather) { authority.setWeather(ev.weather); setWeatherNow(ev.weather); eventSetWeather = true; }
      if (ev.traffic) { trafficMode = ev.traffic; eventSetTraffic = true; }
      if (ev.broadcast) { setBroadcast(ev.broadcast); clearTimeout(castTimer); castTimer = setTimeout(() => setBroadcast(null), 10000); }
      happened(`the city event "${ev.title}" began`);
    };
    ctl.current = { skipIntro: () => endIntro(), act: () => { wantAct = true; }, jump: () => { if (grounded && !inCar) { vy = 7.2; grounded = false; } }, setLook: (l: CharacterLook) => me.setLook?.(l), address, reloadDesign, findMe: () => { follow = true; flying = false; }, callCar: () => { if (!inCar) { car.call(me.root.position, me.root.rotation.y, world); say('You call your hover-car. It drops out of the sky.'); } } };
    api.cityStatus().then(apply).catch(() => {});

    // for measuring (draw calls, triangles, tier) from the console or a test
    (globalThis as { __world?: unknown }).__world = { info: renderer.info, tier: () => tier, pos: me.root.position, city, camera, cam: () => ({ camDist, camDistNow, pitch, yaw, inCar, riding: !!riding }) };

    const skyTop = new THREE.Color(), skyBottom = new THREE.Color();
    const sunDir = new THREE.Vector3();
    const camTarget = new THREE.Vector3();
    const head = new THREE.Vector3(), probe = new THREE.Vector3();
    let raf = 0, last = performance.now(), lastBrainKey = '', frameNo = 0, nextCity = 0, nextStreet = 0, lastStreet = '';
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.visibilityState === 'hidden') return;
      const interval = now - last;
      const dt = Math.min(0.05, interval / 1000);
      last = now;
      frameNo++;
      const time = (now - t0) / 1000;
      const pos = me.root.position;

      // ---- graphics tier: AUTO steps down when frames run slow; a pinned choice applies at once ----
      const choice = live.current.gfx;
      if (choice !== 'auto' && choice !== tier) { auto = null; applyTier(choice); }
      if (choice === 'auto' && !auto) auto = new AutoTier(tier);
      const stepTo = auto?.sample(interval, now, city.busy);
      if (stepTo) applyTier(stepTo);

      // ---- the city streams round you; geometry is built a few ms per frame ----
      const bird = live.current.bird;
      if (bird && document.pointerLockElement === canvas) document.exitPointerLock(); // the map needs the mouse to drag
      if (!bird) { follow = true; flying = false; }
      if (follow) mapTarget.copy(pos);
      if (flying) { mapTarget.lerp(flyTo, 1 - Math.pow(0.15, dt)); if (mapTarget.distanceTo(flyTo) < 5) flying = false; }
      city.near = bird && birdH > 420 ? 0 : 1;
      if (now > nextCity) { nextCity = now + 400; if (bird) city.update(mapTarget.x, mapTarget.z); else city.update(pos.x, pos.z); }
      city.pump(spawned ? 4 : 12);
      if (!spawned && city.index && !startAt) {
        // the junction's tile, or (while the map is still being fetched) the nearest one there is
        const T = city.index.tile;
        const k = city.index.tiles.includes('0_0') ? '0_0' : [...city.index.tiles].sort((x, y) => dist2(x) - dist2(y))[0];
        const [kx, kz] = k.split('_').map(Number);
        startAt = { key: k, x: k === '0_0' ? 0 : (kx + 0.5) * T, z: k === '0_0' ? 0 : (kz + 0.5) * T };
        pos.set(startAt.x, 0.18, startAt.z);
      }
      if (!spawned && startAt && city.tiles.get(startAt.key)?.level === 'near' && (!city.busy || now - t0 > 8000)) {
        spawned = true;
        // start on the street at the junction, not inside a building
        const nr = city.nearestRoad(startAt.x, startAt.z, (r) => !r.bridge && r.kind <= KIND.residential);
        if (nr) {
          const p = pointAt(nr.road, nr.s), d = dirAt(nr.road, nr.s);
          pos.set(p.x, 0.18, p.y);
          yaw = Math.atan2(-d.x, -d.y); // the camera behind you, looking down the street
          me.root.rotation.y = Math.atan2(d.x, d.y);
        }
        placeTower();
        for (const v of vehicles) spawnVehicle(v, pos.x, pos.z);
        for (const w of walkers) spawnWalker(w, pos.x, pos.z);
        startIntro();
        setLoading(false);
      }

      // ---- the sun at Lagos' real hour; night when it's down ----
      const hour = lagosHour();
      const ang = ((hour - 6) / 12) * Math.PI; // 6:00 rises in the east, 18:00 sets in the west
      sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
      const night = THREE.MathUtils.clamp(1 - (sunDir.y + 0.08) * 5, 0, 1);
      skyU.sunDir.value.copy(sunDir);
      skyU.night.value = night;
      facadeUniforms.uNight.value = night;
      facadeUniforms.uTime.value = time;
      facadeUniforms.uSkyTop.value.copy(skyU.top.value);
      facadeUniforms.uSkyBottom.value.copy(skyU.bottom.value);
      const [top, bottom] = skyFor(live.current.mood);
      skyTop.setHex(top); skyBottom.setHex(bottom);
      skyBottom.lerp(c.setHex(0xff8fb8), 0.3); skyTop.lerp(c.setHex(0x3a5aa8), 0.25); // a neon-smog horizon
      skyU.top.value.lerp(skyTop, dt * 0.8);
      skyU.bottom.value.lerp(skyBottom, dt * 0.8);
      (scene.fog as THREE.Fog).color.copy(skyU.bottom.value).lerp(c.setHex(0x6a4a8a), 0.35).lerp(c.setHex(0x1e1440), night);
      sun.intensity = 2.6 * (1 - night) + 0.05;
      sun.color.setHSL(0.09, 0.6, 0.62 + 0.3 * Math.max(0, sunDir.y));
      hemi.intensity = 0.7 + 0.15 * (1 - night); // nights stay readable: the city's own glow fills the haze
      city.bulbMat.emissiveIntensity = night * 3.5;
      city.poolMat.opacity = night * 0.85; // street lamps light the road under them
      (scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.06 + 0.22 * (1 - night); // the studio map is for reflections; at full strength it floodlights every roof and the ground
      renderer.toneMappingExposure = 1.0 + night * 0.25; // the eye adjusts: night is dark blue, not black
      if (bloom) bloom.strength = 0.06 + night * 0.2; // restrained: the city has a lot of light in it
      // the Authority's weather: rain and storm dim the day and close in the haze; harmattan is a dusty wall
      const wx = authority.sky(now);
      const fog = scene.fog as THREE.Fog;
      fog.far = Math.max(TIERS[tier].fog * wx.fog, live.current.bird ? birdH * 5 : 0);
      fog.near = Math.max(60 * wx.fog, live.current.bird ? birdH * 0.9 : 0);
      if (wx.tint !== null) fog.color.lerp(c.setHex(wx.tint), 0.6 * (1 - night));
      sun.intensity *= wx.dim;
      hemi.intensity = hemi.intensity * (0.6 + 0.4 * wx.dim) + wx.flash * 3;

      // ---- WYRD's brain: re-laid when its concepts change; a new real thought fires a beam ----
      const b = live.current.brain;
      const key = b ? `${b.neurons.length}:${b.neurons[0]?.id ?? ''}` : '';
      if (key !== lastBrainKey) { lastBrainKey = key; layoutBrain(); }
      const f = b?.firings?.[b.firings.length - 1];
      if (f && f.at !== live.current.lastFiring) {
        const first = !live.current.lastFiring;
        live.current.lastFiring = f.at;
        if (!first) {
          beamAt = now;
          beamDir = new THREE.Vector3(Math.cos(now), 0, Math.sin(now)).normalize();
          pulseNeurons.clear();
          f.path.forEach((id) => { const i = ids.indexOf(id); if (i >= 0) pulseNeurons.add(i); });
          setThought(f.path.join(' → '));
          setTimeout(() => setThought(null), 6000);
        }
      }
      neurons.rotation.y += dt * 0.15;
      const bt = (now - beamAt) / 2600;
      if (bt >= 0 && bt < 1 && plaza.placed) {
        const len = 40 + bt * 140;
        beam.scale.set(1, len, 1);
        beam.position.set(plaza.x, towerH + 7, plaza.z).addScaledVector(beamDir, len / 2).setY(towerH + 7 - bt * 12);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir.clone().setY(-0.1).normalize());
        beamMat.opacity = 0.8 * (1 - bt);
      } else beamMat.opacity = 0;
      const glow = bt >= 0 && bt < 1.4 ? 1 - bt / 1.4 : 0;
      for (const i of pulseNeurons) {
        c.setHex(0x22242a).lerp(new THREE.Color(COBALT), glow);
        neuronCol.set([c.r, c.g, c.b], i * 3);
      }
      if (pulseNeurons.size) neuronGeo.attributes.color.needsUpdate = true;
      ringMat.opacity = 0.35 + glow * 0.5;

      // ---- you: acceleration, friction, gravity, collisions against real walls ----
      let ix = 0, iz = 0;
      if (keys.has('w') || keys.has('arrowup')) iz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) iz += 1;
      if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
      if (keys.has('d') || keys.has('arrowright')) ix += 1;
      ix += stick.x; iz += stick.y;
      if (inCar) { ix = 0; iz = 0; } // the keys fly the car, not TEN
      const im = Math.min(1, Math.hypot(ix, iz));
      const run = keys.has('shift') ? 5.5 : 2.0; // a real walking pace, and a run (a person, not a car)
      const want = new THREE.Vector3();
      if (im > 0.05) {
        const cy = live.current.bird ? 0 : yaw; // in bird's-eye, "up" on screen is north
        want.set(ix * Math.cos(cy) + iz * Math.sin(cy), 0, -ix * Math.sin(cy) + iz * Math.cos(cy)).normalize().multiplyScalar(run * im);
      }
      const accel = grounded ? 14 : 4;
      vel.x += THREE.MathUtils.clamp(want.x - vel.x, -accel * dt, accel * dt) * (want.lengthSq() > 0 ? 1 : 1.4);
      vel.z += THREE.MathUtils.clamp(want.z - vel.z, -accel * dt, accel * dt) * (want.lengthSq() > 0 ? 1 : 1.4);
      vy -= 22 * dt;
      pos.x += vel.x * dt; pos.z += vel.z * dt; pos.y += vy * dt;
      // the floor under him: the street, or a roof / skybridge deck he's on top of
      const floorY = Math.max(0.18, city.floorAt(pos.x, pos.z, pos.y + 0.6) + 0.05);
      if (pos.y > floorY + 0.08) grounded = false; // off a ledge, a roof edge, a bridge: falling
      if (pos.y <= floorY) {
        if (!grounded) {
          me.squash = Math.min(1, -vy / 9);
          if (-vy > 13) hurt((-vy - 13) * 7, 'took a hard fall'); // a drop of ~4 m starts to hurt
        }
        pos.y = floorY; vy = 0; grounded = true;
      }
      city.collide(pos, RADIUS);
      for (const v of vehicles) pushFromVehicle(pos, v);
      const speed = Math.hypot(vel.x, vel.z);
      if (speed > 0.2) me.root.rotation.y += angleDiff(me.root.rotation.y, Math.atan2(vel.x, vel.z)) * Math.min(1, dt * 12);
      // how fast TEN is turning and speeding up: the walk leans and banks with it
      const turnRate = angleDiff(lastFacing, me.root.rotation.y) / Math.max(dt, 1e-3);
      lastFacing = me.root.rotation.y;
      const accelNow = (speed - lastSpeed) / Math.max(dt, 1e-3);
      lastSpeed = speed;
      animatePerson(me, speed, dt, !grounded, turnRate, accelNow);
      ground.position.set(Math.round(mapTarget.x / 100) * 100, 0, Math.round(mapTarget.z / 100) * 100); // the land runs to the horizon

      // ---- traffic: cruise the real streets, brake for you and the vehicle ahead ----
      if (spawned) {
        const activeV = Math.min(vehicles.length, Math.round(TIERS[tier].vehicles * design.traffic));
        if (now > nextEventCheck) { nextEventCheck = now + 20000; runEvents(); }
        vehicles.forEach((v, i) => {
          if (i >= activeV) { v.mesh.visible = false; return; }
          if (!v.road || v.pos.distanceTo(pos) > SIM) { if (v !== riding) spawnVehicle(v, pos.x, pos.z); if (!v.road) return; }
          // ---- danfos: stop to stop on a real route ----
          if (!v.okada && v !== summoned && busRouter.stops.length > 1) {
            if (!v.route) nextLeg(v);
            if (v.route) {
              const r = v.route;
              if ((v.dwell ?? 0) > 0) {
                v.dwell! -= dt; v.speed = 0;
                if (v.dwell! <= 0) nextLeg(v);
              } else {
                const left = r.len - (v.rs ?? 0);
                let tgt = Math.min(v.cruise * 1.2, 4 + left * 0.5); // ease in to the stop
                const rx = pos.x - v.pos.x, rz = pos.z - v.pos.z, ahead = rx * v.fwd.x + rz * v.fwd.z, across = Math.abs(-rx * v.fwd.z + rz * v.fwd.x);
                if (!riding && ahead > 0 && ahead < 9 + v.len / 2 && across < 1.8) tgt = 0;
                // keep a gap from whatever is ahead going the same way (and queue at stops)
                for (const o of vehicles) {
                  if (o === v || !o.mesh.visible) continue;
                  const ox = o.pos.x - v.pos.x, oz = o.pos.z - v.pos.z;
                  const oa = ox * v.fwd.x + oz * v.fwd.z, oc = Math.abs(-ox * v.fwd.z + oz * v.fwd.x);
                  if (oa > 0 && oc < 2.4 && oa < (v.len + o.len) / 2 + 3 + v.speed * 0.8) tgt = Math.min(tgt, oa < (v.len + o.len) / 2 + 1.5 ? 0 : o.speed * 0.7);
                }
                tgt *= trafficMode === 'stop' ? 0 : trafficMode === 'rush' ? 1.4 : 1;
                v.speed += THREE.MathUtils.clamp(tgt - v.speed, -12 * dt, 4 * dt);
                v.rs = (v.rs ?? 0) + v.speed * dt;
                if (v.rs >= r.len - 0.5) {
                  v.dwell = 4 + rnd() * 4; // pull in: passengers off and on
                  if (v.atStop && v.pos.distanceTo(pos) < 30 && !riding) say(`"${v.atStop.name.toUpperCase()}! ${v.atStop.name.toUpperCase()}! Enter with your change!"`);
                }
              }
              const a = along(r, Math.min(v.rs ?? 0, r.len));
              const lane = 1.8; // keep right
              v.pos.set(a.p.x - a.d.y * lane, a.y, a.p.y + a.d.x * lane); // up onto flyovers and bridges
              v.fwd.set(a.d.x, 0, a.d.y);
              v.heading += angleDiff(v.heading, Math.atan2(-a.d.y, a.d.x)) * Math.min(1, dt * 5);
              v.mesh.position.copy(v.pos);
              v.mesh.position.y += 0.5 + Math.sin(now / 380 + v.cruise * 7) * 0.05;
              v.mesh.rotation.y = v.heading;
              v.mesh.visible = v.pos.distanceTo(camera.position) < TIERS[tier].fog * 0.6;
              lod(v);
              return;
            }
          }
          let target = v.cruise * (v.road.kind <= KIND.primary ? 1.4 : v.road.kind >= KIND.residential ? 0.7 : 1) * (trafficMode === 'stop' ? 0 : trafficMode === 'rush' ? 1.5 : 1);
          if (v === summoned && (v.pos.distanceTo(pos) < 7 || now - summonedAt > 60000)) { target = 0; if (now - summonedAt > 60000) summoned = null; }
          const rx = pos.x - v.pos.x, rz = pos.z - v.pos.z;
          const ahead = rx * v.fwd.x + rz * v.fwd.z, across = Math.abs(-rx * v.fwd.z + rz * v.fwd.x);
          if (!riding && ahead > 0 && ahead < 9 + v.len / 2 && across < 1.8 && Math.abs(pos.y - v.pos.y) < 2) {
            target = 0; // someone in the lane: stop -- and say so
            if (now - v.honkAt > 4000 && ahead < 7 + v.len / 2) {
              v.honkAt = now; honk(v.okada);
              honks = honks.filter((t) => now - t < 60000); honks.push(now);
              if (honks.length >= 3 && now - lastReport > 90000) { lastReport = now; happened('kept blocking the traffic'); address('event', '', { event: 'player_blocking_traffic' }); }
            }
          }
          for (const o of vehicles) {
            if (o === v || o.road !== v.road || o.dir !== v.dir) continue;
            const gap = (o.s - v.s) * v.dir;
            if (gap > 0 && gap < 7 + v.len) target = Math.min(target, o.speed * 0.8);
          }
          v.speed += THREE.MathUtils.clamp(target - v.speed, -14 * dt, 5 * dt);
          v.s += v.dir * v.speed * dt;
          if (v.s > v.road.len || v.s < 0) nextRoad(v, drivable, true);
          for (const wh of v.wheels) wh.rotation.z -= (v.speed * dt) / 0.43;
          placeVehicle(v);
          v.mesh.visible = v.pos.distanceTo(camera.position) < TIERS[tier].fog * 0.6;
              lod(v);
        });
      }

      // ---- the hover-car ----
      car.update(dt, now, inCar ? { forward: (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - stick.y, turn: (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + stick.x, lift: (keys.has(' ') ? 1 : 0) - (keys.has('c') || keys.has('control') ? 1 : 0) } : { forward: 0, turn: 0, lift: 0 }, world);
      if (car.state.impact > 0) { if (inCar) hurt((car.state.impact - 12) * 3, 'crashed the hover-car'); car.state.impact = 0; }
      if (now - lastHurt > 6000 && hp < 100 && now > downUntil) { hp = Math.min(100, hp + 6 * dt); showVitals(); }
      if (lives < MAX_LIVES && Date.now() - lifeAt > LIFE_EVERY) { lives += 1; lifeAt = Date.now(); showVitals(); saveVitals(); }
      if (frameNo % 120 === 0) saveVitals();
      if (now < downUntil) { vel.set(0, 0, 0); } // down: no moving
      if (car.state.mode !== 'away') authority.glow(car.state.pos.x, car.state.pos.y - 0.45, car.state.pos.z, 4.2, 6.5, car.state.yaw, 0x00e5ff, 0.9);
      if (inCar) {
        pos.copy(car.state.pos);
        vel.set(0, 0, 0); vy = 0;
        me.root.visible = false;
        yaw += angleDiff(yaw, car.state.yaw + Math.PI) * Math.min(1, dt * 2.5); // the camera swings in behind the car
      }

      // ---- riding a danfo: you sit inside; it carries you through the real streets ----
      if (riding) {
        pos.copy(riding.pos).setY(riding.pos.y + 0.18);
        vel.set(0, 0, 0); vy = 0;
        me.root.visible = false;
        yaw += angleDiff(yaw, riding.heading + Math.PI / 2) * Math.min(1, dt * 1.5); // the camera settles behind the bus
      }

      // ---- E: hop on or off a danfo, or greet whoever is near ----
      let near: string | null = null;
      let closestDanfo: Vehicle | null = null, dv = 4;
      if (!riding) for (const v of vehicles) { if (!v.okada && v.mesh.visible) { const d = v.pos.distanceTo(pos); if (d < dv) { dv = d; closestDanfo = v; } } }
      let closestLocal: Walker | null = null, dl = 2.6;
      for (const w of walkers) { if (w.person.root.visible) { const d = w.person.root.position.distanceTo(pos); if (d < dl) { dl = d; closestLocal = w; } } }
      const atTower = plaza.placed && Math.hypot(pos.x - plaza.x, pos.z - plaza.z) < plaza.r + 3;
      const droneHere = authority.droneState.active && !droneAnswered && Math.hypot(authority.drone.position.x - pos.x, authority.drone.position.z - pos.z) < 18;
      const nearCar = !inCar && !riding && car.state.mode === 'parked' && car.state.pos.distanceTo(pos) < 4.2;
      if (inCar) near = car.canLeave(world) ? 'E TO STEP OUT' : 'SPACE CLIMB · C DESCEND · LAND TO STEP OUT';
      else if (nearCar) near = 'E TO BOARD THE HOVER-CAR';
      else if (riding) near = 'E TO GET OFF';
      else if (atTower) near = 'E TO PETITION WYRD';
      else if (droneHere) near = "E TO ANSWER WYRD'S DRONE";
      else if (closestDanfo) near = 'E TO HOP ON THE DANFO';
      else if (closestLocal) near = 'E TO GREET';
      if (near !== lastHint) { lastHint = near; setHint(near); }
      if (wantAct) {
        wantAct = false;
        if (inCar) {
          if (car.canLeave(world)) {
            const side = car.state.yaw + Math.PI / 2;
            pos.set(car.state.pos.x + Math.sin(side) * 2.4, 0, car.state.pos.z + Math.cos(side) * 2.4);
            pos.y = Math.max(0.18, city.floorAt(pos.x, pos.z, car.state.pos.y + 0.6) + 0.05);
            car.leave();
            inCar = false; setFlying(false);
            me.root.visible = true;
            say(pos.y > 3 ? 'You step out onto the roof. Lagos spreads out below.' : 'You step out.');
          } else say('Bring her down onto a roof or the street first.');
        } else if (nearCar) {
          car.board();
          inCar = true; setFlying(true);
          say('Hover-car: W/S to fly, A/D to turn, SPACE to climb, C to descend.');
        } else if (!riding && atTower) {
          setAsk('petition'); keys.clear();
        } else if (!riding && droneHere) {
          droneAnswered = true; setAsk('drone'); keys.clear();
        } else if (riding) {
          // off on the kerb side (the right), back on the ground
          pos.set(riding.pos.x - riding.fwd.z * 3, 0.18, riding.pos.z + riding.fwd.x * 3);
          city.collide(pos, RADIUS);
          riding = null;
          me.root.visible = true;
          say('You hop off. "Owa o!"');
        } else if (closestDanfo) {
          riding = closestDanfo;
          if (riding === summoned) summoned = null;
          happened(`rode a danfo${lastStreet ? ` on ${lastStreet}` : ''}`);
          say(pick(['"Ojuelegba! Ojuelegba! Enter with your change o!"', '"Oya, enter! Two hundred naira!"', '"Shift for the man, shift!"', '"Yaba! Yaba! Straight!"', '"Stadium! Stadium!"']));
        } else if (closestLocal) {
          closestLocal.greetAt = now;
          happened(`greeted a local${lastStreet ? ` on ${lastStreet}` : ''}`);
          if (task?.at && task.kind === 'greet' && Math.hypot(task.at.x - pos.x, task.at.z - pos.z) < 45) task.greets++;
          say(pick(['"Bawo ni!"', '"How far?"', '"E kaaro o!"', '"My guy, how body?"', '"Welcome, how you dey?"', '"Nna, kedu?"', '"Sannu!"', ...design.npcLines.map((l) => `"${l}"`)]));
        }
      }

      // ---- locals: walk the pavements, step aside for you; only the nearest are animated ----
      if (spawned) {
        const activeP = Math.min(walkers.length, Math.round(TIERS[tier].people * design.crowd));
        walkers.forEach((w, i) => {
          const root = w.person.root;
          if (i >= activeP) { root.visible = false; return; }
          if (!w.road || root.position.distanceTo(pos) > SIM * 0.7) { spawnWalker(w, pos.x, pos.z); if (!w.road) return; }
          const greeted = now - w.greetAt < 3500;
          const close = root.position.distanceTo(pos) < 1.6 && !riding;
          w.step += ((close ? 1.0 : 0) - w.step) * Math.min(1, dt * 4);
          if (!greeted) w.s += w.dir * w.speed * dt;
          if (w.s > w.road.len || w.s < 0) { nextRoad(w, walkable, false); w.side = rnd() < 0.5 ? 1 : -1; }
          const p = pointAt(w.road, w.s), d = dirAt(w.road, w.s), off = walkerOffset(w);
          root.position.set(p.x - d.y * off, 0.18, p.y + d.x * off);
          const dist = root.position.distanceTo(camera.position);
          root.visible = dist < 140;
          if (!root.visible) return;
          const walkFace = Math.atan2(d.x * w.dir, d.y * w.dir);
          const toYou = Math.atan2(pos.x - root.position.x, pos.z - root.position.z);
          root.rotation.y += angleDiff(root.rotation.y, greeted ? toYou : walkFace) * Math.min(1, dt * 8);
          if (dist < 70 || frameNo % 4 === i % 4) animatePerson(w.person, greeted ? 0 : w.speed, dist < 70 ? dt : dt * 4);
          if (greeted) { w.person.joints.rShoulder.rotation.x = -2.4 + Math.sin(now / 120) * 0.25; w.person.rig?.(); } // a wave
        });
      }

      // ---- the street you're on; your mission's progress ----
      if (now > nextStreet && spawned) {
        nextStreet = now + 700;
        if (task && !task.at) locate();
        if (task?.at && !task.done) {
          const dm = Math.round(Math.hypot(task.at.x - pos.x, task.at.z - pos.z));
          setMissionDist(dm);
          if (dm < 12 && (task.kind !== 'greet' || task.greets >= 2)) {
            task.done = true;
            happened(`finished the mission "${task.title}"`);
            authority.setBeacon(null);
            address('event', '', { event: 'mission_complete', missionTitle: task.title });
          }
        }
        const nr = city.nearestRoad(pos.x, pos.z, (r) => !!r.name);
        const name = nr && nr.d < 40 ? nr.road.name! : '';
        if (name !== lastStreet) { lastStreet = name; setStreet(name || null); }
      }

      // ---- the Authority's drone and weather; soft shadows under everyone and everything that moves ----
      authority.update(dt, now, pos, camera);
      holo.update(now, new THREE.Vector3(pos.x, pos.y + 1.7, pos.z), camera);
      if (handDown && now > handDown) { me.raise = 0; handDown = 0; }
      city.blink(now);
      landmarks?.update(dt, now, night);
      authority.beginShadows();
      if (me.root.visible) authority.shadow(pos.x, 0, pos.z, 1.0, 1.0, 0);
      for (const w of walkers) if (w.person.root.visible && w.person.root.position.distanceTo(pos) < 70) authority.shadow(w.person.root.position.x, 0, w.person.root.position.z, 0.95, 0.95, 0);
      for (const v of vehicles) if (v.mesh.visible && v.pos.distanceTo(pos) < 140) {
        authority.shadow(v.pos.x, v.pos.y, v.pos.z, v.len * 1.15, v.width * 1.4, v.heading);
        authority.glow(v.pos.x, v.pos.y, v.pos.z, v.len * 1.5, v.width * 2.2, v.heading, v.okada ? 0xff2bd6 : 0x00e5ff, 0.55 + 0.6 * night);
      }
      authority.endShadows();

      sky.position.copy(camera.position); // the sky goes where you go

      // ---- camera: behind you (kept out of walls), or high over the city ----
      marker.visible = bird;
      if (bird) {
        camTarget.set(mapTarget.x, birdH, mapTarget.z + birdH * 0.38);
        camera.position.lerp(camTarget, 1 - Math.pow(0.02, dt));
        camera.lookAt(mapTarget.x, 0, mapTarget.z);
        // TEN's beacon: a column of light that stays readable at any height
        marker.position.set(pos.x, 0, pos.z);
        marker.children[0].scale.set(Math.max(1, birdH * 0.012), Math.max(30, birdH * 0.5), Math.max(1, birdH * 0.012));
        marker.children[1].scale.setScalar(Math.max(3, birdH * 0.04));
        markerMat.opacity = 0.45 + Math.sin(now / 250) * 0.15;
      } else {
        // walking: when you haven't touched the camera for a moment, it swings back behind TEN
        const moving = Math.hypot(vel.x, vel.z) > 0.6;
        if (!inCar && !riding && moving && now - lastDrag > 1400) yaw += angleDiff(yaw, me.root.rotation.y + Math.PI) * Math.min(1, dt * 1.6);
        const want = inCar ? 12 : riding ? 11 : camDist;
        const lift = inCar ? 2.6 : riding ? 2 : 1.75;
        // over the right shoulder, so TEN doesn't block the view ahead
        const rx = Math.cos(yaw), rz = -Math.sin(yaw), shoulder = inCar || riding ? 0 : 0.5;
        head.set(pos.x + rx * shoulder, pos.y + lift, pos.z + rz * shoulder);
        camTarget.set(head.x + Math.sin(yaw) * Math.cos(pitch) * want, head.y + Math.sin(pitch) * want, head.z + Math.cos(yaw) * Math.cos(pitch) * want);
        // walls: find how far back the camera can actually go; come in fast, ease back out slowly
        const roomFor = (to: THREE.Vector3) => {
          for (let k = 1; k <= 14; k++) {
            probe.copy(head).lerp(to, k / 14);
            if (city.solidAt(probe.x, probe.y, probe.z)) return Math.max(1.6, (want * (k - 1)) / 14 - 0.4);
          }
          return want;
        };
        let room = roomFor(camTarget);
        // pinned against a wall? a real camera rises to look over the shoulder rather than crowd the head
        if (room < Math.min(want, 4)) {
          const high = Math.min(1.15, pitch + 0.7);
          const up = new THREE.Vector3(head.x + Math.sin(yaw) * Math.cos(high) * want, head.y + Math.sin(high) * want, head.z + Math.cos(yaw) * Math.cos(high) * want);
          const roomUp = roomFor(up);
          if (roomUp > room + 0.5) { camTarget.copy(up); room = roomUp; }
        }
        camDistNow += (room - camDistNow) * (1 - Math.pow(room < camDistNow ? 1e-5 : 0.25, dt));
        const camDir = camTarget.clone().sub(head).normalize(); // (read before camTarget is reset below)
        camTarget.copy(head).addScaledVector(camDir, camDistNow);
        camTarget.y = Math.max(camTarget.y, city.floorAt(camTarget.x, camTarget.z, pos.y + 1) + 0.45); // never under the street or a roof
        camera.position.lerp(camTarget, 1 - Math.pow(inCar ? 0.02 : 0.0004, dt));
        lookNow.lerp(head, 1 - Math.pow(0.0001, dt));
        camera.lookAt(lookNow);
        // the lens widens with speed
        const fovWant = inCar ? 64 + Math.min(10, car.state.vel.length() * 0.25) : Math.hypot(vel.x, vel.z) > 4 ? 63 : 58;
        if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
      }

      // ---- routes: stops once the city's in, the GPS every couple of seconds ----
      if (spawned && now > nextRouting) {
        nextRouting = now + 1800;
        const roads = city.roads();
        busRouter.update(roads, true);
        walkRouter.update(roads, false);
        if (!stopsMade && roads.length > 50) {
          stopsMade = true;
          busRouter.makeStops(realStops, roads);
          if (startAt && !busRouter.stops.some((st) => Math.hypot(st.x - startAt!.x, st.z - startAt!.z) < 120)) busRouter.stops.push({ x: startAt.x, z: startAt.z, name: 'Ojuelegba' });
          buildShelters(busRouter.stops.filter((st) => Math.hypot(st.x - pos.x, st.z - pos.z) < 2500));
        }
        drawGps(task?.at && !task.done ? walkRouter.route(pos.x, pos.z, task.at.x, task.at.z) : null);
      }
      // the waypoint marker
      if (task?.at && !task.done && !bird && !introOn) {
        const v3 = new THREE.Vector3(task.at.x, 3, task.at.z).project(camera);
        const w = el.clientWidth, h = el.clientHeight, behind = v3.z > 1;
        let sx = ((v3.x + 1) / 2) * w, sy = ((1 - v3.y) / 2) * h;
        if (behind) { sx = w - sx; sy = h - 40; }
        const m = 30;
        sx = Math.max(m, Math.min(w - m, sx)); sy = Math.max(m + 60, Math.min(h - m - 60, sy));
        const dist = Math.hypot(task.at.x - pos.x, task.at.z - pos.z);
        wpText.textContent = dist > 999 ? `${(dist / 1000).toFixed(1)} KM` : `${Math.round(dist)} M`;
        wp.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%)`;
      } else wp.style.transform = 'translate(-9999px,0)';

      // ---- the HUD's feed: where you are, which way you look, what's marked ----
      {
        const f = feed.current;
        f.x = pos.x; f.z = pos.z;
        f.bearing = bird ? 0 : (((-yaw) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        f.inCar = inCar;
        f.alt = inCar ? Math.max(0, car.state.pos.y - city.floorAt(car.state.pos.x, car.state.pos.z, car.state.pos.y + 0.5) - 0.5) : 0;
        f.speed = inCar ? car.state.vel.length() : Math.hypot(vel.x, vel.z);
        f.target = task?.at && !task.done ? { x: task.at.x, z: task.at.z } : null;
        f.tower = plaza.placed ? { x: plaza.x, z: plaza.z } : null;
        f.car = car.state.mode === 'parked' ? { x: car.state.pos.x, z: car.state.pos.z } : null;
        f.roads = () => city.roads();
        f.route = gpsPath ? gpsPath.pts : null;
      }

      // the near plane follows the camera's height: depth precision goes where it's needed, so the
      // ground, its dusty shoulders and the roads (a few centimetres apart) don't flicker from the air
      {
        const above = camera.position.y - city.floorAt(camera.position.x, camera.position.z, camera.position.y);
        const near = THREE.MathUtils.clamp(above * 0.02, 0.35, 6);
        if (Math.abs(camera.near - near) > near * 0.15) { camera.near = near; camera.updateProjectionMatrix(); }
      }

      // ---- the intro, scripted ----
      if (introOn) {
        introT += dt;
        const S = me.root.position;
        vel.set(0, 0, 0);
        if (introStep === 0) { introStep = 1; setCaption('LAGOS · 2099'); }
        if (introStep === 1 && introT > 6) {
          introStep = 2;
          setCaption('OJUELEGBA');
          summonDanfo(); // the danfo that brings you
          introBus = summoned;
        }
        if (introStep === 2 && introT > 9.5) { introStep = 3; setCaption(null); }
        if (introStep === 3 && introT > 12) {
          introStep = 4;
          me.root.visible = true; // you step off
          if (introBus) me.root.rotation.y = introBus.heading + Math.PI / 2;
          say('"Ojuelegba! Ojuelegba! Last stop! Everybody comot!"');
        }
        if (introStep === 4 && introT > 14.5) { introStep = 5; line(`${live.current.look.name}. New face. Everyone in this city earns their place.`); }
        if (introStep === 5 && introT > 19) { introStep = 6; line('I am WYRD. This city runs through me. Do right by it, and it opens to you.'); }
        if (introStep === 6 && introT > 24) { introStep = 7; line("Your first job: Mama Bisi on Ishaga Road is waiting on her pepper. Take it to her."); setTask(firstJob); }
        if (introStep === 7 && introT > 28) endIntro();
        if (introOn) introCam(introT, S);
      }

      // a test can pin the camera beside the player (window.__worldCam = [dx, dy, dz]) to inspect the walk
      const pinCam = (globalThis as { __worldCam?: [number, number, number] }).__worldCam;
      if (pinCam) { camera.position.set(pos.x + pinCam[0], pos.y + pinCam[1], pos.z + pinCam[2]); camera.lookAt(pos.x, pos.y + 0.95, pos.z); }

      // ---- the sun's shadow: a small box round you, refreshed every few frames ----
      if (sun.castShadow) {
        // moving fast (the hover-car), shadows refresh every frame -- otherwise they step and the ground seems to shake
        const every = feed.current.speed > 7 ? 1 : TIERS[tier].shadowEvery;
        if (frameNo % every === 0) {
          // snapped to whole shadow texels so edges don't shimmer as you move
          const box = live.current.bird ? Math.min(160, birdH) : 60, texel = (box * 2) / 1024;
          const sx = Math.round(pos.x / texel) * texel, sz = Math.round(pos.z / texel) * texel;
          sun.position.set(sx, 0, sz).addScaledVector(sunDir, 180);
          sun.target.position.set(sx, 0, sz);
          sun.target.updateMatrixWorld();
          if (sun.shadow.camera.right !== box) {
            Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box });
            sun.shadow.camera.updateProjectionMatrix();
          }
          renderer.shadowMap.needsUpdate = true;
        }
      } else sun.position.copy(sunDir).multiplyScalar(180);

      // district labels, placed over the map
      for (const { d, div } of labels) {
        if (!bird || !landmarks) { div.style.transform = 'translate(-9999px,0)'; continue; }
        const p = landmarks.toWorld(d.at);
        proj.set(p.x, 30, p.y).project(camera);
        const on = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1 && (birdH > 250 || d.name === lastStreet);
        div.style.transform = on ? `translate(${((proj.x + 1) / 2) * el.clientWidth}px, ${((1 - proj.y) / 2) * el.clientHeight}px) translate(-50%,-50%)` : 'translate(-9999px,0)';
      }
      if (TIERS[tier].bloom && composer) composer.render(); else renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('mousemove', onLook);
      canvas.removeEventListener('dblclick', onDbl);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      disposed = true;
      for (const l of labels) l.div.remove();
      wp.remove();
      delete (globalThis as { __world?: unknown }).__world;
      ctl.current = null;
      clearTimeout(lineTimer); clearTimeout(noteTimer); clearTimeout(castTimer);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); });
      });
      envTex.dispose();
      pmrem.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      void audio?.close();
    };
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text || !ask) return;
    ctl.current?.address(ask, text);
    setDraft('');
    setAsk(null);
  };
  const openBoard = () => {
    setBoardOpen(true);
    api.cityCharter().then(setBoard).catch(() => setBoard(null));
  };
  const cycleGfx = () => setGfx((g) => { const n = GFX_NEXT[g]; saveChoice(n); return n; });

  return (
    <View style={StyleSheet.absoluteFill}>
      <View ref={host} style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0f14' }]} />

      {/* ---- hurt: the edges flash red ---- */}
      {hurtFlash ? <View style={styles.hurt} pointerEvents="none" /> : null}
      {down ? (
        <View style={styles.downShade} pointerEvents="none">
          <Display style={styles.downTitle}>{down}</Display>
          <Mono style={styles.downSmall}>{down === 'OUT OF LIVES' ? 'WYRD IS BRINGING YOU BACK…' : 'GETTING BACK UP…'}</Mono>
        </View>
      ) : null}

      {intro ? (
        <>
          <View style={styles.letterTop} pointerEvents="none" />
          <View style={styles.letterBottom} pointerEvents="none" />
          {caption ? <View style={styles.captionBox} pointerEvents="none"><Display style={styles.caption}>{caption}</Display><Mono style={styles.captionSmall}>NAIJA 2099</Mono></View> : null}
          {authLine ? (
            <View style={styles.introLine} pointerEvents="none">
              <Mono style={styles.commsEyebrow}>◉ WYRD · THE AUTHORITY</Mono>
              <Mono style={styles.commsText}>{authLine}</Mono>
            </View>
          ) : null}
          {speech ? <View style={styles.introSpeech} pointerEvents="none"><Mono style={styles.speechText}>{speech}</Mono></View> : null}
          <Pressable onPress={() => ctl.current?.skipIntro()} style={styles.skip}><Mono style={styles.skipText}>SKIP ›  SPACE</Mono></Pressable>
        </>
      ) : null}

      {/* ---- top left: who you are, where you are ---- */}
      <View style={[styles.topLeft, shrink && { ...shrink, transformOrigin: 'top left' }, intro && { opacity: 0 }]} pointerEvents="none">
        <Panel style={styles.idCard}>
          <Mono style={styles.idEyebrow}>NAIJA 2099 · {(standing?.rank ?? 'Newcomer').toUpperCase()}</Mono>
          <Display style={styles.idName} numberOfLines={1}>{look.name}</Display>
          <View style={styles.vitals}>
            <View style={styles.hpBar}><View style={[styles.hpFill, { width: `${vitals.hp}%`, backgroundColor: vitals.hp > 60 ? '#1aff9c' : vitals.hp > 30 ? '#ffc400' : '#ff3b30' }]} /></View>
            <Mono style={styles.lifePips}>{'◆'.repeat(vitals.lives)}<Mono style={styles.lifeGone}>{'◇'.repeat(Math.max(0, 3 - vitals.lives))}</Mono></Mono>
          </View>
          <Mono style={styles.idSmall}>HEALTH {vitals.hp} · LIVES {vitals.lives}</Mono>
          {standing ? (
            <>
              <StandingBar value={standing.standing} />
              <Mono style={styles.idSmall}>STANDING {standing.standing > 0 ? '+' : ''}{standing.standing} · {standing.missionsDone} MISSION{standing.missionsDone === 1 ? '' : 'S'}</Mono>
            </>
          ) : null}
          <View style={styles.idRule} />
          <Mono style={styles.idStreet} numberOfLines={1}>{street ?? 'Ojuelegba'}</Mono>
          <Mono style={styles.idSmall}>LAGOS {fmtHour()} · {weatherNow.toUpperCase()} · WYRD FEELS {(mind?.mood ?? '…').toUpperCase()}</Mono>
        </Panel>
      </View>

      {/* ---- top centre: compass ---- */}
      {!bird && !intro ? <View style={styles.topCentre} pointerEvents="none"><Compass feed={feed} /></View> : null}

      {/* ---- top right: menu, minimap, mission ---- */}
      <View style={[styles.topRight, shrink && { ...shrink, transformOrigin: 'top right' }, intro && { opacity: 0 }]} pointerEvents={intro ? 'none' : 'box-none'}>
        <View style={styles.topButtons}>
          <Pressable onPress={() => setAsk('speak')} style={styles.iconBtn} accessibilityLabel="Speak to WYRD (T)"><Mono style={styles.iconText}>WYRD · T</Mono></Pressable>
          <Pressable onPress={() => setBird((b) => !b)} style={[styles.iconBtn, bird && styles.iconOn]} accessibilityLabel="Map (V)"><Mono style={[styles.iconText, bird && { color: colors.onSignal }]}>{bird ? 'STREET · V' : 'MAP · V'}</Mono></Pressable>
          <Pressable onPress={() => setMenu(true)} style={styles.iconBtn} accessibilityLabel="Menu (Esc)"><Mono style={styles.iconText}>≡ MENU</Mono></Pressable>
        </View>
        {!bird ? <Minimap feed={feed} /> : null}
        {mission ? (
          <Panel style={styles.tracker} accent="#ffc400">
            <Mono style={styles.trackerEyebrow}>◆ {mission.kind.toUpperCase()} · +{mission.reward} STANDING</Mono>
            <Mono style={styles.trackerTitle}>{mission.title}</Mono>
            <Mono style={styles.trackerBrief} numberOfLines={3}>{mission.brief}</Mono>
            <Mono style={styles.trackerWhere}>{mission.street ?? 'The marked place'}{missionDist != null ? ` · ${missionDist > 999 ? `${(missionDist / 1000).toFixed(1)} km` : `${missionDist} m`}` : ''}</Mono>
          </Panel>
        ) : null}
      </View>

      {bird ? (
        <View style={styles.mapBar}>
          <Pressable onPress={() => ctl.current?.findMe()} style={styles.iconBtn}><Mono style={styles.iconText}>FIND {look.name.toUpperCase()}</Mono></Pressable>
          <Mono style={styles.mapHelp}>DRAG TO EXPLORE · WHEEL TO ZOOM · CLICK A DISTRICT TO FLY THERE</Mono>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading} pointerEvents="none"><Mono style={styles.loadingText}>DRAWING LAGOS FROM THE MAP…</Mono></View>
      ) : null}
      {broadcast ? (
        <View style={styles.broadcast} pointerEvents="none"><Mono style={styles.broadcastText}>◢ WYRD · CITY-WIDE ◣  {broadcast}</Mono></View>
      ) : null}

      {/* ---- bottom centre: WYRD's comms, the prompt ---- */}
      <View style={[styles.bottomCentre, intro && { opacity: 0 }]} pointerEvents="none">
        {thought ? <Mono style={styles.thoughtText}>WYRD IS THINKING · {thought}</Mono> : null}
        {authLine || thinking ? (
          <Panel style={styles.comms} accent="#4a6bff">
            <Mono style={styles.commsEyebrow}>◉ WYRD · THE AUTHORITY</Mono>
            <Mono style={styles.commsText}>{thinking ? '…' : authLine}</Mono>
            {authNote ? <Mono style={styles.commsNote}>{authNote}</Mono> : null}
          </Panel>
        ) : null}
        {speech ? <Panel style={styles.speechPanel}><Mono style={styles.speechText}>{speech}</Mono></Panel> : null}
        {hint ? (
          <View style={styles.prompt}>
            {/^([A-Z]+) TO /.test(hint) ? <KeyCap k={hint.split(' ')[0]} /> : null}
            <Mono style={styles.promptText}>{/^([A-Z]+) TO /.test(hint) ? hint.replace(/^[A-Z]+ TO /, '') : hint}</Mono>
          </View>
        ) : null}
      </View>

      {/* ---- bottom left: the car's gauges, or the controls (for a while) ---- */}
      <View style={[styles.bottomLeft, intro && { opacity: 0 }]} pointerEvents="none">
        {flying ? <VehicleGauges feed={feed} /> : showHelp && !bird && !touch && !compact ? (
          <Panel style={styles.controls}>
            <Mono style={styles.idEyebrow}>CONTROLS</Mono>
            {[['WASD', 'walk'], ['SHIFT', 'run'], ['SPACE', 'jump'], ['E', 'act'], ['F', 'hover-car'], ['T', 'speak to WYRD'], ['V', 'map'], ['ESC', 'menu']].map(([k, t]) => (
              <View key={k} style={styles.ctrlRow}><KeyCap k={k} /><Mono style={styles.ctrlText}>{t}</Mono></View>
            ))}
            <Mono style={styles.idSmall}>DRAG TO LOOK · DOUBLE-CLICK FOR FREE LOOK · WHEEL TO ZOOM</Mono>
          </Panel>
        ) : null}
      </View>

      {/* ---- touch: act, jump, car ---- */}
      {touch && !bird ? (
        <View style={styles.touchPad}>
          <Pressable onPress={() => ctl.current?.act()} style={styles.touchBtn}><Mono style={styles.touchText}>ACT</Mono></Pressable>
          <Pressable onPress={() => ctl.current?.jump()} style={styles.touchBtn}><Mono style={styles.touchText}>JUMP</Mono></Pressable>
          {!flying ? <Pressable onPress={() => ctl.current?.callCar()} style={styles.touchBtn}><Mono style={styles.touchText}>CAR</Mono></Pressable> : null}
        </View>
      ) : null}

      {/* ---- panels that take over the screen ---- */}
      {ask ? (
        <View style={styles.ask}>
          <Mono style={styles.commsEyebrow}>{ask === 'petition' ? "PETITION AT WYRD'S TOWER" : ask === 'drone' ? "ANSWER WYRD'S DRONE" : 'SPEAK TO WYRD'}</Mono>
          <TextInput
            autoFocus value={draft} onChangeText={setDraft} onSubmitEditing={send} maxLength={600}
            placeholder={ask === 'petition' ? 'What do you ask of the Authority?' : 'Say something to WYRD…'}
            placeholderTextColor="#8a8f99" style={styles.askInput} returnKeyType="send"
          />
          <View style={styles.askRow}>
            <Pressable onPress={() => { setAsk(null); setDraft(''); }} style={styles.btn}><Mono style={styles.btnText}>CANCEL</Mono></Pressable>
            <Pressable onPress={send} style={[styles.btn, styles.btnOn]}><Mono style={[styles.btnText, styles.btnTextOn]}>SEND</Mono></Pressable>
          </View>
        </View>
      ) : null}
      {boardOpen ? (
        <View style={styles.board}>
          <Mono style={styles.commsEyebrow}>THE AUTHORITY · {board?.author === 'wyrd' ? 'WRITTEN BY WYRD' : "WYRD'S FIRST CHARTER"}</Mono>
          <ScrollView style={{ maxHeight: 420 }}>
            <Mono style={styles.charter}>{board?.charter ?? 'Reading the charter…'}</Mono>
            <Mono style={[styles.commsEyebrow, { marginTop: 12 }]}>MISSIONS ON THE BOARD</Mono>
            {(board?.missions ?? []).map((m) => (
              <Pressable key={m.id ?? m.title} style={styles.boardItem} onPress={() => { setBoardOpen(false); ctl.current?.address('speak', `I'd like the mission "${m.title}" from your board.`); }}>
                <Mono style={styles.missionTitle}>{m.title} · +{m.reward}</Mono>
                <Mono style={styles.missionBrief}>{m.brief}</Mono>
                <Mono style={styles.missionWhere}>{m.street} · {m.kind}</Mono>
              </Pressable>
            ))}
          </ScrollView>
          {training ? (
            <Pressable onPress={() => answerTraining(!training.optIn)} style={styles.consentRow} accessibilityLabel="Let WYRD learn from your play">
              <Mono style={styles.consentText}>{training.optIn ? '■' : '□'}  LET WYRD LEARN FROM MY PLAY</Mono>
              <Mono style={styles.consentSmall}>What you say and do here helps train WYRD (personal details removed). Change it any time.</Mono>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setBoardOpen(false)} style={[styles.btn, { alignSelf: 'flex-end', marginTop: 8 }]}><Mono style={styles.btnText}>CLOSE</Mono></Pressable>
        </View>
      ) : null}
      {training && !training.asked ? (
        <View style={styles.consent}>
          <Mono style={styles.commsEyebrow}>WYRD · THE AUTHORITY</Mono>
          <Mono style={styles.commsText}>I learn from this city as it's lived in. May I learn from your play -- what you say to me, the missions you take, how they turn out?</Mono>
          <Mono style={styles.consentSmall}>It helps train WYRD. Personal details (emails, numbers, links) are stripped before anything is kept, and it's kept for at most 180 days. You can change your mind any time in the AUTHORITY panel.</Mono>
          <View style={styles.askRow}>
            <Pressable onPress={() => answerTraining(false)} style={styles.btn}><Mono style={styles.btnText}>NOT NOW</Mono></Pressable>
            <Pressable onPress={() => answerTraining(true)} style={[styles.btn, styles.btnOn]}><Mono style={[styles.btnText, styles.btnTextOn]}>YES, LEARN FROM MY PLAY</Mono></Pressable>
          </View>
        </View>
      ) : null}
      {menu ? (
        <PauseMenu
          name={look.name}
          onClose={() => setMenu(false)}
          items={[
            { label: 'CHARACTER', hint: 'your look', onPress: () => { setMenu(false); setEditing(true); } },
            { label: 'THE AUTHORITY', hint: 'charter · missions', onPress: () => { setMenu(false); openBoard(); } },
            ...(canDesign ? [{ label: 'DESIGN WITH WYRD', hint: 'owner', onPress: () => { setMenu(false); setStudioOpen(true); } }] : []),
            { label: `GRAPHICS · ${gfx === 'auto' ? `AUTO (${tierNow.toUpperCase()})` : gfx.toUpperCase()}`, hint: 'tap to change', onPress: cycleGfx },
            ...(!flying ? [{ label: 'CALL THE HOVER-CAR', hint: 'F', onPress: () => { setMenu(false); ctl.current?.callCar(); } }] : []),
            { label: 'LEAVE LAGOS', danger: true, onPress: onExit },
          ]}
        />
      ) : null}
      {editing ? (
        <CharacterCreator initial={look} onCancel={() => setEditing(false)} onDone={(l) => { onLook(l); ctl.current?.setLook(l); setEditing(false); }} />
      ) : null}
      {studioOpen ? <DesignStudio onClose={() => setStudioOpen(false)} onApplied={() => ctl.current?.reloadDesign()} /> : null}
      <View style={styles.osm} pointerEvents="none">
        <Mono style={styles.osmText}>Map data © OpenStreetMap contributors</Mono>
      </View>
    </View>
  );
}

const angleDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const fmtHour = () => { const h = lagosHour(); return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };

const styles = StyleSheet.create({
  topLeft: { position: 'absolute', top: 14, left: 14, maxWidth: 300 },
  letterTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '11%', backgroundColor: '#000' },
  letterBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '11%', backgroundColor: '#000' },
  captionBox: { position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center', gap: 4 },
  caption: { fontSize: 46, lineHeight: 50, color: '#ffffff', letterSpacing: 6 },
  captionSmall: { fontSize: 11, letterSpacing: 4, color: '#00e5ff' },
  introLine: { position: 'absolute', bottom: '14%', alignSelf: 'center', maxWidth: 620, backgroundColor: 'rgba(10,12,18,0.82)', borderLeftWidth: 2, borderLeftColor: '#4a6bff', paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
  introSpeech: { position: 'absolute', bottom: '26%', alignSelf: 'center', maxWidth: 520, backgroundColor: 'rgba(10,12,18,0.82)', paddingHorizontal: 14, paddingVertical: 8 },
  skip: { position: 'absolute', bottom: '3.5%', right: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  skipText: { fontSize: 10, letterSpacing: 2, color: '#ffffff' },
  vitals: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  hpBar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.12)' },
  hpFill: { height: 6 },
  lifePips: { fontSize: 12, color: '#ff2bd6', letterSpacing: 2 },
  lifeGone: { fontSize: 12, color: '#5a5e68', letterSpacing: 2 },
  hurt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 26, borderColor: 'rgba(255,40,40,0.35)' },
  downShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(40,0,8,0.55)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  downTitle: { fontSize: 38, lineHeight: 42, color: '#ffffff', letterSpacing: 2 },
  downSmall: { fontSize: 11, letterSpacing: 2.4, color: '#ffb0b8' },
  idCard: { gap: 2, minWidth: 230 },
  idEyebrow: { fontSize: 9, letterSpacing: 2.2, color: '#8ea0ff' },
  idName: { fontSize: 26, lineHeight: 30, color: '#ffffff' },
  idSmall: { fontSize: 9, letterSpacing: 1.4, color: '#9aa3b2', marginTop: 3 },
  idRule: { height: 1, backgroundColor: 'rgba(0,229,255,0.25)', marginVertical: 6 },
  idStreet: { fontSize: 13, color: '#00e5ff', letterSpacing: 0.6 },
  topCentre: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  topRight: { position: 'absolute', top: 14, right: 14, alignItems: 'flex-end', gap: 10, maxWidth: 260 },
  topButtons: { flexDirection: 'row', gap: 6 },
  iconBtn: { backgroundColor: 'rgba(10,12,18,0.78)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.35)', paddingHorizontal: 10, paddingVertical: 7 },
  iconOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  iconText: { fontSize: 10, letterSpacing: 1.6, color: '#e6e8ee' },
  tracker: { width: 240, gap: 3 },
  trackerEyebrow: { fontSize: 9, letterSpacing: 1.8, color: '#ffc400' },
  trackerTitle: { fontSize: 13.5, color: '#ffffff' },
  trackerBrief: { fontSize: 10.5, color: '#b8bfcc', lineHeight: 15 },
  trackerWhere: { fontSize: 9.5, letterSpacing: 1.2, color: '#00e5ff', marginTop: 2 },
  mapBar: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', gap: 8 },
  mapHelp: { fontSize: 9.5, letterSpacing: 1.6, color: '#e6e8ee', backgroundColor: 'rgba(10,12,18,0.7)', paddingHorizontal: 10, paddingVertical: 4 },
  bottomCentre: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center', gap: 10 },
  comms: { maxWidth: 560, gap: 4 },
  commsEyebrow: { fontSize: 9, letterSpacing: 2, color: '#8ea0ff' },
  commsText: { fontSize: 14, color: '#ffffff', lineHeight: 20 },
  commsNote: { fontSize: 10, letterSpacing: 1.4, color: '#ffc400' },
  speechPanel: { maxWidth: 520 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(10,12,18,0.8)', paddingHorizontal: 12, paddingVertical: 6, borderLeftWidth: 2, borderLeftColor: '#00e5ff' },
  promptText: { fontSize: 11, letterSpacing: 1.6, color: '#ffffff' },
  bottomLeft: { position: 'absolute', bottom: 24, left: 14 },
  controls: { gap: 4, minWidth: 180 },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctrlText: { fontSize: 10.5, color: '#d6d9e0' },
  touchPad: { position: 'absolute', bottom: 90, right: 18, gap: 10, alignItems: 'flex-end' },
  touchBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(10,12,18,0.7)', borderWidth: 1.5, borderColor: '#00e5ff', alignItems: 'center', justifyContent: 'center' },
  touchText: { fontSize: 10, letterSpacing: 1.4, color: '#ffffff' },
  hud: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 16, gap: 12 },
  title: { gap: 2, flexShrink: 1 },
  eyebrow: { fontSize: 9.5, letterSpacing: 2.4, color: colors.mint },
  name: { fontSize: 36, lineHeight: 38, color: colors.mint },
  mood: { fontSize: 11, color: colors.mint },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, alignSelf: 'flex-start' },
  btn: { backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: colors.mint, paddingHorizontal: 12, paddingVertical: 8 },
  btnOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  btnText: { fontSize: 11, letterSpacing: 1.8, color: colors.mint },
  btnTextOn: { color: colors.onSignal },
  loading: { position: 'absolute', top: '48%', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 14, paddingVertical: 8 },
  loadingText: { fontSize: 12, letterSpacing: 2, color: colors.mint },
  thought: { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: colors.signal, paddingHorizontal: 14, paddingVertical: 8 },
  thoughtText: { fontSize: 12, color: colors.onSignal, letterSpacing: 0.6 },
  speech: { position: 'absolute', bottom: 110, alignSelf: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: colors.mint, paddingHorizontal: 16, paddingVertical: 10, maxWidth: 520 },
  speechText: { fontSize: 13, color: colors.mint, textAlign: 'center' },
  hint: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: '#f2c200', paddingHorizontal: 12, paddingVertical: 6 },
  hintText: { fontSize: 11, letterSpacing: 1.4, color: '#16171a' },
  help: { position: 'absolute', bottom: 14, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 12, paddingVertical: 6 },
  helpText: { fontSize: 10.5, color: colors.mint },
  rank: { fontSize: 10, letterSpacing: 1.6, color: colors.signal, marginTop: 2 },
  broadcast: { position: 'absolute', top: 96, alignSelf: 'center', backgroundColor: '#16171a', paddingHorizontal: 14, paddingVertical: 7, maxWidth: 640 },
  broadcastText: { fontSize: 12, letterSpacing: 1.2, color: '#f2c200', textAlign: 'center' },
  mission: { position: 'absolute', top: 150, left: 16, width: 280, backgroundColor: 'rgba(255,255,255,0.93)', borderLeftWidth: 3, borderLeftColor: colors.signal, padding: 10, gap: 3 },
  missionEyebrow: { fontSize: 9, letterSpacing: 1.8, color: colors.signal },
  missionTitle: { fontSize: 14, color: colors.mint },
  missionBrief: { fontSize: 11, color: colors.mint, opacity: 0.85 },
  missionWhere: { fontSize: 10, letterSpacing: 1, color: colors.mint, opacity: 0.7 },
  auth: { position: 'absolute', bottom: 150, alignSelf: 'center', backgroundColor: 'rgba(22,23,26,0.92)', borderLeftWidth: 3, borderLeftColor: colors.signal, paddingHorizontal: 16, paddingVertical: 10, maxWidth: 560, gap: 4 },
  authEyebrow: { fontSize: 9, letterSpacing: 2, color: '#8ea0ff' },
  authText: { fontSize: 14, color: '#ffffff', lineHeight: 20 },
  authNote: { fontSize: 10, letterSpacing: 1.4, color: '#f2c200' },
  ask: { position: 'absolute', bottom: 150, alignSelf: 'center', width: 520, maxWidth: '92%', backgroundColor: 'rgba(22,23,26,0.95)', padding: 14, gap: 10 },
  askInput: { backgroundColor: '#ffffff', color: '#16171a', fontSize: 14, paddingHorizontal: 10, paddingVertical: 8 },
  askRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  board: { position: 'absolute', top: 80, alignSelf: 'center', width: 560, maxWidth: '94%', backgroundColor: 'rgba(22,23,26,0.96)', padding: 16 },
  charter: { fontSize: 13, color: '#ffffff', lineHeight: 20 },
  boardItem: { marginTop: 8, padding: 10, backgroundColor: 'rgba(255,255,255,0.93)', gap: 2 },
  consent: { position: 'absolute', top: 120, alignSelf: 'center', width: 540, maxWidth: '92%', backgroundColor: 'rgba(22,23,26,0.96)', borderLeftWidth: 3, borderLeftColor: colors.signal, padding: 16, gap: 10 },
  consentRow: { marginTop: 12, padding: 10, backgroundColor: 'rgba(255,255,255,0.06)', gap: 4 },
  consentText: { fontSize: 11, letterSpacing: 1.6, color: '#ffffff' },
  consentSmall: { fontSize: 10.5, color: '#9aa0aa', lineHeight: 16 },
  osm: { position: 'absolute', bottom: 4, right: 6, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 6, paddingVertical: 2 },
  osmText: { fontSize: 9, color: colors.mint },
});
