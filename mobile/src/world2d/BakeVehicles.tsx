import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeDanfo, makeKeke, makeOkada } from '../world/vehicles';

/**
 * DEV ONLY (#bake-cars): every vehicle of the 2D city rendered from the 2D camera (~37 degrees up)
 * in 16 headings, transparent, one row per sheet -> public/world2d/vehicles/<name>.webp, plus
 * vehicles.json (how many metres a cell spans, where the ground centre sits in it).
 * The danfo, okada and keke are the 3D city's own; the cars and the BRT bus are built here in the
 * poster's glossy, rounded style.
 */
const CELL = 160, DIRS = 32;
/** camera pitches baked (radians above the ground): one row each, so cars match however the camera is tipped */
export const PITCHES = [0.15, 0.25, 0.35, 0.55, 0.75, 0.95];

const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.35 });
const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.05, metalness: 0.8 });
const tyre = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85 });
const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff6ff, emissiveIntensity: 0.9 });
const tail = new THREE.MeshStandardMaterial({ color: 0xd32f2f, emissive: 0x9a1010, emissiveIntensity: 0.8 });
const glow = new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.85 });

/** A rounded 2099 city car, front towards +z. */
function car(color: number, opts: { long?: number; low?: boolean } = {}) {
  const g = new THREE.Group();
  const L = opts.long ?? 4.4, W = 1.9, low = opts.low ? 0.85 : 1;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, 0.62 * low, L, 4, 0.26), paint(color));
  body.position.y = 0.58;
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(W * 0.84, 0.5 * low, L * 0.52, 4, 0.22), glass);
  cabin.position.set(0, 0.58 + 0.5 * low, -L * 0.05);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(W * 0.78, 0.08, L * 0.36, 2, 0.04), paint(color));
  roof.position.set(0, 0.58 + 0.76 * low, -L * 0.08);
  g.add(body, cabin, roof);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(sx * (W / 2 - 0.08), 0.34, sz * L * 0.32); g.add(w);
  }
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.06), lamp); h.position.set(sx * 0.6, 0.7, L / 2 - 0.02); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.06), tail); t.position.set(sx * 0.55, 0.72, -L / 2 + 0.02); g.add(t);
  }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, L * 0.85), glow);
  under.rotation.x = -Math.PI / 2; under.position.y = 0.06; g.add(under);
  return g;
}

/** A long blue Lagos BRT bus, front towards +z. */
function brt() {
  const g = new THREE.Group();
  const L = 12, W = 2.55;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, 2.7, L, 4, 0.3), paint(0x1f5fd6));
  body.position.y = 1.75; g.add(body);
  const band = new THREE.Mesh(new RoundedBoxGeometry(W + 0.02, 0.9, L - 0.8, 2, 0.1), glass);
  band.position.set(0, 2.25, 0); g.add(band);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.18, L - 0.6), paint(0xf2c94c));
  stripe.position.set(0, 1.25, 0); g.add(stripe);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(W - 0.3, 0.12, L - 1.2, 2, 0.05), paint(0xe8edf5));
  roof.position.y = 3.12; g.add(roof);
  for (const z of [-L * 0.33, L * 0.3]) for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(sx * (W / 2 - 0.1), 0.5, z); g.add(w);
  }
  return g;
}

/** A 2099 Lagos water taxi, bow towards +z: a white hull narrowing to the bow, a cyan neon line along it, a cabin
 *  with a dark windscreen and canopy, benches, an outboard at the stern. */
function boat() {
  const g = new THREE.Group();
  const L = 8.2, W = 2.5;
  const hullMat = paint(0xf3f5f8), dark = paint(0x24303f);
  // the hull: a box for the stern half, a tapering wedge for the bow
  const stern = new THREE.Mesh(new RoundedBoxGeometry(W, 0.9, L * 0.6, 3, 0.2), hullMat); stern.position.set(0, 0.45, -L * 0.2); g.add(stern);
  const bowShape = new THREE.Shape(); bowShape.moveTo(-W / 2, 0); bowShape.lineTo(W / 2, 0); bowShape.lineTo(0, L * 0.42); bowShape.closePath();
  const bow = new THREE.Mesh(new THREE.ExtrudeGeometry(bowShape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), hullMat);
  bow.rotation.x = -Math.PI / 2; bow.position.set(0, 0, L * 0.1); g.add(bow);
  const keel = new THREE.Mesh(new RoundedBoxGeometry(W * 0.96, 0.3, L * 0.62, 2, 0.1), dark); keel.position.set(0, 0.12, -L * 0.2); g.add(keel);
  for (const sx of [-1, 1]) { const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, L * 0.62), glow); line.position.set(sx * (W / 2 + 0.01), 0.72, -L * 0.2); g.add(line); }
  // deck, benches, cabin, windscreen, canopy
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.06, L * 0.56), paint(0xb98b5a)); deck.position.set(0, 0.92, -L * 0.2); g.add(deck);
  for (const z of [-0.2, -1.4, -2.6]) { const bench = new THREE.Mesh(new RoundedBoxGeometry(W * 0.8, 0.3, 0.45, 2, 0.08), paint(0x1e88e5)); bench.position.set(0, 1.12, z); g.add(bench); }
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(W * 0.78, 0.8, 1.5, 3, 0.18), hullMat); cabin.position.set(0, 1.35, 1.0); g.add(cabin);
  const screen = new THREE.Mesh(new RoundedBoxGeometry(W * 0.74, 0.5, 0.12, 2, 0.05), glass); screen.position.set(0, 1.7, 1.75); screen.rotation.x = -0.35; g.add(screen);
  const canopy = new THREE.Mesh(new RoundedBoxGeometry(W * 0.92, 0.1, 3.6, 2, 0.05), paint(0xf2c94c)); canopy.position.set(0, 2.45, -1.4); g.add(canopy);
  for (const sx of [-1, 1]) for (const z of [0.3, -3.1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), dark); post.position.set(sx * W * 0.42, 1.75, z); g.add(post); }
  const motor = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.0, 0.6, 2, 0.12), dark); motor.position.set(0, 0.8, -L * 0.52); g.add(motor);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.4, L * 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
  under.rotation.x = -Math.PI / 2; under.position.y = 0.02; g.add(under); // the wake round the hull
  return g;
}

/** front towards +x in the 3D city's models: turn them to face +z like the rest */
const turned = (o: THREE.Object3D) => { const g = new THREE.Group(); o.rotation.y = -Math.PI / 2; g.add(o); return g; };

const LIST: { name: string; make: () => THREE.Object3D; span: number }[] = [
  { name: 'car-red', make: () => car(0xe53935), span: 6.2 },
  { name: 'car-blue', make: () => car(0x1e88e5), span: 6.2 },
  { name: 'car-white', make: () => car(0xf5f7fa, { low: true }), span: 6.2 },
  { name: 'car-purple', make: () => car(0x8e24aa, { low: true }), span: 6.2 },
  { name: 'car-grey', make: () => car(0x4a5568), span: 6.2 },
  { name: 'car-taxi', make: () => car(0xf2c94c), span: 6.2 },
  { name: 'car-danfo', make: () => turned(makeDanfo(false).group), span: 6.8 },
  { name: 'bus-brt', make: () => brt(), span: 14.5 },
  { name: 'okada', make: () => turned(makeOkada(false).group), span: 3.2 },
  { name: 'keke', make: () => turned(makeKeke(false).group), span: 3.8 },
  { name: 'boat-taxi', make: () => boat(), span: 10.5 },
];

export function BakeVehicles() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const say = (s: string) => setLog((l) => [...l, s]);
    (async () => {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(CELL, CELL); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      const meta: Record<string, { span: number; ground: number[] }> = {};
      const only = new URLSearchParams(location.hash.split('?')[1] ?? '').get('only');
      if (only) Object.assign(meta, await fetch('world2d/vehicles/vehicles.json').then((r) => r.json()).catch(() => ({})));
      for (const v of LIST.filter((x) => !only || x.name === only)) {
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4d6, 2.4));
        const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-4, 8, 5); scene.add(sun);
        const fill = new THREE.DirectionalLight(0xfff4e0, 1.0); fill.position.set(4, 3, 6); scene.add(fill);
        const holder = new THREE.Group(); holder.add(v.make()); scene.add(holder);
        const half = v.span / 2, lookY = 0.2 * v.span * 0.3;
        const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 200);
        const d = 60;
        const sheet = document.createElement('canvas'); sheet.width = CELL * DIRS; sheet.height = CELL * PITCHES.length;
        const sctx = sheet.getContext('2d')!;
        PITCHES.forEach((pitch, row) => {
          cam.position.set(0, lookY + Math.sin(pitch) * d, Math.cos(pitch) * d);
          cam.lookAt(0, lookY, 0);
          for (let i = 0; i < DIRS; i++) {
            holder.rotation.y = (i * Math.PI * 2) / DIRS; // 0 = facing the camera (down the screen), DIRS/4 = facing right
            renderer.render(scene, cam);
            sctx.drawImage(renderer.domElement, i * CELL, row * CELL);
          }
        });
        // where the ground point under the vehicle's centre lands in the cell (0 top, 1 bottom), per pitch
        meta[v.name] = { span: v.span, ground: PITCHES.map((p) => 0.5 + (lookY * Math.cos(p)) / v.span) };
        const url = sheet.toDataURL('image/webp', 0.9);
        await fetch('http://localhost:8099/', { method: 'POST', body: JSON.stringify({ name: `vehicles/${v.name}.webp`, data: url.split(',')[1] }) });
        say(`${v.name}: ${(url.length / 1366).toFixed(0)} KB`);
      }
      await fetch('http://localhost:8099/', { method: 'POST', body: JSON.stringify({ name: 'vehicles/vehicles.json', data: btoa(JSON.stringify(meta)) }) });
      say('done');
    })().catch((e) => say(`failed: ${(e as Error).message}`));
  }, []);
  return <pre style={{ padding: 20, fontSize: 14 }}>{log.join('\n')}</pre>;
}
