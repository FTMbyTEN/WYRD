import { drawBridges, drawGround, drawStill, nightGround, nightTint, toScreen, viewOf, type Cam, type Light, type Sand, type Sprite, type View } from './render';
import type { World } from './tiles';

const C = 256; // a cache tile, in CSS pixels
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
  private seen = 0; // how much of the world's change list has been applied
  private tmp = document.createElement('canvas');
  private glow = document.createElement('canvas');
  constructor(private world: World) {}

  /**
   * Lays the cached scenery on [ctx] (already scaled by dpr). Returns false while the camera is turning, tilting or
   * zooming (the caller then draws directly). [started]: when the frame began, for the time budget.
   */
  draw(ctx: CanvasRenderingContext2D, cam: Cam, dpr: number, night: boolean, sea: { p: Float32Array; island: boolean }[], sand: Sand[], fixed: Sprite[], lampPools: Light[], started: number): boolean {
    const key = `${cam.scale.toFixed(5)}|${cam.yaw.toFixed(5)}|${cam.tilt.toFixed(5)}|${night}|${dpr}`;
    if (key !== this.key) {
      // wait until the camera holds still for a frame before starting afresh
      if (key !== this.pending) { this.pending = key; return false; }
      this.stats.resets++; this.key = key; this.ax = cam.x; this.az = cam.z; this.chunks.clear(); this.seen = this.world.changes.length;
    }
    // parts of the map that changed (a tile loaded, a landmark settled): drop the tiles they touch
    while (this.seen < this.world.changes.length) {
      const [x0, x1, z0, z1] = this.world.changes[this.seen++];
      for (const [k, ch] of this.chunks) if (ch.box[0] < x1 && ch.box[1] > x0 && ch.box[2] < z1 && ch.box[3] > z0) this.chunks.delete(k);
    }
    const a = toScreen(cam, this.ax, this.az);
    const i0 = Math.floor(-a.sx / C), i1 = Math.floor((cam.w - a.sx) / C), j0 = Math.floor(-a.sy / C), j1 = Math.floor((cam.h - a.sy) / C);
    const now = performance.now();
    const render = (i: number, j: number) => this.render(i, j, cam, dpr, night, sea, sand, fixed, lampPools, now);
    // what's on screen: drawn now if missing
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ch = this.chunks.get(`${i},${j}`) ?? render(i, j);
      ch.used = now;
      const x = Math.round((a.sx + i * C) * dpr) / dpr, y = Math.round((a.sy + j * C) * dpr) / dpr;
      ctx.drawImage(ch.cv, x, y, C, C);
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
      for (const [k] of old) this.chunks.delete(k);
    }
    return true;
  }

  /** (debug) tiles drawn, time spent drawing them, and fresh starts */
  stats = { drawn: 0, ms: 0, resets: 0 };
  private render(i: number, j: number, cam: Cam, dpr: number, night: boolean, sea: { p: Float32Array; island: boolean }[], sand: Sand[], fixed: Sprite[], lampPools: Light[], now: number): Chunk {
    const t0 = performance.now();
    // the world point under the tile's centre (the screen is a turned, tilted plane: undo it)
    const co = Math.cos(cam.yaw), si = Math.sin(cam.yaw);
    const at = (ox: number, oy: number) => { const rx = ox / cam.scale, rz = oy / (cam.scale * cam.tilt); return { x: this.ax + co * rx + si * rz, z: this.az - si * rx + co * rz }; };
    const mid = at((i + 0.5) * C, (j + 0.5) * C);
    const cc: Cam = { ...cam, x: mid.x, z: mid.z, w: C, h: C };
    const v0 = viewOf(cc);
    // tall buildings stand on ground further down the screen and reach up into the tile
    const tall = 95 * cam.rise / Math.max(0.1, cam.tilt);
    const vu: View = { minX: v0.minX - tall, maxX: v0.maxX + tall, minZ: v0.minZ - tall, maxZ: v0.maxZ + tall };
    const cv = document.createElement('canvas'); cv.width = Math.ceil(C * dpr); cv.height = Math.ceil(C * dpr);
    const g = cv.getContext('2d')!;
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
      g.drawImage(this.tmp, 0, 0, C, C);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(this.glow, 0, 0, C, C);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(this.glow, 0, 0, C, C); g.restore();
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
