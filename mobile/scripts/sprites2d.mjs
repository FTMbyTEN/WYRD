// Generates NAIJA 2099's 2D sprites with Higgsfield (GPT Image 2.5, transparent backgrounds),
// in the style of design/naija2099-styles/4-minimal.png, then shrinks each to game size.
//
//   node scripts/sprites2d.mjs            (only what is missing; delete a file to redo it)
//
// Raw downloads go to scripts/.sprites-raw/ (not committed); game sprites to public/world2d/.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { PNG } from 'pngjs';

const REF = path.resolve('../design/naija2099-styles/4-minimal.png');
const RAW = path.resolve('scripts/.sprites-raw');
const OUT = path.resolve('public/world2d');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const VIEW = 'seen from straight above at a slight tilt (top-down, about 75 degrees from the ground), pointing straight up the image';
const STYLE = 'one single isolated game sprite, clean minimal cartoon 3D-render style exactly like the reference image (smooth shapes, soft top-left light, crisp edges), centered, fills most of the frame, no ground, no shadow, no text, transparent background';

// [file, size in game px (longest side), prompt]
const SPRITES = [
  // vehicles: pointing up the image; the game rotates them along the road
  ['car-danfo', 96, `a yellow Lagos danfo minibus with black stripes, ${VIEW}`],
  ['car-red', 80, `a small red futuristic hatchback car with glowing cyan underlights, ${VIEW}`],
  ['car-blue', 80, `a blue futuristic sedan car with glowing cyan underlights, ${VIEW}`],
  ['car-white', 84, `a white sporty futuristic coupe with glowing cyan underlights, ${VIEW}`],
  ['car-purple', 80, `a purple futuristic hover car with glowing cyan underlights, ${VIEW}`],
  ['car-grey', 80, `a dark grey futuristic city car with glowing cyan underlights, ${VIEW}`],
  ['bus-brt', 150, `a long blue Lagos BRT city bus, ${VIEW}`],
  ['okada', 44, `a motorcycle taxi (okada) with a rider in a helmet, ${VIEW}`],
  ['boat', 120, `a white speedboat, ${VIEW}`],
  // people: a high top-down 3/4 view, standing
  ['player', 44, 'a young Nigerian man in a yellow t-shirt and dark trousers with a backpack, seen from high above at a 3/4 top-down angle, standing'],
  ['walker-1', 36, 'a Nigerian woman in a colourful ankara dress, seen from high above at a 3/4 top-down angle, walking'],
  ['walker-2', 36, 'a Nigerian man in a blue shirt, seen from high above at a 3/4 top-down angle, walking'],
  ['walker-3', 36, 'a Nigerian market woman carrying a basket on her head, seen from high above at a 3/4 top-down angle'],
  ['walker-4', 36, 'a Nigerian man in a white kaftan, seen from high above at a 3/4 top-down angle, walking'],
  // street props: the reference's high 3/4 view
  ['palm', 110, 'a tall coconut palm tree, seen from high above at a 3/4 top-down angle'],
  ['tree', 90, 'a round leafy green street tree, seen from high above at a 3/4 top-down angle'],
  ['lamp', 90, 'a modern street lamp post with a cool white glowing light and a small blue banner, seen from high above at a 3/4 top-down angle'],
  ['stall-yellow', 80, 'a small Lagos market stall with a big yellow umbrella and fruit crates, seen from high above at a 3/4 top-down angle'],
  ['stall-blue', 80, 'a small Lagos market stall with a big blue umbrella and vegetables, seen from high above at a 3/4 top-down angle'],
  ['stall-orange', 80, 'a small Lagos street food stall with an orange canopy, seen from high above at a 3/4 top-down angle'],
  ['kiosk', 70, 'a small roadside kiosk shop with a striped awning, seen from high above at a 3/4 top-down angle'],
  ['bush', 50, 'a round trimmed green bush, seen from high above at a 3/4 top-down angle'],
  ['fountain', 90, 'a small round plaza fountain with blue water, seen from high above at a 3/4 top-down angle'],
  ['busstop', 90, 'a modern bus stop shelter with a glass roof, seen from high above at a 3/4 top-down angle'],
  // Lagos landmarks, as the reference draws the Civic Centre: high 3/4 view, recognisable
  ['lm-civic-centre', 300, 'the Lagos Civic Centre on Victoria Island: a tall slim curved blue glass tower with white vertical fins on a round white podium, seen from high above at a 3/4 top-down angle'],
  ['lm-national-theatre', 320, 'the National Theatre in Iganmu, Lagos: a huge round white building with a military-cap-shaped saddle roof and folded concrete rim, seen from high above at a 3/4 top-down angle'],
  ['lm-cathedral', 240, 'the Cathedral Church of Christ, Marina, Lagos: a cream Gothic Revival Anglican cathedral with a tall square bell tower and pointed arched windows, seen from high above at a 3/4 top-down angle'],
  ['lm-lekki-toll', 300, 'the Lekki toll gate plaza in Lagos: a wide toll plaza with a long white curved canopy over many lanes of booths, seen from high above at a 3/4 top-down angle'],
  ['lm-eko-hotel', 280, 'Eko Hotel on Victoria Island Lagos: a long tall white hotel block with rows of balconies and a palm-lined pool, seen from high above at a 3/4 top-down angle'],
  ['lm-balogun', 280, 'Balogun Market in Lagos Island: a dense cluster of market stalls with colourful umbrellas and rusty roofs packed between low buildings, seen from high above at a 3/4 top-down angle'],
  ['lm-stadium', 320, 'the National Stadium in Surulere, Lagos: an oval concrete football stadium with a green pitch, running track and floodlight towers, seen from high above at a 3/4 top-down angle'],
  ['lm-tbs', 280, 'Tafawa Balewa Square in Lagos: a large open parade square with a white arched entrance gate and grandstands, seen from high above at a 3/4 top-down angle'],
  ['lm-airport', 320, 'Murtala Muhammed International Airport terminal in Lagos: a long modern terminal building with a wavy white roof and glass front, seen from high above at a 3/4 top-down angle'],
  ['lm-mall', 260, 'a big modern shopping mall in Ikeja Lagos: a wide glass-and-white mall building with a car park, seen from high above at a 3/4 top-down angle'],
  ['lm-eko-atlantic', 300, 'Eko Atlantic City towers in Lagos: a cluster of sleek modern glass skyscrapers on reclaimed land by the ocean, seen from high above at a 3/4 top-down angle'],
  ['lm-ojuelegba', 260, 'Ojuelegba junction in Lagos: a busy flyover bridge crossing over a road with yellow danfos below, seen from high above at a 3/4 top-down angle'],
];

const run = (args) => new Promise((resolve) => execFile('higgsfield', args, { maxBuffer: 1 << 24, shell: true }, (err, out, errOut) => resolve(`${out}${errOut}`)));

// box-filter downscale (alpha-weighted) so edges stay clean
function shrink(src, longest) {
  const png = PNG.sync.read(fs.readFileSync(src));
  // crop to the visible pixels first
  let x0 = png.width, y0 = png.height, x1 = 0, y1 = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) throw new Error('empty sprite');
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, longest * 2 / Math.max(cw, ch)); // 2x for sharp high-dpi screens
  const W = Math.max(1, Math.round(cw * k)), H = Math.max(1, Math.round(ch * k));
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx0 = x0 + Math.floor(x / k), sx1 = Math.max(sx0 + 1, x0 + Math.floor((x + 1) / k));
    const sy0 = y0 + Math.floor(y / k), sy1 = Math.max(sy0 + 1, y0 + Math.floor((y + 1) / k));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
      const i = (sy * png.width + sx) * 4, al = png.data[i + 3];
      r += png.data[i] * al; g += png.data[i + 1] * al; b += png.data[i + 2] * al; a += al; n++;
    }
    const o = (y * W + x) * 4;
    out.data[o] = a ? r / a : 0; out.data[o + 1] = a ? g / a : 0; out.data[o + 2] = a ? b / a : 0; out.data[o + 3] = a / n;
  }
  return PNG.sync.write(out, { colorType: 6 });
}

async function one([name, size, what]) {
  const raw = path.join(RAW, `${name}.png`), out = path.join(OUT, `${name}.png`);
  if (!fs.existsSync(raw)) {
    const log = await run(['generate', 'create', 'gpt_image_2_5', '--prompt', JSON.stringify(`${what}. ${STYLE}`), '--image-references', JSON.stringify(REF),
      '--background', 'transparent', '--quality', 'medium', '--resolution', '1k', '--aspect_ratio', '1:1', '--wait']);
    const url = log.match(/https:\/\/\S+?\.(png|webp|jpg)/)?.[0];
    if (!url) { console.log(`${name}: no image\n${log.slice(-400)}`); return; }
    fs.writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  try { fs.writeFileSync(out, shrink(raw, size)); console.log(`${name}: ok`); } catch (e) { console.log(`${name}: ${e.message}`); }
}

const todo = SPRITES.filter(([n]) => !fs.existsSync(path.join(OUT, `${n}.png`)));
for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(one));
fs.writeFileSync(path.join(OUT, 'sprites.json'), JSON.stringify(Object.fromEntries(SPRITES.map(([n, s]) => [n, s]))));
console.log('done');
