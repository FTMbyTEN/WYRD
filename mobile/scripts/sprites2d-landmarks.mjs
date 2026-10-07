// The second set of NAIJA 2099 landmarks: pictures in the poster's style, seen from ~40 degrees up.
//   node scripts/sprites2d-landmarks.mjs   (only what is missing; delete a file to redo it)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { PNG } from 'pngjs';

const REF = path.resolve('../design/naija2099-styles/4-minimal.png');
const RAW = path.resolve('scripts/.sprites-raw');
const OUT = path.resolve('public/world2d');
const VIEW = 'seen from a high three-quarter angle (camera about 40 degrees above the ground, looking at the front corner)';
const STYLE = 'one single isolated building as a game sprite, clean minimal cartoon 3D-render style exactly like the reference image (smooth shapes, soft top-left light, crisp edges, bright colours), centered, fills the frame, standing on a small patch of its own pavement, no other buildings, no text, transparent background';

const LIST = [
  ['lm-central-mosque', 'the Lagos Central Mosque on Lagos Island: a white and green mosque with a large central dome and four tall slender minarets'],
  ['lm-tinubu-square', 'Tinubu Square, Lagos: a round civic plaza with a large ornamental fountain, palm trees and benches, surrounded by low colonial facades'],
  ['lm-independence-house', 'Independence House, Lagos: a slim 1960s modernist office tower with a grid of square windows and a flat roof'],
  ['lm-necom-house', 'NECOM House, Lagos: a tall slender modernist telecom tower block with a dark facade and a radio mast on top'],
  ['lm-css-bookshop', 'the CSS Bookshops building on Broad Street, Lagos: an elegant colonial-era three-storey commercial building with arched windows and a bookshop at street level'],
  ['lm-union-bank', 'a Lagos bank headquarters on the Marina: a modern glass and granite office tower with a curved corner and a covered entrance'],
  ['lm-city-hall', 'Lagos City Hall: a stately cream colonial civic building with columns, a pediment and a clock above the entrance'],
  ['lm-idumota', 'Idumota market junction, Lagos: a busy cluster of multi-storey market buildings covered in colourful shop signs, awnings and goods, with a small clock tower'],
  ['lm-obalende', 'Obalende motor park, Lagos: a big bus park full of yellow danfo minibuses under long shade canopies, with ticket kiosks'],
  ['lm-falomo', 'Falomo shopping centre, Ikoyi: a low 1970s concrete shopping arcade with a long covered walkway and shopfronts'],
  ['lm-link-bridge', 'the Lekki-Ikoyi Link Bridge: a white cable-stayed bridge with one tall pylon and fanned cables over blue water'],
  ['lm-bar-beach', 'Bar Beach, Lagos: a stretch of golden sand with beach umbrellas, palm trees, horses and small waves, with a beach bar'],
  ['lm-federal-palace', 'the Federal Palace Hotel, Victoria Island: a long white 1960s hotel slab with balconies, by a pool and palm trees'],
  ['lm-muri-okunola', 'Muri Okunola Park, Victoria Island: a green urban park with lawns, paths, a small amphitheatre and trees'],
  ['lm-unilag-senate', 'the Senate Building of the University of Lagos: a tall white modernist tower with a grid of deep-set windows and a wide plaza in front'],
  ['lm-unilag-gate', 'the main gate of the University of Lagos: a wide monumental entrance arch with the university crest and guard houses'],
  ['lm-yaba-market', 'Yaba market, Lagos: a crowded open market of stalls with colourful umbrellas, clothes racks and goods under zinc roofs'],
  ['lm-tejuosho', 'Tejuosho market, Yaba: a modern multi-storey market mall with glass entrances and a crowd of stalls outside'],
  ['lm-oshodi', 'the Oshodi transport interchange, Lagos: a modern multi-level bus terminal with a sweeping white roof and blue BRT buses'],
  ['lm-computer-village', 'Computer Village, Ikeja: a dense block of small shops covered in phone and electronics signs, crowds and kiosks'],
  ['lm-alausa', 'the Lagos State Secretariat at Alausa, Ikeja: a group of white government office blocks around a green courtyard with flags'],
  ['lm-rail-terminal', 'the Mobolaji Johnson railway station, Lagos: a huge modern station with a long sweeping roof and tall white columns'],
  ['lm-shrine', 'the New Afrika Shrine, Ikeja: a large open-sided music venue with a big stage, a corrugated roof and colourful murals'],
  ['lm-nike-gallery', 'the Nike Art Gallery, Lekki: a five-storey art gallery building with a facade painted in bright African patterns'],
];

const run = (args) => new Promise((resolve) => execFile('higgsfield', args, { maxBuffer: 1 << 24, shell: true }, (e, o, er) => resolve(`${o}${er}`)));
function shrink(src, longest) {
  const png = PNG.sync.read(fs.readFileSync(src));
  let x0 = png.width, y0 = png.height, x1 = 0, y1 = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (png.data[(y * png.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, longest / Math.max(cw, ch));
  const W = Math.round(cw * k), H = Math.round(ch * k), out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx0 = x0 + Math.floor(x / k), sx1 = Math.max(sx0 + 1, x0 + Math.floor((x + 1) / k)), sy0 = y0 + Math.floor(y / k), sy1 = Math.max(sy0 + 1, y0 + Math.floor((y + 1) / k));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) { const i = (sy * png.width + sx) * 4, al = png.data[i + 3]; r += png.data[i] * al; g += png.data[i + 1] * al; b += png.data[i + 2] * al; a += al; n++; }
    const o = (y * W + x) * 4; out.data[o] = a ? r / a : 0; out.data[o + 1] = a ? g / a : 0; out.data[o + 2] = a ? b / a : 0; out.data[o + 3] = a / n;
  }
  return PNG.sync.write(out, { colorType: 6 });
}
async function one([name, what]) {
  const raw = path.join(RAW, `${name}.png`), out = path.join(OUT, `${name}.png`);
  if (fs.existsSync(out)) return;
  if (!fs.existsSync(raw)) {
    const log = await run(['generate', 'create', 'gpt_image_2_5', '--prompt', JSON.stringify(`${what}, ${VIEW}. ${STYLE}`), '--image-references', JSON.stringify(REF),
      '--background', 'transparent', '--quality', 'medium', '--resolution', '1k', '--aspect_ratio', '1:1', '--wait']);
    const url = log.match(/https:\/\/\S+?\.(png|webp|jpg)/)?.[0];
    if (!url) { console.log(`${name}: no image\n${log.slice(-300)}`); return; }
    fs.writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  try { fs.writeFileSync(out, shrink(raw, 560)); console.log(`${name}: ok`); } catch (e) { console.log(`${name}: ${e.message}`); }
}
fs.mkdirSync(RAW, { recursive: true });
for (let i = 0; i < LIST.length; i += 6) await Promise.all(LIST.slice(i, i + 6).map(one));
console.log('done');
