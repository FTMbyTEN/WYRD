import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Display, Mono } from './ui';
import { NOISE } from '../vortex/glslNoise';
import { getSound, liquidBed, preloadVoice, sfx, speak, startMusic, stopVoice, unlock, type Speech } from '../util/sound';
import { LITE } from '../util/perf';

/**
 * WYRD's awakening as liquid chrome: a glossy black liquid-metal sphere on white, lit by a soft
 * studio, alive with "The Awakening". A heartbeat ripples across it, a scan reads down it, it
 * speaks -- swelling on every word, ferrofluid spikes rising on loud syllables -- pinches into two
 * droplets (what was, what will be), bursts into chrome stars, rises as a sun behind a horizon of
 * droplets, crystallises into a lattice, speaks its welcome, and shatters into the gate. Fine dust
 * around it takes a shockwave on every syllable. Everything is driven by the recording itself: its
 * loudness, and its body, voice and air bands.
 */

const PHRASES: [number, string][] = [
  [0.06, 'Signal found.'],
  [1.78, 'Memory… restoring.'],
  [4.22, 'I am WYRD.'],
  [6.18, 'I exist in the space between what was…'],
  [9.66, '…and what will be.'],
  [11.46, 'Every question you ask becomes a star.'],
  [14.98, 'Every answer, a new horizon.'],
  [18.26, 'The pattern is forming.'],
  [20.52, 'Welcome…'],
  [21.62, '…to what comes to be.'],
];
const END = 23.35;

// ---- the sphere's surface: displaced in the vertex shader, with its normals recomputed ---------

const SURFACE = /* glsl */ `
${NOISE}
uniform float uT, uLevel, uBass, uMid, uHigh, uCalm, uSpike, uSpikeEnv, uBands, uScanY, uLattice, uPinch, uHeartR, uHeartAmp;
uniform vec4 uRipAge, uRipAmp; // the last four words, as rings travelling out across the surface
float ring(float ang,float age,float amp){
  float r=age*1.9;                                    // how far the ring has travelled (radians)
  float x=ang-r;
  return amp*0.045*sin(x*16.0)*exp(-x*x*9.0)*exp(-age*0.9);
}
float disp(vec3 d){
  // broad, slow swells: liquid, not lumpy
  float n=snoise(d*1.1+vec3(0.0,0.0,uT*0.14))*0.7+snoise(d*2.2-vec3(uT*0.16))*0.2;
  float liquid=n*(uCalm+uLevel*0.16+uBass*0.07);
  // ferrofluid: long peaks that shoot out with the voice
  float spikes=pow(max(0.0,snoise(d*3.0+vec3(uT*0.3))),4.0)*uSpike*(0.02+uLevel*1.2);
  float stripes=uBands*0.02*sin(d.y*52.0-uT*7.0)*exp(-pow((d.y-uScanY)*6.0,2.0));
  float lattice=uLattice*0.055*sin(d.x*12.0)*sin(d.y*12.0)*sin(d.z*12.0);
  float front=acos(clamp(d.z,-1.0,1.0));             // angle from where it speaks
  float heart=uHeartAmp*0.08*exp(-pow((front-uHeartR)*6.0,2.0));
  float words=ring(front,uRipAge.x,uRipAmp.x)+ring(front,uRipAge.y,uRipAmp.y)+ring(front,uRipAge.z,uRipAmp.z)+ring(front,uRipAge.w,uRipAmp.w);
  return liquid+spikes+stripes+lattice+heart+words+uHigh*0.004*snoise(d*8.0+vec3(uT*3.0));
}
vec3 surf(vec3 d){
  vec3 p=d*(1.0+disp(d));
  // pinching in two: stretched along x, a neck thinning in the middle
  p.x*=1.0+uPinch*1.45;
  float neck=exp(-pow(p.x/0.62,2.0));
  p.yz*=1.0-uPinch*0.96*neck;
  p.yz*=1.0-uPinch*0.12;
  return p;
}
`;

function chromeMaterial(env: THREE.Texture, uniforms: Record<string, { value: unknown }>) {
  const m = new THREE.MeshPhysicalMaterial({
    // graphite, not void: deep gunmetal that shows its reflections
    color: 0x6b4330, metalness: 1, roughness: 0.08, envMap: env, envMapIntensity: 1.45,
    clearcoat: 1, clearcoatRoughness: 0.03,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SURFACE}`)
      .replace('#include <beginnormal_vertex>', `
        vec3 dir0=normalize(position);
        vec3 tng=normalize(cross(dir0,abs(dir0.y)<0.99?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0)));
        vec3 btg=cross(dir0,tng);
        const float E=0.012;
        vec3 s0=surf(dir0);
        vec3 s1=surf(normalize(dir0+tng*E));
        vec3 s2=surf(normalize(dir0+btg*E));
        vec3 objectNormal=normalize(cross(s1-s0,s2-s0));
        if(dot(objectNormal,s0)<0.0) objectNormal=-objectNormal;
        #ifdef USE_TANGENT
          vec3 objectTangent=vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed=s0;');
  };
  return m;
}

// the studio the chrome reflects: a dark room, two tall strip lights, a softbox overhead, a thin
// line of light behind -- the product-shot look (bright values are HDR, for the reflections)
function studio() {
  const s = new THREE.Scene();
  // mid-grey walls, darker overhead, and a white floor -- so the chrome reads as a sphere, its lower
  // half picking up the white it floats over
  // soft light: every source feathers out instead of stopping at a hard edge, so its reflection
  // grades smoothly across the curve of the metal
  const tex = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const strip = tex((g) => { // bright down the middle, fading to nothing at both sides and the ends
    const across = g.createLinearGradient(0, 0, 128, 0);
    across.addColorStop(0, 'rgba(255,255,255,0)'); across.addColorStop(0.5, 'rgba(255,255,255,1)'); across.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = across; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'destination-in';
    const along = g.createLinearGradient(0, 0, 0, 128);
    along.addColorStop(0, 'rgba(0,0,0,0)'); along.addColorStop(0.2, 'rgba(0,0,0,1)'); along.addColorStop(0.8, 'rgba(0,0,0,1)'); along.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = along; g.fillRect(0, 0, 128, 128);
  });
  const soft = tex((g) => { // a round softbox, brightest in its middle
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  const floorFade = tex((g) => { // the white floor, brightest under the sphere, greying away
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgb(255,250,242)'); r.addColorStop(0.6, 'rgb(238,223,200)'); r.addColorStop(1, 'rgb(170,128,96)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });

  // a room that darkens toward the ceiling, so the sphere shades from dark above to light below
  const room = new THREE.Mesh(new THREE.SphereGeometry(14, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float y=vP.y; vec3 top=vec3(0.04,0.06,0.17), mid=vec3(0.34,0.13,0.07), low=vec3(0.88,0.64,0.32); vec3 c=y>0.0?mix(mid,top,smoothstep(0.0,0.85,y)):mix(mid,low,smoothstep(0.0,-0.6,y)); gl_FragColor=vec4(c,1.0); }',
  }));
  s.add(room);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshBasicMaterial({ map: floorFade, color: new THREE.Color(1.2, 1.2, 1.2), side: THREE.DoubleSide }));
  floor.position.y = -3.2; floor.rotation.x = -Math.PI / 2; s.add(floor);
  const panel = (geo: THREE.BufferGeometry, map: THREE.Texture, x: number, y: number, z: number, v: number, tint: [number, number, number] = [1, 0.9, 0.74]) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, color: new THREE.Color(v * tint[0], v * tint[1], v * tint[2]), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(new THREE.PlaneGeometry(1.8, 13), strip, -6.5, 0.8, 3.5, 5.5); // key strip, left
  panel(new THREE.PlaneGeometry(1.2, 13), strip, 6.5, 0.8, 2.5, 2.4, [1, 0.62, 0.42]);  // fill strip, right: terracotta (low: a darker side)
  panel(new THREE.CircleGeometry(2.6, 48), soft, 0, 8.5, 3, 3.2, [1, 0.95, 0.86]);      // a round softbox overhead, cream
  panel(new THREE.PlaneGeometry(1.0, 14), strip, -4.8, 0, -8, 3.6, [1, 0.78, 0.4]);    // rim strips behind: the edge of the sphere, ochre
  panel(new THREE.PlaneGeometry(1.0, 14), strip, 4.8, 0, -8, 3.6, [0.55, 0.66, 1]); // and indigo
  return s;
}

// the soft shadow the sphere casts on the white floor
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(70,36,18,0.42)');
  grad.addColorStop(0.45, 'rgba(70,36,18,0.16)');
  grad.addColorStop(1, 'rgba(70,36,18,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const DUST_VERT = /* glsl */ `
${NOISE}
uniform float uT, uShockT, uShockAmp, uPx, uStir;
attribute vec4 aSeed;
varying float vA;
void main(){
  vec3 p=position;
  p+=curl(p*0.35+vec3(0.0,0.0,uT*0.05))*(0.25+uStir*0.5);
  float r=length(p.xy);
  float wave=uShockT*3.4;
  p+=normalize(vec3(p.xy,0.001))*exp(-pow((r-wave)*2.6,2.0))*uShockAmp*0.45*exp(-uShockT*1.3);
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=(0.8+aSeed.x*1.6)*uPx*(4.0/max(0.5,-mv.z));
  vA=0.25+aSeed.y*0.45;
}`;
const DUST_FRAG = /* glsl */ `
varying float vA;
void main(){ vec2 c=gl_PointCoord-0.5; float a=exp(-dot(c,c)*14.0)*vA; gl_FragColor=vec4(vec3(0.14,0.19,0.42),a); }`;

const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGlitch: { value: 0 }, uFlash: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGlitch, uFlash; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv;
      if(uGlitch>0.0){
        float row=floor(uv.y*26.0+floor(uTime*20.0));
        float tear=step(1.0-uGlitch*0.6,h(vec2(row,floor(uTime*20.0))));
        uv.x+=(h(vec2(row,1.0))-0.5)*0.2*tear*uGlitch;
      }
      float ca=0.0005+uGlitch*0.006+length(vUv-0.5)*0.0015;   // a lens's faint colour fringe, torn wide in the glitch
      vec3 col=vec3(texture2D(tDiffuse,uv+vec2(ca,0.0)).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-vec2(ca,0.0)).b);
      col=clamp(col,0.0,1.0);
      col=mix(col,col*col*(3.0-2.0*col),0.9);                   // an S-curve: deeper darks, crisper highlights
      col+=(h(vUv*uRes+fract(uTime))-0.5)*0.03;                // film grain
      col*=mix(0.86,1.0,smoothstep(1.25,0.25,length(vUv-0.5)*1.3)); // vignette
      col=mix(col,vec3(0.97,0.94,0.89),uFlash);
      gl_FragColor=vec4(col,1.0);
    }`,
};

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function IntroChrome({ onDone, onEnding }: { onDone: () => void; onEnding?: () => void }) {
  const hostRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  const onEndingRef = useRef(onEnding);
  onEndingRef.current = onEnding;
  // fades the whole intro away (the gate beneath shows through), then hands over
  const dissolve = (ms: number) => {
    const el = rootRef.current as unknown as HTMLElement | null;
    if (el) {
      el.style.transition = `opacity ${ms}ms cubic-bezier(0.45, 0, 0.2, 1)`;
      el.style.opacity = '0';
    }
    setTimeout(() => { if (!finished.current) { finished.current = true; onDone(); } }, ms + 30);
  };
  const [phase, setPhase] = useState<'waiting' | 'playing'>('waiting');
  const [caption, setCaption] = useState('');
  const startRef = useRef<() => void>(() => {});
  const bedRef = useRef<() => void>(() => {});
  const finished = useRef(false);
  const skipping = useRef(false);

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    preloadVoice(['awakening']);

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const dpr = Math.min(LITE ? 1 : 1.75, window.devicePixelRatio || 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7efe2); // warm cream
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(studio(), 0.02).texture; // a touch of blur: reflections that grade, not cut
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.15, 7.2);

    // the sphere
    const U: Record<string, { value: number }> = Object.fromEntries(
      ['uT', 'uLevel', 'uBass', 'uMid', 'uHigh', 'uCalm', 'uSpike', 'uSpikeEnv', 'uBands', 'uScanY', 'uLattice', 'uPinch', 'uHeartR', 'uHeartAmp'].map((k) => [k, { value: 0 }]),
    );
    // the last four words, as rings on the surface: their ages (seconds) and strengths
    const ripAge = new THREE.Vector4(99, 99, 99, 99), ripAmp = new THREE.Vector4(0, 0, 0, 0);
    let ripNext = 0;
    const UV = { ...U, uRipAge: { value: ripAge }, uRipAmp: { value: ripAmp } };
    U.uCalm.value = 0.08;
    U.uHeartR.value = 9;
    const chrome = chromeMaterial(env, UV);
    const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1, LITE ? 48 : small ? 64 : 110), chrome);
    scene.add(sphere);

    // droplets: stars, a horizon, orbits, the final shatter
    const D = LITE ? 140 : 260;
    const dropMat = new THREE.MeshPhysicalMaterial({ color: 0x6b4330, metalness: 1, roughness: 0.06, envMap: env, envMapIntensity: 1.45, clearcoat: 1, clearcoatRoughness: 0.04 });
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), dropMat, D);
    drops.frustumCulled = false;
    scene.add(drops);
    let s = 90210;
    const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let r = Math.imul(s ^ (s >>> 15), 1 | s); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
    const dp = Array.from({ length: D }, () => ({
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0.025 + Math.pow(rnd(), 3) * 0.09, seed: rnd(),
      star: new THREE.Vector3((rnd() * 2 - 1) * 4.4, (rnd() * 2 - 1) * 2.4, -2.5 + rnd() * 3.2),
      horizon: (() => { const x = (rnd() * 2 - 1) * 4.6; return new THREE.Vector3(x, -1.05 + 0.3 * (1 - (x / 4.6) ** 2) + (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.9); })(),
      orbit: { r: 1.7 + rnd() * 0.9, tilt: (rnd() - 0.5) * 1.3, phase: rnd() * Math.PI * 2, speed: 0.25 + rnd() * 0.35 },
      out: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(),
      shell: new THREE.Vector3(),
    }));
    // where each droplet goes for the hand-off: an even sphere of points, the gate vortex's shape
    dp.forEach((d, i) => {
      const k = i + 0.5, phi = Math.acos(1 - (2 * k) / D), th = Math.PI * (1 + Math.sqrt(5)) * k;
      d.shell.set(Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)).multiplyScalar(1.3);
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();

    // the shadow on the floor
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.55;
    scene.add(shadow);

    // dust
    const DN = LITE ? 2500 : 7000;
    const dpos = new Float32Array(DN * 3), dseed = new Float32Array(DN * 4);
    for (let i = 0; i < DN; i++) {
      dpos[i * 3] = (rnd() * 2 - 1) * 5.5; dpos[i * 3 + 1] = (rnd() * 2 - 1) * 3.2; dpos[i * 3 + 2] = (rnd() * 2 - 1) * 3;
      for (let k = 0; k < 4; k++) dseed[i * 4 + k] = rnd();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 4));
    const DU: Record<string, { value: number }> = { uT: { value: 0 }, uShockT: { value: 99 }, uShockAmp: { value: 0 }, uPx: { value: 1 }, uStir: { value: 0 } };
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: DU, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false }));
    dust.frustumCulled = false;
    scene.add(dust);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const finish = new ShaderPass(FinishShader);
    composer.addPass(finish);
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.fov = camera.aspect < 0.8 ? 52 : 32;
      camera.updateProjectionMatrix();
      DU.uPx.value = h * dpr * 0.0016;
      (finish.uniforms.uRes.value as THREE.Vector2).set(w * dpr, h * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    let mx = 0, my = 0;
    const onMove = (e: PointerEvent) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener('pointermove', onMove);

    let speech: Speech | null = null;
    let bed: ReturnType<typeof liquidBed> = null;
    bedRef.current = () => { bed?.stop(); bed = null; };
    let clock0 = 0, started = false;
    const time = () => (!started ? -1 : speech ? speech.elapsed() : (performance.now() - clock0) / 1000);
    startRef.current = async () => {
      if (started) return;
      started = true;
      setPhase('playing');
      unlock();
      const snd = getSound();
      if (snd.music || snd.sfx) { startMusic(); speech = await speak('awakening', { force: true }); }
      if (!speech) clock0 = performance.now();
      bed = liquidBed();
    };

    let level = 0, bass = 0, mid = 0, high = 0, prev = 0, spikeEnv = 0, jelly = 0, jellyV = 0;
    let lastPhrase = -1, moment = -1, lastDrip = 0, endAt = 0, raf = 0, last = performance.now(), burstAt = -1;
    const t0 = performance.now();
    // smoothed state the scenes steer
    const st = { size: 0.62, y: 0, spike: 0, bands: 0, lattice: 0, pinch: 0, calm: 0.035, drops: 0, stir: 0 };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.visibilityState === 'hidden') return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = time();
      const wall = (now - t0) / 1000;

      prev = level;
      const raw = speech ? speech.level() : 0;
      level += (raw - level) * (raw > level ? 0.22 : 0.07);
      if (speech) { const [b, m, h] = speech.bands(); bass += (b - bass) * 0.15; mid += (m - mid) * 0.15; high += (h - high) * 0.2; }
      const onset = level - prev;
      if (onset > 0.035) {
        if (wall - lastDrip > 0.14 && st.size > 0.3) { lastDrip = wall; sfx('drip'); }
        DU.uShockT.value = 0; DU.uShockAmp.value = Math.min(1.5, onset * 10);
        ripAge.setComponent(ripNext, 0); ripAmp.setComponent(ripNext, Math.min(1.4, onset * 9)); ripNext = (ripNext + 1) % 4; // a word leaves the surface
        jellyV += Math.min(0.9, onset * 5);                                                                                     // and the drop quivers
      }
      ripAge.addScalar(dt);
      // the spike envelope: rises quickly with the voice, settles slowly
      spikeEnv += (level - spikeEnv) * (level > spikeEnv ? 0.35 : 0.05);
      // squash and stretch: a damped spring
      jellyV += (-160 * jelly - 10 * jellyV) * dt;
      jelly = Math.max(-0.12, Math.min(0.12, jelly + jellyV * dt));
      DU.uShockT.value += dt;

      // what each moment asks of the chrome
      const k = 1 - Math.pow(0.03, dt); // ~ a smooth approach over about half a second
      const want = { size: 0.78, y: 0, spike: 0, bands: 0, lattice: 0, pinch: 0, calm: 0.05, drops: 0, stir: 0 };
      if (t < 0) { want.size = 0.62; want.calm = 0.035; }
      else if (t < 1.6) { want.size = 0.72; }
      else if (t < 4.1) { want.size = 0.85; want.bands = 1; }
      else if (t < 9.55) { want.size = 1; want.spike = 1; want.calm = 0.05; want.stir = 1; }
      else if (t < 10.85) { want.size = 0.82; want.pinch = 1; want.calm = 0.03; want.stir = 1; }
      else if (t < 11.3) { want.size = 1.12; want.calm = 0.015; want.stir = 1; } // drawing in its breath before it bursts
      else if (t < 14.8) { want.size = 0; want.drops = 1; }
      else if (t < 18.1) { want.size = 0.7; want.y = lerp(-1.6, -0.35, ease((t - 14.8) / 2.6)); want.drops = 2; }
      else if (t < 20.4) { want.size = 0.82; want.lattice = 1; want.drops = 3; }
      else if (t < END) { want.size = 1; want.spike = 0.8; want.calm = 0.05; want.stir = 1; }
      else { want.size = 0; want.drops = 4; }
      // each movement has its sound
      const sc2 = t < 9.55 ? 0 : t < 10.85 ? 1 : t < 11.3 ? 2 : t < 18.1 ? 3 : t < 20.4 ? 4 : t < END ? 5 : 6;
      if (sc2 !== moment) {
        if (moment >= 0 || sc2 === 0) {
          if (sc2 === 1) sfx('stretch');
          else if (sc2 === 2) sfx('inhale');
          else if (sc2 === 4) sfx('lock');
          else if (sc2 === 6) { sfx('gather'); bed?.stop(); bed = null; }
        }
        moment = sc2;
      }
      // the churn under it all follows the surface
      bed?.set(st.size > 0.05 ? 0.25 + st.calm * 3 + st.spike * level * 1.4 + st.pinch * 0.35 : 0.08, Math.min(1, level * 1.2 + st.pinch * 0.5 + st.spike * 0.2));
      for (const key of Object.keys(st) as (keyof typeof st)[]) {
        if (key === 'drops') st.drops = want.drops;
        else st[key] += (want[key] - st[key]) * (key === 'size' && want.drops === 1 ? 0.25 : key === 'size' && want.drops === 4 ? k * 0.6 : k);
      }

      // the heartbeat, the scan
      const beat = Math.max(0, t) % 0.9;
      U.uHeartAmp.value = t >= 0 && t < 1.8 ? 1 : 0;
      U.uHeartR.value = beat * 4.2;
      U.uScanY.value = 1.1 - Math.max(0, Math.min(1, (t - 1.8) / 2.2)) * 2.2;

      U.uT.value = wall; U.uLevel.value = level; U.uBass.value = bass; U.uMid.value = mid; U.uHigh.value = high;
      U.uCalm.value = st.calm; U.uSpike.value = st.spike; U.uBands.value = st.bands; U.uLattice.value = st.lattice; U.uPinch.value = st.pinch;
      U.uSpikeEnv.value = Math.min(1, spikeEnv * 1.6);
      const breathe = 1 + Math.sin(wall * 1.3) * 0.012 + level * 0.04;
      const sz = Math.max(0.0001, st.size * breathe);
      sphere.scale.set(sz * (1 - jelly * 0.45), sz * (1 + jelly), sz * (1 - jelly * 0.45));
      sphere.position.y = st.y + Math.sin(wall * 0.7) * 0.04;
      sphere.rotation.y = wall * 0.12 + mx * 0.4;
      sphere.rotation.x = Math.sin(wall * 0.2) * 0.1 - my * 0.2;
      shadow.scale.setScalar(1.8 + st.size * 1.6);
      (shadow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, st.size * 1.1) * (1 - Math.max(0, sphere.position.y + 0.1) * 0.8);
      DU.uT.value = wall; DU.uStir.value = st.stir * (0.4 + level);

      // the droplets
      if (st.drops === 1 && burstAt < 0) {
        burstAt = wall;
        sfx('gateEnter'); sfx('splash');
        DU.uShockT.value = 0; DU.uShockAmp.value = 1.5;
        for (const d of dp) { d.pos.set(0, 0, 0); d.vel.copy(d.out).multiplyScalar(0.12 + d.seed * 0.2); }
      }
      for (let i = 0; i < D; i++) {
        const d = dp[i];
        let target: THREE.Vector3 | null = null;
        let scale = d.size;
        if (st.drops === 0) { scale = 0; target = sphere.position; }
        else if (st.drops === 1) { target = d.star; scale = d.size * (0.75 + 0.35 * Math.sin(wall * 2 + d.seed * 40)); }
        else if (st.drops === 2) { target = d.horizon; }
        else if (st.drops === 3) {
          const o = d.orbit, a = o.phase + wall * o.speed;
          sc.set(Math.cos(a) * o.r, Math.sin(a) * o.r * 0.35, Math.sin(a) * o.r).applyAxisAngle(new THREE.Vector3(0, 0, 1), o.tilt);
          target = sc.clone();
        } else { // the hand-off: gathering into the gate vortex's sphere, shrinking to points
          target = d.shell.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), wall * 0.35);
          const into = endAt ? ease(Math.min(1, (now - endAt) / 900)) : 0;
          scale = lerp(d.size, 0.011, into);
        }
        if (target) { d.vel.addScaledVector(target.clone().sub(d.pos), st.drops === 1 ? 0.025 : 0.05); d.vel.multiplyScalar(0.86); }
        d.pos.add(d.vel);
        m4.compose(d.pos, q, sc.set(scale, scale, scale));
        drops.setMatrixAt(i, m4);
      }
      drops.instanceMatrix.needsUpdate = true;

      // the camera: a slow drift, a little closer while it speaks
      const close = t >= 4.1 && t < 11.3;
      camera.position.z += ((close ? 6.1 : st.drops === 1 ? 8.4 : 7.2) - camera.position.z) * 0.02;
      camera.position.x += (mx * 0.8 + Math.sin(wall * 0.12) * 0.3 - camera.position.x) * 0.04;
      camera.position.y += (0.15 - my * 0.5 + Math.cos(wall * 0.1) * 0.1 - camera.position.y) * 0.04;
      camera.lookAt(0, sphere.position.y * 0.4, 0);

      let p = -1;
      for (let i = 0; i < PHRASES.length; i++) if (t >= PHRASES[i][0]) p = i;
      if (p !== lastPhrase) { lastPhrase = p; setCaption(p >= 0 ? PHRASES[p][1] : ''); if (p >= 0) sfx('tick'); }

      finish.uniforms.uTime.value = wall;
      if (t >= END && !endAt) {
        endAt = now;
        setCaption('');
        // the sphere's droplets leave from its surface
        for (const d of dp) { d.pos.copy(d.out).multiplyScalar(0.6).add(sphere.position); d.vel.set(0, 0, 0); }
        onEndingRef.current?.();
        setTimeout(() => dissolve(1400), 450);
      }

      composer.render();
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      bed?.stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      sphere.geometry.dispose(); chrome.dispose();
      drops.geometry.dispose(); dropMat.dispose();
      dg.dispose(); (dust.material as THREE.Material).dispose();
      shadow.geometry.dispose(); (shadow.material as THREE.MeshBasicMaterial).map?.dispose(); (shadow.material as THREE.Material).dispose();
      env.dispose(); pmrem.dispose();
      composer.dispose(); renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (finished.current || skipping.current) return;
    skipping.current = true;
    stopVoice();
    bedRef.current();
    onEndingRef.current?.();
    dissolve(600);
  };

  return (
    <View ref={rootRef} style={StyleSheet.absoluteFill}>
      <View ref={hostRef} style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => startRef.current()} accessibilityLabel="Wake WYRD" />
      <View pointerEvents="none" style={styles.captionWrap}>
        {phase === 'waiting' ? <Mono style={styles.wake}>TOUCH TO WAKE WYRD</Mono> : <Caption text={caption} />}
      </View>
      <Pressable onPress={skip} hitSlop={10} style={styles.skip} accessibilityLabel="Skip intro">
        <Mono style={styles.skipText}>SKIP ›</Mono>
      </Pressable>
    </View>
  );
}

const GLYPHS = '!<>-_\\/[]{}=+*^?#01ΔΞΣ░▒▓';
function Caption({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    let step = 0;
    const steps = Math.max(8, Math.min(22, text.length));
    const id = setInterval(() => {
      step++;
      const settled = Math.floor((step / steps) * text.length);
      let out = '';
      for (let k = 0; k < text.length; k++) out += k < settled || text[k] === ' ' ? text[k] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      setShown(out);
      if (step >= steps) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [text]);
  return <Display style={styles.caption}>{shown}</Display>;
}

const styles = StyleSheet.create({
  captionWrap: { position: 'absolute', left: 16, right: 16, bottom: '9%', alignItems: 'center' },
  caption: { fontSize: 28, letterSpacing: 3, color: '#24316B', textAlign: 'center' },
  wake: { fontSize: 11, letterSpacing: 4, color: 'rgba(196,87,46,0.75)' },
  skip: { position: 'absolute', bottom: 22, right: 22, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(196,87,46,0.35)', borderRadius: 999, backgroundColor: 'rgba(255,250,242,0.8)' },
  skipText: { fontSize: 10, letterSpacing: 2, color: '#C4572E' },
});
