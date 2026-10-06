import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { VN, buildShapes } from '../vortex/shapes';
import { NOISE } from '../vortex/glslNoise';
import { LITE } from '../util/perf';
import { morph } from '../theme';
import type { VortexHandle } from './VortexCanvas';

/**
 * The gate's vortex as fine dust, on the GPU (WebGL2): tens of thousands of grains, each resting at
 * its own scattered spot on WYRD's current shape. A change of shape is a flow, not a slide: grains
 * leave one after another (a wave across the form), are carried through a curl-noise current that's
 * strongest halfway, and settle into the new shape; at rest they keep a faint drift. All motion is
 * computed in the vertex shader from a handful of numbers per frame, so the CPU does almost nothing.
 *
 * Same handle as VortexCanvas (burst, setIntensity, goTo), so the gate and the intro's hand-off
 * drive it the same way.
 */
const COUNT = LITE ? 9000 : 22000;
const FLOW_MS = 2600; // a shape change: longer than the old slide, so the flow can be seen
const { HOLD_MS, BURST_MS } = morph;

const VERT = /* glsl */ `#version 300 es
precision highp float;
${NOISE}
in vec3 aFrom; in vec3 aTo; in vec4 aSeed; // seed: x,y,z jitter direction, w random 0..1
uniform float uFlow;   // 0..1 progress of the current change
uniform float uTime;   // seconds
uniform float uYaw, uPitch, uScale, uPx, uIntensity, uAspect;
uniform float uScatter; // 0 = the shape, 1 = blown out to a faint haze (the stage cleared for sign-in)
out float vAlpha;
out vec3 vCol;
vec3 warmLagos(float k){
  if (k < 0.46) return vec3(0.141, 0.192, 0.420);      // Adire indigo
  if (k < 0.72) return vec3(0.769, 0.341, 0.180);      // terracotta
  if (k < 0.86) return vec3(0.886, 0.639, 0.169);      // ochre
  return vec3(0.184, 0.420, 0.298);                    // palm green
}
float ease(float t){ return t*t*t*(t*(t*6.0-15.0)+10.0); } // smootherstep: no snap at either end
void main(){
  // each grain leaves on its own beat: a wave that sweeps across the shape, with a little randomness
  float wave = clamp((aFrom.y + 1.2) / 2.4, 0.0, 1.0) * 0.45 + aSeed.w * 0.2;
  float t = ease(clamp((uFlow - wave) / 0.35, 0.0, 1.0));
  vec3 p = mix(aFrom, aTo, t);
  // carried by the current mid-flight, most at the halfway point, nothing once it has landed
  float carry = sin(3.14159 * t);
  p += curl(p * 1.25 + vec3(0.0, uTime * 0.12, aSeed.w * 4.0)) * carry * (0.32 + uIntensity * 0.25);
  // at rest: a faint drift of the grain around its home
  p += aSeed.xyz * (0.012 + 0.006 * sin(uTime * 0.9 + aSeed.w * 30.0));
  // scattered: each grain is blown outwards from the centre on its own beat, swirling as it goes
  float s = smoothstep(aSeed.w * 0.35, 0.65 + aSeed.w * 0.35, uScatter);
  vec3 out_ = normalize(p + aSeed.xyz * 0.3) * (1.4 + aSeed.w * 2.2) + curl(p * 0.9 + vec3(uTime * 0.08)) * 0.9;
  p += out_ * s;
  // turn slowly, tilt a little, then a simple perspective
  float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);
  vec3 r = vec3(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy);
  r = vec3(r.x, r.y * cp - r.z * sp, r.y * sp + r.z * cp);
  float d = 7.5 - r.z;
  float k = uScale / d;
  gl_Position = vec4(r.x * k / uAspect, r.y * k, 0.0, 1.0);
  // fine grains; nearer ones a touch bigger and darker
  // capped, so grains blown towards the viewer stay grains rather than blobs
  gl_PointSize = min(uPx * (0.9 + aSeed.w * 0.9) * (6.5 / d), uPx * 2.4);
  vCol = warmLagos(fract(aSeed.w * 7.31));
  vAlpha = clamp((0.55 + uIntensity * 0.25) * (7.0 / d) - carry * 0.15, 0.12, 0.95) * (1.0 - s * 0.8) * smoothstep(1.2, 4.0, d); // dust passing the lens fades out
}`;

// The background: fine grains through deep space behind the shape, drifting on the same slow
// current and turning gently with the scene -- the same material as the vortex, just far and faint.
const BG_COUNT = LITE ? 2500 : 7000;
const BG_VERT = /* glsl */ `#version 300 es
precision highp float;
${NOISE}
in vec4 aBg; // xyz home in a wide box behind the shape, w random 0..1
uniform float uTime, uYaw, uScale, uPx, uAspect, uScatter;
out float vAlpha;
out vec3 vCol;
vec3 warmLagos(float k){
  if (k < 0.46) return vec3(0.141, 0.192, 0.420);      // Adire indigo
  if (k < 0.72) return vec3(0.769, 0.341, 0.180);      // terracotta
  if (k < 0.86) return vec3(0.886, 0.639, 0.169);      // ochre
  return vec3(0.184, 0.420, 0.298);                    // palm green
}
void main(){
  vec3 p = aBg.xyz;
  p += curl(p * 0.35 + vec3(0.0, uTime * 0.035, aBg.w * 3.0)) * 0.45; // the slow current
  p.y = mod(p.y + uTime * (0.02 + aBg.w * 0.03) + 4.0, 8.0) - 4.0;   // rising very slowly, wrapping round
  float yaw = uYaw * 0.35; // turns with the scene, slower: it's further away
  float cy = cos(yaw), sy = sin(yaw);
  // turned about the field's own middle, so it stays spread across the whole screen
  vec3 q = p - vec3(0.0, 0.0, -5.5);
  vec3 r = vec3(q.x * cy - q.z * sy, q.y, q.x * sy + q.z * cy) + vec3(0.0, 0.0, -5.5);
  float d = 7.5 - r.z;
  float k = uScale / max(d, 0.5);
  gl_Position = vec4(r.x * k / uAspect, r.y * k, 0.0, 1.0);
  gl_PointSize = uPx * (1.0 + aBg.w * 1.0) * clamp(6.0 / d, 0.6, 1.5);
  // faint, and fainter far away; a little brighter while the stage is cleared for sign-in
  vCol = mix(warmLagos(fract(aBg.w * 5.17)), vec3(0.969, 0.937, 0.886), 0.25); // the far grains, a touch hazier
  vAlpha = (0.22 + aBg.w * 0.3) * clamp(7.0 / d, 0.45, 1.0) * (1.0 + uScatter * 0.4) * smoothstep(1.2, 4.0, d);
}`;

const FRAG = /* glsl */ `#version 300 es
precision mediump float;
in float vAlpha;
in vec3 vCol;
out vec4 color;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  color = vec4(vCol, vAlpha * smoothstep(0.25, 0.1, r)); // Warm Lagos grains, soft edged
}`;

export const DustVortex = forwardRef<VortexHandle, { active?: boolean; style?: StyleProp<ViewStyle> }>(
  ({ active = true, style }, ref) => {
    const host = useRef<View>(null);
    const ctl = useRef<VortexHandle | null>(null);
    const activeRef = useRef(active);
    activeRef.current = active;

    useImperativeHandle(ref, () => ({
      burst: () => ctl.current?.burst(),
      setIntensity: (v: number) => ctl.current?.setIntensity(v),
      goTo: (i: number) => ctl.current?.goTo(i),
      scatter: (on: boolean) => ctl.current?.scatter?.(on),
    }), []);

    useEffect(() => {
      const el = host.current as unknown as HTMLElement | null;
      if (!el) return;
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      el.appendChild(cv);
      const gl = cv.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: false });
      if (!gl) { cv.remove(); return; }

      const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[dust]', gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      // every grain belongs to one of the shape's points, with its own fixed scatter around it
      const shapes = buildShapes();
      const base = new Uint32Array(COUNT), jitter = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT * 4);
      for (let i = 0; i < COUNT; i++) {
        base[i] = i % VN;
        // a gaussian-ish scatter: most grains close to the point, a few further out (the sand look)
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.13;
        jitter[i * 3] = g(); jitter[i * 3 + 1] = g(); jitter[i * 3 + 2] = g();
        const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1);
        seed[i * 4] = Math.sin(b) * Math.cos(a); seed[i * 4 + 1] = Math.sin(b) * Math.sin(a); seed[i * 4 + 2] = Math.cos(b);
        seed[i * 4 + 3] = Math.random();
      }
      const place = (shape: number, out: Float32Array) => {
        const pts = shapes[shape].pts;
        for (let i = 0; i < COUNT; i++) {
          const j = base[i] * 3;
          out[i * 3] = pts[j] + jitter[i * 3]; out[i * 3 + 1] = pts[j + 1] + jitter[i * 3 + 1]; out[i * 3 + 2] = pts[j + 2] + jitter[i * 3 + 2];
        }
        return out;
      };
      const from = place(0, new Float32Array(COUNT * 3));
      const to = place(0, new Float32Array(COUNT * 3));

      const buf = (name: string, data: Float32Array, size: number) => {
        const b = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        const loc = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return b;
      };
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const fromBuf = buf('aFrom', from, 3);
      const toBuf = buf('aTo', to, 3);
      buf('aSeed', seed, 4);
      const U = (n: string) => gl.getUniformLocation(prog, n);
      const u = { flow: U('uFlow'), time: U('uTime'), yaw: U('uYaw'), pitch: U('uPitch'), scale: U('uScale'), px: U('uPx'), intensity: U('uIntensity'), aspect: U('uAspect'), scatter: U('uScatter') };
      // the background grains: their own small program and buffer
      const bgProg = gl.createProgram()!;
      gl.attachShader(bgProg, shader(gl.VERTEX_SHADER, BG_VERT));
      gl.attachShader(bgProg, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(bgProg);
      const bgData = new Float32Array(BG_COUNT * 4);
      for (let i = 0; i < BG_COUNT; i++) {
        bgData[i * 4] = (Math.random() - 0.5) * 12;      // wide
        bgData[i * 4 + 1] = (Math.random() - 0.5) * 8;   // tall
        bgData[i * 4 + 2] = -1 - Math.random() * 9;      // behind the shape, into the distance
        bgData[i * 4 + 3] = Math.random();
      }
      const bgVao = gl.createVertexArray();
      gl.bindVertexArray(bgVao);
      const bgBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
      gl.bufferData(gl.ARRAY_BUFFER, bgData, gl.STATIC_DRAW);
      const bgLoc = gl.getAttribLocation(bgProg, 'aBg');
      gl.enableVertexAttribArray(bgLoc);
      gl.vertexAttribPointer(bgLoc, 4, gl.FLOAT, false, 0, 0);
      const B = (n: string) => gl.getUniformLocation(bgProg, n);
      const bu = { time: B('uTime'), yaw: B('uYaw'), scale: B('uScale'), px: B('uPx'), aspect: B('uAspect'), scatter: B('uScatter') };
      gl.bindVertexArray(vao);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // the shape schedule, as before: hold, change to another, hold...
      let idx = 0, flowStart = -1e9, nextAt = performance.now() + HOLD_MS, burstAt = -1e9;
      let intensity = 0, intensityTarget = 0;
      let scatter = 0, scatterTarget = 0;
      const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
      // where every grain is right now (without the mid-flight current), so a change can start
      // from wherever the last one had got to
      const settle = (now: number) => {
        const f = Math.min(1, (now - flowStart) / FLOW_MS);
        if (f >= 1) { from.set(to); return; }
        for (let i = 0; i < COUNT; i++) {
          const wave = Math.min(1, Math.max(0, (from[i * 3 + 1] + 1.2) / 2.4)) * 0.45 + seed[i * 4 + 3] * 0.2;
          const t = ease(Math.min(1, Math.max(0, (f - wave) / 0.35)));
          for (let c = 0; c < 3; c++) from[i * 3 + c] += (to[i * 3 + c] - from[i * 3 + c]) * t;
        }
      };
      const jump = (next: number) => {
        const now = performance.now();
        settle(now);
        idx = next;
        place(idx, to);
        gl.bindBuffer(gl.ARRAY_BUFFER, fromBuf); gl.bufferData(gl.ARRAY_BUFFER, from, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, toBuf); gl.bufferData(gl.ARRAY_BUFFER, to, gl.DYNAMIC_DRAW);
        flowStart = now;
        nextAt = now + FLOW_MS + HOLD_MS;
      };
      const pick = () => { let n; do { n = Math.floor(Math.random() * shapes.length); } while (n === idx && shapes.length > 1); return n; };
      ctl.current = {
        burst: () => { burstAt = performance.now(); jump(pick()); },
        setIntensity: (v) => { intensityTarget = v; },
        scatter: (on) => { scatterTarget = on ? 1 : 0; },
        goTo: (i) => { if (i !== idx) jump(i); },
      };

      const resize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
        return dpr;
      };

      let raf = 0;
      const t0 = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!activeRef.current || document.visibilityState === 'hidden') return;
        if (now >= nextAt) jump(pick());
        const dpr = resize();
        intensity += (intensityTarget - intensity) * 0.06;
        const bt = (now - burstAt) / BURST_MS;
        const pulse = bt >= 0 && bt < 1 ? Math.sin(bt * Math.PI) * 0.12 : 0;
        gl.clearColor(0.969, 0.937, 0.886, 1); // warm cream
        gl.clear(gl.COLOR_BUFFER_BIT);
        const time = (now - t0) / 1000, yaw = (now - t0) * (0.00026 + intensity * 0.0006);
        const fit = 1.6 * Math.min(cv.width, cv.height) / cv.height;
        // the far dust first, then the shape over it
        gl.useProgram(bgProg);
        gl.bindVertexArray(bgVao);
        gl.uniform1f(bu.time, time);
        gl.uniform1f(bu.yaw, yaw);
        gl.uniform1f(bu.scale, fit);
        gl.uniform1f(bu.px, 1.1 * dpr);
        gl.uniform1f(bu.aspect, cv.width / cv.height);
        gl.uniform1f(bu.scatter, scatter);
        gl.drawArrays(gl.POINTS, 0, BG_COUNT);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform1f(u.flow, Math.min(1, (now - flowStart) / FLOW_MS));
        gl.uniform1f(u.time, time);
        gl.uniform1f(u.yaw, yaw);
        gl.uniform1f(u.pitch, Math.sin((now - t0) * 0.00015) * 0.15);
        // the old vortex's framing: 0.8 of the shorter side, in clip space
        gl.uniform1f(u.scale, 1.6 * (1 + pulse) * Math.min(cv.width, cv.height) / cv.height);
        gl.uniform1f(u.px, 1.1 * dpr);
        gl.uniform1f(u.intensity, intensity);
        // out quickly, back more gently, never a jump
        scatter += (scatterTarget - scatter) * (scatterTarget > scatter ? 0.045 : 0.03);
        gl.uniform1f(u.scatter, scatter);
        gl.uniform1f(u.aspect, cv.width / cv.height);
        gl.drawArrays(gl.POINTS, 0, COUNT);
      };
      raf = requestAnimationFrame(frame);

      return () => {
        cancelAnimationFrame(raf);
        ctl.current = null;
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        cv.remove();
      };
    }, []);

    return <View ref={host} style={[{ flex: 1, backgroundColor: '#F7EFE2', overflow: 'hidden' }, style]} />;
  },
);
