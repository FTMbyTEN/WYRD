import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * DEV ONLY (#bake): renders TEN and Ama -- the motion-captured 3D characters -- into 2D sprite
 * sheets at the 2D game's camera angle: 8 facings x (walk, run, idle) frames, transparent
 * background, and sends each sheet to a local receiver that writes public/world2d/people/.
 * The 2D game then plays the real mocap animation as pictures, with no 3D engine at runtime.
 */
const CELL = 192, DIRS = 8;
/** the camera angles baked (radians up from the ground), lettered a-d in the file names; the game shows the nearest */
export const HERO_PITCHES = [0.2, 0.42, Math.asin(0.6), 0.9];
/** half the cell's span in metres at each angle: lower cameras see the whole 1.8 m standing up, so need more room */
export const heroHalf = (e: number) => Math.max(0.85, (1.8 * Math.cos(e)) / 1.75 + 0.03);
const ANIMS: { name: string; frames: number }[] = [{ name: 'walk', frames: 10 }, { name: 'run', frames: 10 }, { name: 'idle', frames: 6 }];

export function Bake() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const say = (s: string) => setLog((l) => [...l, s]);
    (async () => {
      const loader = new GLTFLoader();
      const load = (u: string) => loader.loadAsync(u);
      const [ten, ama, run, idle] = await Promise.all([load('world/people/ten.glb'), load('world/people/ama.glb'), load('world/people/ten-run.glb'), load('world/people/ten-idle.glb')]);
      const clips: Record<string, THREE.AnimationClip> = { walk: ten.animations[0], run: run.animations[0], idle: idle.animations[0] };

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(CELL, CELL);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      for (const [who, gltf] of [['ten', ten], ['ama', ama]] as const) {
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4d6, 2.8));
        const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(-3, 6, 4); scene.add(sun);
        const fill = new THREE.DirectionalLight(0xfff4e0, 1.4); fill.position.set(3, 3, 6); scene.add(fill);
        const model = gltf.scene;
        // stand him 1.8 m tall, feet on the ground
        const box = new THREE.Box3().setFromObject(model), h = box.max.y - box.min.y;
        model.scale.multiplyScalar(1.8 / h);
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;
        const holder = new THREE.Group(); holder.add(model); scene.add(holder);


        const mixer = new THREE.AnimationMixer(model);
        for (const [pi, e] of HERO_PITCHES.entries()) {
        // the feet always 90% down the cell, so the game stands every angle on the same spot
        const HALF = heroHalf(e), LOOK_Y = (0.8 * HALF) / Math.cos(e), d = 10;
        const cam = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.1, 50);
        cam.position.set(0, LOOK_Y + Math.sin(e) * d, Math.cos(e) * d);
        cam.lookAt(0, LOOK_Y, 0);
        for (const a of ANIMS) {
          // in place: keep only the hips' height from root motion
          const clip = clips[a.name].clone();
          clip.tracks = clip.tracks.filter((t) => {
            if (t.name.endsWith('.scale')) return false;
            if (t.name.endsWith('.position')) {
              if (!t.name.startsWith('Hips.')) return false;
              const v = t.values, n = v.length / 3;
              for (let i = 0; i < n; i++) { v[i * 3] = v[0]; v[i * 3 + 2] = v[2]; }
            }
            return true;
          });
          mixer.stopAllAction();
          const action = mixer.clipAction(clip); action.reset().play();
          const sheet = document.createElement('canvas');
          sheet.width = CELL * a.frames; sheet.height = CELL * DIRS;
          const sctx = sheet.getContext('2d')!;
          for (let dir = 0; dir < DIRS; dir++) {
            holder.rotation.y = (dir * Math.PI * 2) / DIRS; // dir 0 faces the camera (down the screen), then turning to his left: 2 = right of screen
            for (let f = 0; f < a.frames; f++) {
              mixer.setTime((clip.duration * f) / a.frames);
              renderer.render(scene, cam);
              sctx.drawImage(renderer.domElement, f * CELL, dir * CELL);
            }
          }
          const url = sheet.toDataURL('image/webp', 0.88);
          await fetch('http://localhost:8099/', { method: 'POST', body: JSON.stringify({ name: `people/${who}-${a.name}-p${'abcd'[pi]}.webp`, data: url.split(',')[1] }) });
          say(`${who} ${a.name} angle ${pi}: ${a.frames} frames x ${DIRS} facings, ${(url.length / 1366).toFixed(0)} KB`);
        }
        }
      }
      say('done');
    })().catch((e) => say(`failed: ${(e as Error).message}`));
  }, []);
  return <pre style={{ padding: 20, fontSize: 14 }} id="bake-log">{log.join('\n')}</pre>;
}
