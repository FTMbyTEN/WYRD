import * as THREE from 'three';

/**
 * WYRD's voice in the world: a neon hologram panel that rises above the player when they speak to
 * WYRD -- the same look as the rooftop holograms. It pulses "listening…" while WYRD thinks, then
 * shows the reply; it always faces the camera and fades away after a while.
 */
export function makeHoloTalk(scene: THREE.Scene) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 384;
  const g = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, opacity: 0 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.35), mat);
  panel.renderOrder = 5;
  panel.visible = false;
  scene.add(panel);

  let text = '', thinking = false, shownAt = -1e9, until = 0, scan = 0;
  const wrap = (s: string, max: number) => {
    const words = s.split(/\s+/), lines: string[] = [];
    let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
    if (cur.trim()) lines.push(cur.trim());
    return lines.slice(0, 5);
  };
  const draw = (now: number) => {
    g.clearRect(0, 0, 1024, 384);
    // the frame: a cyan border with corner brackets, a faint fill, scanlines
    g.fillStyle = 'rgba(0,40,60,0.55)'; g.fillRect(8, 8, 1008, 368);
    g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.strokeRect(8, 8, 1008, 368);
    g.fillStyle = '#ff2bd6';
    for (const [x, y] of [[8, 8], [1016, 8], [8, 376], [1016, 376]]) g.fillRect(x - 6, y - 6, 12, 12);
    g.fillStyle = 'rgba(0,229,255,0.07)';
    for (let y = (scan % 6); y < 384; y += 6) g.fillRect(8, y, 1008, 2);
    g.font = 'bold 30px "Share Tech Mono", monospace'; g.fillStyle = '#8ea0ff'; g.textBaseline = 'top';
    g.fillText('◉ WYRD · THE AUTHORITY', 34, 28);
    g.font = '40px "Share Tech Mono", monospace'; g.fillStyle = '#ffffff';
    if (thinking) {
      const dots = '.'.repeat(1 + Math.floor(now / 350) % 3);
      g.fillStyle = '#00e5ff'; g.fillText(`listening${dots}`, 34, 150);
    } else wrap(text, 42).forEach((l, i) => g.fillText(l, 34, 86 + i * 54));
    tex.needsUpdate = true;
  };

  return {
    /** Start listening (WYRD is thinking). */
    listen() { thinking = true; text = ''; shownAt = performance.now(); until = Infinity; panel.visible = true; },
    /** WYRD's reply: shown for a while, longer for longer replies. */
    say(reply: string) { thinking = false; text = reply; shownAt = performance.now(); until = shownAt + 5000 + reply.length * 60; panel.visible = true; },
    hide() { until = 0; },
    get active() { return panel.visible; },
    update(now: number, head: THREE.Vector3, camera: THREE.Camera) {
      if (!panel.visible) return;
      scan += 1;
      const age = now - shownAt;
      const fadeIn = Math.min(1, age / 250), fadeOut = until === Infinity ? 1 : Math.max(0, Math.min(1, (until - now) / 600));
      mat.opacity = Math.min(fadeIn, fadeOut) * (0.92 + Math.sin(now / 90) * 0.04);
      if (fadeOut <= 0) { panel.visible = false; return; }
      // rises out of the hand, then hangs above the head, facing the camera
      const rise = Math.min(1, age / 400);
      panel.position.set(head.x, head.y + 0.6 + rise * 0.9, head.z);
      panel.quaternion.copy(camera.quaternion);
      panel.scale.setScalar(0.4 + 0.6 * rise);
      if (Math.floor(now / 50) !== Math.floor((now - 16) / 50)) draw(now); // redraw ~20 times a second
    },
  };
}
