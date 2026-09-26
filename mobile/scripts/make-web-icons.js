// Renders WYRD's home-screen / PWA icons (black WYRD wordmark on white, in the app's VT323 face)
// into public/. Uses CanvasKit, which the app already ships for Skia.
//   node scripts/make-web-icons.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const CanvasKitInit = require(require.resolve('canvaskit-wasm/bin/full/canvaskit.js', { paths: [root] }));

(async () => {
  const CK = await CanvasKitInit({
    locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`, { paths: [root] }),
  });
  const fontData = fs.readFileSync(
    require.resolve('@expo-google-fonts/vt323/400Regular/VT323_400Regular.ttf', { paths: [root] }),
  );
  const typeface = CK.Typeface.MakeFreeTypeFaceFromData(fontData);

  // maskable icons keep content inside the central 80% "safe zone"
  const render = (size, file, { maskable = false } = {}) => {
    const surface = CK.MakeSurface(size, size);
    const canvas = surface.getCanvas();
    canvas.clear(CK.WHITE);

    const ink = new CK.Paint();
    ink.setColor(CK.BLACK);
    ink.setAntiAlias(true);

    const inset = size * (maskable ? 0.2 : 0.1);
    // hairline frame, like the app's panels
    const frame = new CK.Paint();
    frame.setColor(CK.BLACK);
    frame.setStyle(CK.PaintStyle.Stroke);
    frame.setStrokeWidth(Math.max(2, size * 0.012));
    frame.setAntiAlias(true);
    canvas.drawRect(CK.LTRBRect(inset, inset, size - inset, size - inset), frame);

    const font = new CK.Font(typeface, size * (maskable ? 0.2 : 0.26));
    const text = 'WYRD';
    const glyphs = font.getGlyphIDs(text);
    const widths = font.getGlyphWidths(glyphs, ink);
    const spacing = size * 0.02;
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
    let x = (size - total) / 2;
    const y = size / 2 + font.getSize() * 0.32;
    [...text].forEach((ch, i) => {
      canvas.drawText(ch, x, y, ink, font);
      x += widths[i] + spacing;
    });

    // a small node under the wordmark -- the brain motif
    canvas.drawCircle(size / 2, y + size * 0.1, size * 0.022, ink);

    const img = surface.makeImageSnapshot();
    fs.writeFileSync(path.join(root, 'public', file), Buffer.from(img.encodeToBytes()));
    surface.delete();
    console.log(`public/${file}`);
  };

  render(512, 'icon-512.png');
  render(192, 'icon-192.png');
  render(512, 'icon-maskable-512.png', { maskable: true });
  render(180, 'apple-touch-icon.png');
})();
