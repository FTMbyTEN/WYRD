// DEV ONLY: receives the sprite sheets the #bake page renders and writes them to public/world2d/people/ and vehicles/.
//   node scripts/bake-receiver.mjs     (listens on localhost:8099; stop it when the bake says "done")
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/world2d');
for (const d of ['people', 'vehicles', 'pics']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method !== 'POST') { res.end('ok'); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { name, data } = JSON.parse(body);
      if (!/^(people|vehicles|pics)\/[a-z-]+\.(png|webp|json)$/.test(name)) throw new Error('bad name');
      fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
      console.log('wrote', name);
      res.end('saved');
    } catch (e) { res.statusCode = 400; res.end(String(e)); }
  });
}).listen(8099, '127.0.0.1', () => console.log('bake receiver on 8099'));
