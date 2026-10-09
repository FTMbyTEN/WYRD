import { drawBridges, drawGround, drawStill, nightGround, nightTint, toScreen, viewOf, type Cam, type Light, type Sand, type Sprite, type View } from './render';
import type { World } from './tiles';

const C = 256; // a cache tile, in CSS pixels
/** device pixels of real scenery drawn round each tile and never shown: copying only a tile's solid middle keeps its
 *  edges from blending with what's behind, which showed as hairlines between tiles at reduced sharpness */
const M = 2;
const MAX = 140; // tiles kept (the screen and two rings round it, with room to spare)

type Chunk = { cv: HTMLCanvasElement; i: number; j: number; used: number; box: [number, number, number, number] };

/**
 * The still city, drawn once and kept: the screen is cut into 256-px tiles fixed to a point in the world, and each
 * tile holds the ground, bridges, buildings, trees, lamps and landmarks (at night: darkened, with the lamp pools and
 * the neon glow). While the camera only slides, the tiles slide with it and only new ones are drawn -- the ones on
 * screen at once, the ring around them a little each frame. Turning, tilting or zooming starts afresh; a newly
 * loaded part of the map redraws only the tiles it touches.
 */
export class Scenery {
  private key = '';
  private pending = '';
  private ax = 0; private az = 0;
  private chunks = new Map<string, Chunk>();
  /** the view the tiles were drawn for: its zoom, and the rest of it (turn, tilt, night, resolution) */
  private keyScale = 0; private keyRest = '';
  /** earlier sets of tiles (up to two), kept while a zoom settles: shown scaled under the new ones until they're all in.
   *  Two, not one: zooming again before the new set is in would otherwise leave its gaps showing whatever the canvas
   *  last held -- the city at another size, cut off along tile edges */
  private olds: { chunks: Map<string, Chunk>; scale: number; ax: number; az: number }[] = [];
  private release(set: { chunks: Map<string, Chunk> }) { set.chunks.forEach((ch) => this.spare.length < MAX && this.spare.push(ch.cv)); }
  /** whether a set of tiles, drawn for zoom [scale] round (ax, az), fills the whole screen at the camera's zoom now
   *  (zooming out shows ground no tile was ever drawn for: then the city is drawn directly instead) */
  private fills(cam: Cam, chunks: Map<string, Chunk>, scale: number, ax: number, az: number) {
    if (!chunks.size) return false;
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (const ch of chunks.values()) { i0 = Math.min(i0, ch.i); i1 = Math.max(i1, ch.i); j0 = Math.min(j0, ch.j); j1 = Math.max(j1, ch.j); }
    const a = toScreen(cam, ax, az), S = C * (cam.scale / scale);
    if (a.sx + i0 * S > 0 || a.sy + j0 * S > 0 || a.sx + (i1 + 1) * S < cam.w || a.sy + (j1 + 1) * S < cam.h) return false;
    // no holes worth the name: the screen's tiles all there
    const x0 = Math.floor(-a.sx / S), x1 = Math.floor((cam.w - a.sx) / S), y0 = Math.floor(-a.sy / S), y1 = Math.floor((cam.h - a.sy) / S);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (!chunks.has(`${i},${j}`)) return false;
    return true;
  }
  /** some set we have fills the screen at this zoom */
  private covered(cam: Cam) {
    return this.fills(cam, this.chunks, this.keyScale, this.ax, this.az) || this.olds.some((o) => this.fills(cam, o.chunks, o.scale, o.ax, o.az));
  }
  /** under a picture that's still coming in: plain ground first (nothing stale ever shows), then the earlier sets */
  private underlay(ctx: CanvasRenderingContext2D, cam: Cam, dpr: number, night: boolean) {
    ctx.fillStyle = night ? '#1B2330' : '#A9C98A'; ctx.fillRect(0, 0, cam.w, cam.h);
    for (const o of this.olds) this.scaled(ctx, cam, dpr, o.chunks, o.scale, o.ax, o.az);
  }
  private seen = 0; // how much of the world's change list has been applied
  private tmp = document.createElement('canvas');
  /** tile canvases no longer in use, for the next tiles (making a new canvas each time churned memory) */
  private spare: HTMLCanvasElement[] = [];
  private drop(k: string) { const ch = this.chunks.get(k); if (ch) { this.chunks.delete(k); if (this.spare.length < MAX) this.spare.push(ch.cv); } }
  private dropAll() { for (const k of [...this.chunks.keys()]) this.drop(k); }
  private glow = document.createElement('canvas');
  constructor(private world: World) {}
  /** start afresh (a landmark settled on its plot: rare, and it must show at once) */
  reset() { this.dropAll(); }

  /**
   * Lays the cached scenery on [ctx] (already scaled by dpr). Returns false while the camera is turning, tilting or
   * zooming (the caller then draws directly). [started]: when the frame began, for the time budget.
   */
  draw(ctx: CanvasRenderingContext2D, cam: Cam, dpr: number, night: boolean, sea: { p: Float32Array; island: boolean }[], sand: Sand[], fixed: Sprite[], lampPools: Light[], started: number): boolean {
    const rest = `${cam.yaw.toFixed(5)}|${cam.tilt.toFixed(5)}|${night}|${dpr}`, key = `${cam.scale.toFixed(5)}|${rest}`;
    if (key !== this.key) {
      // Zooming only (same turn, tilt, light, resolution): the tiles are the same picture at another size, so they're
      // shown scaled -- exact, and nearly free -- instead of the whole city drawn afresh every frame of the zoom
      // (zoomed right out that's thousands of buildings a frame: a couple of frames a second)
      const zooming = rest === this.keyRest && (this.chunks.size > 0 || this.olds.length > 0);
      if (key !== this.pending) {
        this.pending = key;
        if (zooming && this.covered(cam)) { this.underlay(ctx, cam, dpr, night); this.scaled(ctx, cam, dpr, this.chunks, this.keyScale, this.ax, this.az); return true; }
        return false;
      }
      // the camera has settled: start afresh -- after a zoom, the old tiles stay underneath until the new ones are in
      if (zooming) {
        this.olds.push({ chunks: this.chunks, scale: this.keyScale, ax: this.ax, az: this.az });
        while (this.olds.length > 2) this.release(this.olds.shift()!);
        this.chunks = new Map();
      } else { this.dropAll(); this.olds.forEach((o) => this.release(o)); this.olds = []; }
      this.stats.resets++; this.key = key; this.keyScale = cam.scale; this.keyRest = rest; this.ax = cam.x; this.az = cam.z; this.seen = this.world.changes.length;
    }
    // parts of the map that changed (a tile loaded, a landmark settled): drop the tiles they touch
    while (this.seen < this.world.changes.length) {
      const [x0, x1, z0, z1] = this.world.changes[this.seen++];
      for (const [k, ch] of [...this.chunks]) if (ch.box[0] < x1 && ch.box[1] > x0 && ch.box[2] < z1 && ch.box[3] > z0) this.drop(k);
    }
    const a = toScreen(cam, this.ax, this.az);
    const i0 = Math.floor(-a.sx / C), i1 = Math.floor((cam.w - a.sx) / C), j0 = Math.floor(-a.sy / C), j1 = Math.floor((cam.h - a.sy) / C);
    const now = performance.now();
    /** a tile's solid middle at (x, y), [size] across: its edges on whole device pixels, so tiles meet exactly (at a
     *  fractional resolution a tile is a fraction of a pixel wide, and the shared column between two showed the frame
     *  before through it, as a hairline) */
    const place = (cv: HTMLCanvasElement, x: number, y: number, size: number) => {
      const x0 = Math.round(x * dpr), y0 = Math.round(y * dpr), x1 = Math.round((x + size) * dpr), y1 = Math.round((y + size) * dpr);
      ctx.drawImage(cv, M, M, C * dpr, C * dpr, x0 / dpr, y0 / dpr, (x1 - x0) / dpr, (y1 - y0) / dpr);
    };
    const render = (i: number, j: number) => this.render(i, j, cam, dpr, night, sea, sand, fixed, lampPools, now);
    // what's on screen. A row of new tiles as the camera slides is drawn at once (cheap); after a turn, tilt or zoom,
    // when most of the screen is new, the tiles are drawn a few a frame within a time budget and the caller draws the
    // city directly until they're all in -- drawing the whole screen's worth in one frame stalled slower graphics for
    // a good part of a second (the drop to a couple of frames a second after moving the camera)
    let missing = 0, total = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { total++; if (!this.chunks.has(`${i},${j}`)) missing++; }
    if (missing > total * 0.3) {
      let made = 0;
      for (let j = j0; j <= j1 && missing; j++) for (let i = i0; i <= i1 && missing; i++) {
        if (this.chunks.has(`${i},${j}`)) continue;
        if (made && performance.now() - started > 8) break; // (always at least one, so it gets there)
        render(i, j); made++; missing--;
      }
      if (missing) {
        if (!this.olds.length || !this.olds.some((o) => this.fills(cam, o.chunks, o.scale, o.ax, o.az))) return false;
        // the earlier tiles, scaled, with the new ones laid over as they come
        this.underlay(ctx, cam, dpr, night);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const ch = this.chunks.get(`${i},${j}`);
          if (!ch) continue;
          ch.used = now;
          place(ch.cv, a.sx + i * C, a.sy + j * C, C);
        }
        return true;
      }
    }
    if (this.olds.length) { this.olds.forEach((o) => this.release(o)); this.olds = []; } // (all in: the earlier sets go)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ch = this.chunks.get(`${i},${j}`) ?? render(i, j);
      ch.used = now;
      place(ch.cv, a.sx + i * C, a.sy + j * C, C);
    }
    // the ring around the screen, ahead of the camera: a few each frame while there's time
    // (one at a time, and only while the frame has time to spare: a frame is 16.7 ms)
    // (two rings out, nearest first, as many as fit while the frame has time to spare: a frame is 16.7 ms)
    outer: for (let ring = 1; ring <= 2; ring++) for (let j = j0 - ring; j <= j1 + ring; j++) for (let i = i0 - ring; i <= i1 + ring; i++) {
      if (j > j0 - ring && j < j1 + ring && i > i0 - ring && i < i1 + ring) continue; // (only this ring's edge)
      if (performance.now() - started > 10) break outer;
      if (!this.chunks.has(`${i},${j}`)) render(i, j);
    }
    if (this.chunks.size > MAX) {
      const old = [...this.chunks.entries()].sort((p, q) => p[1].used - q[1].used).slice(0, this.chunks.size - MAX);
      for (const [k] of old) this.drop(k);
    }
    return true;
  }

  /** [chunks], drawn for zoom [scale] round the world point (ax, az), shown at the camera's zoom now (only the zoom may
   *  differ: the picture is then the same, scaled about that point) */
  private scaled(ctx: CanvasRenderingContext2D, cam: Cam, dpr: number, chunks: Map<string, Chunk>, scale: number, ax: number, az: number) {
    const a = toScreen(cam, ax, az), k = cam.scale / scale, S = C * k;
    for (const ch of chunks.values()) {
      const x = a.sx + ch.i * S, y = a.sy + ch.j * S;
      if (x > cam.w || y > cam.h || x + S < 0 || y + S < 0) continue;
      const x0 = Math.round(x * dpr), y0 = Math.round(y * dpr), x1 = Math.round((x + S) * dpr), y1 = Math.round((y + S) * dpr);
      ctx.drawImage(ch.cv, M, M, C * dpr, C * dpr, x0 / dpr, y0 / dpr, (x1 - x0) / dpr, (y1 - y0) / dpr);
    }
  }
  /** (debug) tiles drawn, time spent drawing them, and fresh starts */
  stats = { drawn: 0, ms: 0, resets: 0 };
  private render(i: number, j: number, cam: Cam, dpr: number, night: boolean, sea: { p: Float32Array; island: boolean }[], sand: Sand[], fixed: Sprite[], lampPools: Light[], now: number): Chunk {
    const t0 = performance.now();
    // the world point under the tile's centre (the screen is a turned, tilted plane: undo it)
    const co = Math.cos(cam.yaw), si = Math.sin(cam.yaw);
    const at = (ox: number, oy: number) => { const rx = ox / cam.scale, rz = oy / (cam.scale * cam.tilt); return { x: this.ax + co * rx + si * rz, z: this.az - si * rx + co * rz }; };
    const mid = at((i + 0.5) * C, (j + 0.5) * C);
    // (drawn M device pixels bigger all round: the border is real scenery, so a tile's edge never blends with nothing)
    const cc: Cam = { ...cam, x: mid.x, z: mid.z, w: C + (2 * M) / dpr, h: C + (2 * M) / dpr };
    const v0 = viewOf(cc);
    // tall buildings stand on ground further down the screen and reach up into the tile
    const tall = 210 * cam.rise / Math.max(0.1, cam.tilt); // (the tallest: Eko Atlantic's towers, NECOM's mast)
    const vu: View = { minX: v0.minX - tall, maxX: v0.maxX + tall, minZ: v0.minZ - tall, maxZ: v0.maxZ + tall };
    const cv = this.spare.pop() ?? document.createElement('canvas');
    const size = Math.ceil(C * dpr) + 2 * M;
    if (cv.width !== size || cv.height !== size) { cv.width = size; cv.height = size; }
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, size, size);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tiles = [...this.world.tiles.values()];
    drawGround(g, cc, tiles, sea, v0, sand);
    drawBridges(g, cc, tiles, v0);
    if (night) {
      nightGround(g, cc, tiles, lampPools, v0);
      for (const t of [this.tmp, this.glow]) if (t.width !== cv.width || t.height !== cv.height) { t.width = cv.width; t.height = cv.height; }
      const l = this.tmp.getContext('2d')!, gl = this.glow.getContext('2d')!;
      for (const x of [l, gl]) { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); x.setTransform(dpr, 0, 0, dpr, 0, 0); }
      drawStill(l, cc, tiles, fixed, vu, true, gl);
      nightTint(l, cc);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.tmp, 0, 0);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(this.glow, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(this.glow, 0, 0); g.restore();
    } else {
      drawStill(g, cc, tiles, fixed, vu, false);
    }
    // the tile's reach in the world, for knowing when a change touches it
    const cs = [at(i * C, j * C), at((i + 1) * C, j * C), at(i * C, (j + 1) * C), at((i + 1) * C, (j + 1) * C)];
    const box: Chunk['box'] = [Math.min(...cs.map((p) => p.x)) - tall, Math.max(...cs.map((p) => p.x)) + tall, Math.min(...cs.map((p) => p.z)) - tall, Math.max(...cs.map((p) => p.z)) + tall];
    const ch = { cv, i, j, used: now, box };
    this.chunks.set(`${i},${j}`, ch);
    this.stats.drawn++; this.stats.ms += performance.now() - t0;
    return ch;
  }
}
