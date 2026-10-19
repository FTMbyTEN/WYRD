// Local preview of LAGOS ISLAND: the page and its map, as the Serverpod web server serves them.
const http = require('http');
const fs = require('fs');
const DIR = 'C:/Users/TEN/wyrd_serverpod/wyrd/wyrd_server/web/pages/';
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/lagos-island/map.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(fs.readFileSync(DIR + 'lagos-island-map.json')); }
  if (url === '/lagos-island' || url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(DIR + 'lagos-island.html')); }
  // any asset folder next to the page (cars, furniture, people, ...), with or without the /lagos-island prefix
  const rel = decodeURIComponent(url.replace(/^\/lagos-island\//, '/')).replace(/^\/+/, '');
  if (rel && !rel.includes('..') && /^[\w\-./]+$/.test(rel)) {
    const f = DIR + rel;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = rel.split('.').pop().toLowerCase();
      const type = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', json: 'application/json', js: 'text/javascript', css: 'text/css', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', svg: 'image/svg+xml', html: 'text/html' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }); return res.end(fs.readFileSync(f));
    }
  }
  res.writeHead(404); res.end();
}).listen(5518);
