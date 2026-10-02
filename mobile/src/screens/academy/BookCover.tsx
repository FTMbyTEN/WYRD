import React, { useMemo } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';

/** Every book gets its own cover, drawn from its title: the same book always looks the same,
 *  no two look alike, and nothing has to be downloaded. Monochrome, like the rest of WYRD. */

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 120;
const H = 168;
const INK = '#111111';
const GREY = '#8a8a8a';

// One cover's pattern as plain shapes, so it can be drawn as SVG elements (native) or as a single
// SVG image (web, where a hundred live elements per cover made the Academy stall on opening).
type Shape =
  | { t: 'circle'; cx: number; cy: number; r: number; stroke?: string; sw?: number; fill: string }
  | { t: 'path'; d: string; stroke: string; sw: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  | { t: 'rect'; x: number; y: number; s: number; rot: number; stroke: string; sw: number; fill: string };

function shapes(seed: number): Shape[] {
  const r = rng(seed);
  const kind = (seed >>> 5) % 6;
  const out: Shape[] = [];
  if (kind === 0) {
    // ripples from a point
    const cx = 20 + r() * 80, cy = 30 + r() * 70;
    for (let i = 1; i < 14; i++) out.push({ t: 'circle', cx, cy, r: i * (6 + r() * 3), stroke: i % 3 === 0 ? INK : GREY, sw: i % 3 === 0 ? 1.4 : 0.7, fill: 'none' });
  } else if (kind === 1) {
    // horizon lines, like a landscape
    let y = 28;
    for (let i = 0; y < H - 40; i++) {
      const amp = 4 + r() * 10;
      out.push({ t: 'path', d: `M0 ${y} Q ${30 + r() * 20} ${y - amp} 60 ${y} T ${W} ${y}`, stroke: i % 2 ? GREY : INK, sw: i % 4 === 0 ? 1.6 : 0.8 });
      y += 5 + r() * 7;
    }
  } else if (kind === 2) {
    // a grid of dots of varying size
    for (let x = 12; x < W; x += 12) for (let y = 14; y < H - 44; y += 12) {
      const s = r();
      out.push({ t: 'circle', cx: x, cy: y, r: s * s * 4 + 0.6, fill: s > 0.8 ? INK : GREY });
    }
  } else if (kind === 3) {
    // rays from the top
    const ox = 20 + r() * 80;
    for (let i = 0; i < 26; i++) {
      const x = -20 + i * 7 + r() * 4;
      out.push({ t: 'line', x1: ox, y1: -4, x2: x, y2: H - 44, stroke: i % 5 === 0 ? INK : GREY, sw: i % 5 === 0 ? 1.3 : 0.6 });
    }
  } else if (kind === 4) {
    // stacked arches, like a doorway
    for (let i = 0; i < 9; i++) {
      const w = 96 - i * 10, x = (W - w) / 2, top = 20 + i * 9;
      out.push({ t: 'path', d: `M${x} ${H - 44} V ${top + w / 2} A ${w / 2} ${w / 2} 0 0 1 ${x + w} ${top + w / 2} V ${H - 44}`, stroke: i % 3 === 0 ? INK : GREY, sw: i % 3 === 0 ? 1.4 : 0.7 });
    }
  } else {
    // tilted squares, like tiles
    for (let i = 0; i < 18; i++) {
      const s = 10 + r() * 34, x = r() * (W - s), y = 8 + r() * (H - 60 - s);
      out.push({ t: 'rect', x, y, s, rot: Math.round(r() * 90), stroke: i % 4 === 0 ? INK : GREY, sw: i % 4 === 0 ? 1.3 : 0.7, fill: i % 7 === 0 ? INK : 'none' });
    }
  }
  return out;
}

function Pattern({ seed }: { seed: number }) {
  return (
    <G>
      {shapes(seed).map((s, i) =>
        s.t === 'circle' ? <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} stroke={s.stroke} strokeWidth={s.sw} fill={s.fill} />
          : s.t === 'path' ? <Path key={i} d={s.d} stroke={s.stroke} strokeWidth={s.sw} fill="none" />
            : s.t === 'line' ? <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.sw} />
              : <Rect key={i} x={s.x} y={s.y} width={s.s} height={s.s} transform={`rotate(${s.rot} ${s.x + s.s / 2} ${s.y + s.s / 2})`} stroke={s.stroke} strokeWidth={s.sw} fill={s.fill} fillOpacity={0.08} />,
      )}
    </G>
  );
}

// web: each book's whole cover art as one SVG image, made once and kept
const artCache = new Map<string, string>();
function coverArt(seed: number, progress?: number) {
  const key = `${seed}:${progress ? Math.round(progress * 60) : 0}`;
  const hit = artCache.get(key);
  if (hit) return hit;
  const f = (n: number) => Math.round(n * 100) / 100;
  const body = shapes(seed).map((s) =>
    s.t === 'circle' ? `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw}"` : ''}/>`
      : s.t === 'path' ? `<path d="${s.d}" stroke="${s.stroke}" stroke-width="${s.sw}" fill="none"/>`
        : s.t === 'line' ? `<line x1="${f(s.x1)}" y1="${s.y1}" x2="${f(s.x2)}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`
          : `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.s)}" height="${f(s.s)}" transform="rotate(${s.rot} ${f(s.x + s.s / 2)} ${f(s.y + s.s / 2)})" stroke="${s.stroke}" stroke-width="${s.sw}" fill="${s.fill}" fill-opacity="0.08"/>`,
  ).join('');
  const ribbon = progress != null && progress > 0 ? `<path d="M${W - 22} 0 h12 v${f(10 + progress * 60)} l-6 -6 l-6 6 z" fill="${INK}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect width="${W}" height="${H}" fill="#fff"/>${body}<rect width="5" height="${H}" fill="${INK}" opacity="0.85"/>${ribbon}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  artCache.set(key, uri);
  return uri;
}

/** Redrawn only when this book's own details change, not whenever the list around it does. */
export const BookCover = React.memo(BookCoverImpl);

function BookCoverImpl({ title, author, width = 120, progress, badge }: {
  title: string;
  author?: string;
  width?: number;
  progress?: number; // 0..1, drawn as a bookmark ribbon
  badge?: string;
}) {
  const seed = useMemo(() => hash(`${title}|${author ?? ''}`), [title, author]);
  // the pattern is the costly part (up to a hundred shapes): build it once per book
  const pattern = useMemo(() => (Platform.OS === 'web' ? null : <Pattern seed={seed} />), [seed]);
  const height = (width * H) / W;
  return (
    <View style={[styles.cover, { width, height }]}>
      {Platform.OS === 'web' ? (
        <Image source={{ uri: coverArt(seed, progress) }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
      ) : (
        <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={W} height={H} fill="#ffffff" />
          {pattern}
          {/* spine shadow */}
          <Rect x={0} y={0} width={5} height={H} fill={INK} opacity={0.85} />
          {progress != null && progress > 0 && (
            <Path d={`M${W - 22} 0 h12 v${10 + progress * 60} l-6 -6 l-6 6 z`} fill={INK} />
          )}
        </Svg>
      )}
      {width >= 80 && <View style={styles.plate}>
        <Mono numberOfLines={3} style={[styles.title, { fontSize: Math.max(9, width / 11) }]}>{title}</Mono>
        {author ? <Mono numberOfLines={1} style={[styles.author, { fontSize: Math.max(7.5, width / 16) }]}>{author}</Mono> : null}
      </View>}
      {badge ? <View style={styles.badge}><Mono style={styles.badgeText}>{badge}</Mono></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderWidth: 1, borderColor: colors.mint, backgroundColor: '#fff', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 3, height: 4 },
  },
  plate: {
    position: 'absolute', left: 10, right: 6, bottom: 6, backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.mint, paddingHorizontal: 6, paddingVertical: 5, gap: 2,
  },
  title: { color: colors.mint, letterSpacing: 0.4, lineHeight: undefined },
  author: { color: colors.greenDim, letterSpacing: 0.6 },
  badge: { position: 'absolute', top: 6, left: 10, backgroundColor: colors.mint, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 8, letterSpacing: 1.2 },
});
