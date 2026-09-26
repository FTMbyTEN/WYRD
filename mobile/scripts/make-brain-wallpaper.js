// Renders WYRD's brain as high-resolution wallpapers, using the same geometry as
// src/components/BrainCanvas.tsx (two wrinkled hemispheres split by a fissure, a cerebellum, a
// nearest-neighbour neural mesh with signal packets), just denser and sharper.
//   node scripts/make-brain-wallpaper.js [outDir]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = process.argv[2] || path.join(root, 'wallpapers');
const CanvasKitInit = require(require.resolve('canvaskit-wasm/bin/full/canvaskit.js', { paths: [root] }));

// deterministic randomness so the same wallpaper comes out every run
let seed = 20260926;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const GAP = 0.16;
function buildBrain(nodeCount) {
  const cerebellumCount = Math.max(6, Math.round(nodeCount * 0.12));
  const hemiCount = Math.max(4, Math.round((nodeCount - cerebellumCount) / 2));
  const pts = [];
  const wrinkle = (theta, phi) =>
    1 + 0.07 * Math.sin(theta * 5 + phi * 2) + 0.045 * Math.sin(phi * 7 - theta * 3) + 0.03 * Math.sin(theta * 11 + phi * 9);
  for (const sign of [1, -1]) {
    for (let i = 0; i < hemiCount; i++) {
      const y0 = 1 - (i / (hemiCount - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      let x = Math.cos(theta) * rad;
      let z = Math.sin(theta) * rad;
      const w = wrinkle(theta, Math.atan2(z, x));
      let y = y0;
      if (y < -0.15) y = -0.15 + (y + 0.15) * 0.45;
      x *= 0.72 * w;
      z *= 1.05 * w;
      y *= 0.62 * w;
      x = sign * (Math.abs(x) + GAP);
      pts.push({ x, y, z, s: 0.6 + rand() * 0.8 });
    }
  }
  for (let i = 0; i < cerebellumCount; i++) {
    const y0 = 1 - (i / Math.max(1, cerebellumCount - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const theta = i * Math.PI * (3 - Math.sqrt(5)) * 1.3;
    pts.push({ x: Math.cos(theta) * rad * 0.34, y: y0 * 0.22 - 0.42, z: Math.sin(theta) * rad * 0.24 - 0.62, s: 0.45 + rand() * 0.5 });
  }
  return pts;
}

function buildEdges(points, k) {
  const seen = new Set();
  const edges = [];
  points.forEach((p, i) => {
    const near = points
      .map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2 }))
      .filter((n) => n.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ a: i, b: j, t: rand() });
      }
    }
  });
  return edges;
}

(async () => {
  const CK = await CanvasKitInit({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`, { paths: [root] }) });
  const typeface = CK.Typeface.MakeFreeTypeFaceFromData(
    fs.readFileSync(require.resolve('@expo-google-fonts/vt323/400Regular/VT323_400Regular.ttf', { paths: [root] })),
  );
  fs.mkdirSync(outDir, { recursive: true });

  const points = buildBrain(600);
  const edges = buildEdges(points, 3);

  const render = (W, H, dark, file) => {
    const bg = dark ? CK.BLACK : CK.WHITE;
    const inkRGB = dark ? [255, 255, 255] : [0, 0, 0];
    const ink = (a) => CK.Color(inkRGB[0], inkRGB[1], inkRGB[2], a);

    const surface = CK.MakeSurface(W, H);
    const canvas = surface.getCanvas();
    canvas.clear(bg);

    // a fixed three-quarter view, the angle the app's slow rotation looks best at
    const t = 0.62;
    const ca = Math.cos(t), sa = Math.sin(t);
    const R = Math.min(W, H) * 0.47;
    const cx = W / 2, cy = H * (W < H ? 0.46 : 0.5);
    const proj = points.map((p) => {
      const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca;
      const sc = 1 / (2.6 - z * 0.6);
      return { sx: cx + x * R * sc * 1.7, sy: cy - p.y * R * sc * 1.9, d: sc, s: p.s };
    });
    const unit = Math.min(W, H) / 900; // stroke/dot scale relative to the app's phone size

    const line = new CK.Paint();
    line.setAntiAlias(true);
    line.setStyle(CK.PaintStyle.Stroke);
    line.setStrokeWidth(0.9 * unit);
    for (const e of edges) {
      const a = proj[e.a], b = proj[e.b];
      line.setColor(ink(0.16 + ((a.d + b.d) / 2) * 0.38));
      canvas.drawLine(a.sx, a.sy, b.sx, b.sy, line);
    }

    const dot = new CK.Paint();
    dot.setAntiAlias(true);
    // signal packets part-way along the connections
    for (const e of edges) {
      if (e.t > 0.55) continue;
      const a = proj[e.a], b = proj[e.b];
      const f = (e.t * 1.8) % 1;
      dot.setColor(ink(0.5 + ((a.d + b.d) / 2) * 0.4));
      canvas.drawCircle(a.sx + (b.sx - a.sx) * f, a.sy + (b.sy - a.sy) * f, (1.1 + a.d * 1.2) * unit, dot);
    }
    // neurons
    for (const p of proj) {
      dot.setColor(ink(0.3 + p.d * 0.7));
      canvas.drawCircle(p.sx, p.sy, p.s * p.d * 2.2 * unit, dot);
    }
    // a few firing neurons: rings around bright nodes
    const ring = new CK.Paint();
    ring.setAntiAlias(true);
    ring.setStyle(CK.PaintStyle.Stroke);
    ring.setStrokeWidth(1.2 * unit);
    for (let i = 0; i < proj.length; i += 47) {
      const p = proj[i];
      ring.setColor(ink(0.55));
      canvas.drawCircle(p.sx, p.sy, 9 * unit * p.d * 2, ring);
      ring.setColor(ink(0.18));
      canvas.drawCircle(p.sx, p.sy, 16 * unit * p.d * 2, ring);
    }

    // wordmark
    const font = new CK.Font(typeface, Math.min(W, H) * 0.06);
    const label = 'W Y R D';
    const glyphs = font.getGlyphIDs(label);
    const width = font.getGlyphWidths(glyphs).reduce((s, w) => s + w, 0);
    const text = new CK.Paint();
    text.setColor(ink(0.9));
    text.setAntiAlias(true);
    const baseY = W < H ? H * 0.8 : H * 0.9;
    canvas.drawText(label, (W - width) / 2, baseY, text, font);
    const small = new CK.Font(typeface, Math.min(W, H) * 0.022);
    const sub = 'a mind that never stops';
    const sw = small.getGlyphWidths(small.getGlyphIDs(sub)).reduce((s, w) => s + w, 0);
    text.setColor(ink(0.45));
    canvas.drawText(sub, (W - sw) / 2, baseY + Math.min(W, H) * 0.045, text, small);

    const img = surface.makeImageSnapshot();
    const out = path.join(outDir, file);
    fs.writeFileSync(out, Buffer.from(img.encodeToBytes()));
    surface.delete();
    console.log(out);
  };

  render(1440, 3120, false, 'wyrd-brain-phone-light.png');
  render(1440, 3120, true, 'wyrd-brain-phone-dark.png');
  render(3840, 2160, false, 'wyrd-brain-desktop-light.png');
  render(3840, 2160, true, 'wyrd-brain-desktop-dark.png');
})();
