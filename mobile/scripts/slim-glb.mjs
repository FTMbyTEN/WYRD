// Slims a generated character model for phones: keeps the mesh, skin and skeleton, drops what the
// game doesn't use (tangents, the bind-pose animation), and swaps in a smaller texture.
//
//   node scripts/slim-glb.mjs <in.glb> <smaller-texture.jpg> <out.glb> [--keep-anim]
//   node scripts/slim-glb.mjs <in.glb> - <out.glb> --anim-only
//
// The smaller texture is made beforehand (any image tool); this only repacks the file.
// --keep-anim keeps the animation; --anim-only keeps just the skeleton's animation (no mesh,
// skin or texture), for extra clips that play on a character loaded from another file.
import fs from 'node:fs';

const [inPath, texPath, outPath] = process.argv.slice(2);
const keepAnim = process.argv.includes('--keep-anim') || process.argv.includes('--anim-only');
const animOnly = process.argv.includes('--anim-only');
const src = fs.readFileSync(inPath);
const jsonLen = src.readUInt32LE(12);
const json = JSON.parse(src.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = src.subarray(binStart, binStart + src.readUInt32LE(20 + jsonLen));

// drop tangents and animations
const dropAccessors = new Set();
for (const m of json.meshes) for (const p of m.primitives) {
  if (p.attributes.TANGENT != null) { dropAccessors.add(p.attributes.TANGENT); delete p.attributes.TANGENT; }
}
if (!keepAnim) {
  for (const a of json.animations ?? []) for (const s of a.samplers) { dropAccessors.add(s.input); dropAccessors.add(s.output); }
  delete json.animations;
}
if (animOnly) {
  for (const m of json.meshes) for (const p of m.primitives) { for (const k of Object.values(p.attributes)) dropAccessors.add(k); if (p.indices != null) dropAccessors.add(p.indices); p.attributes = {}; delete p.indices; }
  for (const sk of json.skins ?? []) if (sk.inverseBindMatrices != null) dropAccessors.add(sk.inverseBindMatrices);
  for (const n of json.nodes) { delete n.mesh; delete n.skin; }
  delete json.meshes; delete json.skins; delete json.materials; delete json.textures; delete json.images; delete json.samplers;
}

// which buffer views are still needed
const keepViews = new Set();
json.accessors.forEach((a, i) => { if (!dropAccessors.has(i) && a.bufferView != null) keepViews.add(a.bufferView); });
for (const im of json.images ?? []) keepViews.add(im.bufferView);

// rebuild the binary chunk: kept views in order, the image replaced by the smaller texture
const tex = animOnly ? Buffer.alloc(0) : fs.readFileSync(texPath);
const imageViews = new Set((json.images ?? []).map((im) => im.bufferView));
const parts = [];
const viewMap = new Map();
let offset = 0;
json.bufferViews.forEach((v, i) => {
  if (!keepViews.has(i)) return;
  const data = imageViews.has(i) ? tex : bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const pad = (4 - (data.length % 4)) % 4;
  viewMap.set(i, { ...v, buffer: 0, byteOffset: offset, byteLength: data.length });
  parts.push(data, Buffer.alloc(pad));
  offset += data.length + pad;
});
const newViews = [], idx = new Map();
for (const [old, v] of viewMap) { idx.set(old, newViews.length); newViews.push(v); }
json.bufferViews = newViews;
// accessors: keep the used ones, renumber
const accMap = new Map(), newAcc = [];
json.accessors.forEach((a, i) => { if (dropAccessors.has(i)) return; accMap.set(i, newAcc.length); newAcc.push(a.bufferView != null ? { ...a, bufferView: idx.get(a.bufferView) } : a); });
json.accessors = newAcc;
for (const a of json.animations ?? []) for (const sm of a.samplers) { sm.input = accMap.get(sm.input); sm.output = accMap.get(sm.output); }
for (const m of json.meshes ?? []) for (const p of m.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
  if (p.indices != null) p.indices = accMap.get(p.indices);
}
for (const s of json.skins ?? []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
for (const im of json.images ?? []) { im.bufferView = idx.get(im.bufferView); im.mimeType = 'image/jpeg'; }
const newBin = Buffer.concat(parts);
json.buffers = [{ byteLength: newBin.length }];

const jsonBuf = Buffer.from(JSON.stringify(json));
const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + newBin.length;
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length + jsonPad.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(outPath, Buffer.concat([head, jh, jsonBuf, jsonPad, bh, newBin]));
console.log(`${inPath}: ${(src.length / 1024).toFixed(0)} KB -> ${outPath}: ${(total / 1024).toFixed(0)} KB`);
