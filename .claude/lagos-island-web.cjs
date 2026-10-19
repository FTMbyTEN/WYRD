// Serves the lagos-island repo's web folder (the standalone game) on localhost.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || 'C:/Users/TEN/lagos-island/web');
const PORT = Number(process.argv[3] || 5519);
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };
http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.resolve(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);
