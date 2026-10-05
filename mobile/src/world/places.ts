import * as THREE from 'three';

/**
 * The places that make Lagos a city, from the real map (places.json): clubs and bars, police
 * stations, government buildings, factories, fire stations and hospitals. Each one gets a thin
 * light beam in its colour (all of them one instanced mesh: one draw call) so you can find it from
 * across the city, and the nearest few get a neon sign with their real name. On the map they are
 * labelled pins. Light enough for a phone: a few hundred instances, at most 10 small sign textures.
 */
export type PlaceKind = 'club' | 'bar' | 'police' | 'gov' | 'factory' | 'fire' | 'hospital';
export type Place = { k: PlaceKind; n: string | null; x: number; z: number };

export const PLACE_STYLE: Record<PlaceKind, { label: string; icon: string; color: number; css: string }> = {
  club: { label: 'CLUB', icon: '♫', color: 0xff2bd6, css: '#ff2bd6' },
  bar: { label: 'BAR', icon: '◈', color: 0xffa040, css: '#ffa040' },
  police: { label: 'POLICE', icon: '⛨', color: 0x3a7bff, css: '#5a8bff' },
  gov: { label: 'GOVERNMENT', icon: '▣', color: 0x1aff9c, css: '#1aff9c' },
  factory: { label: 'FACTORY', icon: '⚙', color: 0xffc400, css: '#ffc400' },
  fire: { label: 'FIRE STATION', icon: '▲', color: 0xff3b3b, css: '#ff5b5b' },
  hospital: { label: 'HOSPITAL', icon: '✚', color: 0xffffff, css: '#e8ecff' },
};
/** On the map, the kinds that always show; bars and hospitals only when zoomed in close. */
const MAP_ALWAYS = new Set<PlaceKind>(['club', 'police', 'gov', 'factory', 'fire']);
const SIGNS = 10;

export function makePlaces(scene: THREE.Scene, host: HTMLElement) {
  let places: Place[] = [];
  // ---- the beams: one instanced, additive column per place ----
  const beamGeo = new THREE.CylinderGeometry(0.6, 1.4, 60, 6, 1, true).translate(0, 30, 0);
  const beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  let beams: THREE.InstancedMesh | null = null;

  // ---- the signs: a small pool, given to the nearest places ----
  const signs = Array.from({ length: SIGNS }, () => {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(16, 4, 1);
    sp.visible = false;
    scene.add(sp);
    return { sp, cv, tex, who: null as Place | null };
  });
  const paint = (s: (typeof signs)[number], p: Place) => {
    const g = s.cv.getContext('2d')!, st = PLACE_STYLE[p.k];
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(4, 4, 504, 120);
    g.strokeStyle = st.css; g.lineWidth = 4; g.strokeRect(4, 4, 504, 120);
    g.fillStyle = st.css; g.font = 'bold 26px "Share Tech Mono", monospace'; g.textBaseline = 'top';
    g.fillText(`${st.icon} ${st.label}`, 20, 14);
    g.fillStyle = '#ffffff'; g.font = 'bold 38px "Share Tech Mono", monospace';
    g.fillText((p.n ?? st.label).toUpperCase(), 20, 56, 472);
    s.tex.needsUpdate = true;
    s.who = p;
  };

  // ---- the map pins ----
  const pins: { p: Place; div: HTMLDivElement }[] = [];

  fetch('world/v1/places.json').then((r) => r.json()).then((list: Place[]) => {
    places = list;
    beams = new THREE.InstancedMesh(beamGeo, beamMat, list.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((p, i) => {
      const tall = p.k === 'club' || p.k === 'police' || p.k === 'gov' ? 1.4 : p.k === 'factory' ? 1.1 : 0.8;
      beams!.setMatrixAt(i, m4.makeScale(1, tall, 1).setPosition(p.x, 0, p.z));
      beams!.setColorAt(i, c.setHex(PLACE_STYLE[p.k].color));
    });
    beams.frustumCulled = false;
    scene.add(beams);
    for (const p of list) {
      const st = PLACE_STYLE[p.k];
      const div = document.createElement('div');
      div.textContent = `${st.icon} ${(p.n ?? st.label).slice(0, 28)}`;
      div.style.cssText = `position:absolute;left:0;top:0;transform:translate(-9999px,0);padding:2px 6px;background:rgba(10,12,18,0.8);color:${st.css};border-left:2px solid ${st.css};font:9.5px/1.3 "Share Tech Mono",monospace;white-space:nowrap;pointer-events:none;user-select:none`;
      host.appendChild(div);
      pins.push({ p, div });
    }
  }).catch(() => {});

  const proj = new THREE.Vector3();
  let next = 0;
  return {
    get list() { return places; },
    /** Each frame: the beams pulse (police flash), the nearest places get signs, map pins follow the camera. */
    update(now: number, at: THREE.Vector3, camera: THREE.Camera, bird: boolean, birdH: number, night: number) {
      beamMat.opacity = (0.18 + 0.3 * night) * (0.85 + 0.15 * Math.sin(now / 300));
      if (beams) beams.visible = !bird || birdH < 2500;
      // signs: re-picked a few times a second, not every frame
      if (now > next) {
        next = now + 400;
        const near = bird ? [] : places
          .map((p) => ({ p, d: Math.hypot(p.x - at.x, p.z - at.z) }))
          .filter((o) => o.d < 260)
          .sort((a, b) => a.d - b.d)
          .slice(0, SIGNS);
        signs.forEach((s, i) => {
          const o = near[i];
          if (!o) { s.sp.visible = false; s.who = null; return; }
          if (s.who !== o.p) paint(s, o.p);
          s.sp.position.set(o.p.x, 24, o.p.z);
          s.sp.visible = true;
        });
      }
      for (const s of signs) if (s.sp.visible) s.sp.position.y = 24 + Math.sin(now / 700 + s.sp.position.x) * 0.4;
      // map pins
      const w = host.clientWidth, h = host.clientHeight;
      let shown = 0;
      const taken: [number, number][] = []; // labels already placed this frame: no pile-ups
      for (const { p, div } of pins) {
        const want = bird && shown < 60 && (MAP_ALWAYS.has(p.k) ? birdH < 3000 : birdH < 700);
        if (want) {
          proj.set(p.x, 10, p.z).project(camera);
          const sx = ((proj.x + 1) / 2) * w, sy = ((1 - proj.y) / 2) * h;
          if (proj.z < 1 && Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 && !taken.some(([x, y]) => Math.abs(x - sx) < 120 && Math.abs(y - sy) < 18)) {
            taken.push([sx, sy]);
            div.style.transform = `translate(${sx}px, ${sy}px) translate(-50%,-50%)`;
            shown++;
            continue;
          }
        }
        div.style.transform = 'translate(-9999px,0)';
      }
    },
    dispose() {
      for (const { div } of pins) div.remove();
      for (const s of signs) { scene.remove(s.sp); s.tex.dispose(); s.sp.material.dispose(); }
      if (beams) scene.remove(beams);
      beamGeo.dispose(); beamMat.dispose();
    },
  };
}
