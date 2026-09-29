// Expo's web dev server and `expo export --platform web` both serve static files from
// mobile/public/ at the site root, but neither one knows to copy canvaskit.wasm there on its
// own — @shopify/react-native-skia's web loader (LoadSkiaWeb) fetches it as a plain relative
// URL (`canvaskit.wasm`), so without this the request 404s to index.html and CanvasKit's
// WebAssembly.instantiate() chokes on HTML bytes instead of a wasm binary. Runs on `npm install`
// so this is transparent — nothing to remember, no platform-specific shell command.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', 'full', 'canvaskit.wasm');
const destDir = path.join(__dirname, '..', 'public');
const dest = path.join(destDir, 'canvaskit.wasm');

if (!fs.existsSync(src)) {
  console.warn('[copy-canvaskit] canvaskit-wasm not found — skipping (web target will not have Skia).');
  process.exit(0);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-canvaskit] copied canvaskit.wasm -> mobile/public/canvaskit.wasm');

// pdf.js (reading attached PDFs in Dialogue Link) is served the same way, as static files the
// app loads only when someone actually attaches a PDF -- it never enlarges the app's own bundle.
const pdfSrc = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');
const pdfDest = path.join(destDir, 'pdfjs');
if (fs.existsSync(pdfSrc)) {
  fs.mkdirSync(pdfDest, { recursive: true });
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) fs.copyFileSync(path.join(pdfSrc, f), path.join(pdfDest, f));
  console.log('[copy-canvaskit] copied pdf.js -> mobile/public/pdfjs/');
}
