import React from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';

/**
 * NAIJA 2099's street-tech look for the HUD: acid yellow, ice cyan and alarm red on near-black glass,
 * angled corners, thin rules and scanlines. (Inspired by the cyberpunk genre; no one game's marks.)
 */
export const CY = {
  yellow: '#FCEE0A', cyan: '#00F0FF', red: '#FF003C', magenta: '#FF2BD6', green: '#3DFF9A',
  ink: '#05070B', glass: 'rgba(6,9,14,0.86)', glass2: 'rgba(10,16,24,0.92)', line: 'rgba(0,240,255,0.35)', lineY: 'rgba(252,238,10,0.55)',
  text: '#E8F7FF', muted: '#7E95A6', dim: '#4A5B68',
};
export const HEAD = 'Rajdhani, "Segoe UI", system-ui, sans-serif'; // condensed, technical
export const MONO = '"Share Tech Mono", ui-monospace, Consolas, monospace';

/** loads the two web fonts once (Google Fonts), for the browser build */
export function loadCyberFonts() {
  if (typeof document === 'undefined' || document.getElementById('cy-fonts')) return;
  const l = document.createElement('link');
  l.id = 'cy-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap';
  document.head.appendChild(l);
}

/** corners cut at 45 degrees: [cut] px off the top-left and bottom-right */
export const clip = (cut = 12) => ({ clipPath: `polygon(${cut}px 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%, 0 ${cut}px)` }) as object;
/** faint horizontal scanlines over a panel */
export const scan = { backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)' } as object;

/**
 * A HUD panel: angled corners, a hairline edge in [edge], a short accent bar along the top,
 * and scanlines. The edge is drawn by a slightly larger clipped shape behind the panel.
 */
export function Panel({ children, style, edge = CY.line, accent = CY.yellow, cut = 12, pad = 12, fill = CY.glass, grow = false }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; edge?: string; accent?: string | null; cut?: number; pad?: number; fill?: string;
  /** fill the panel's height (when the panel itself is sized) */ grow?: boolean;
}) {
  return (
    <View style={[{ position: 'relative' }, style]}>
      <View style={[{ position: 'absolute', inset: 0, backgroundColor: edge }, clip(cut)] as never} />
      <View style={[{ position: 'absolute', inset: 1, backgroundColor: fill }, clip(cut - 0.5), scan] as never} />
      {accent ? <View style={{ position: 'absolute', top: 0, left: cut + 6, width: 34, height: 2, backgroundColor: accent }} /> : null}
      <View style={grow ? { flex: 1, padding: pad } : { padding: pad }}>{children}</View>
    </View>
  );
}
