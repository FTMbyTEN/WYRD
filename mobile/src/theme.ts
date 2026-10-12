// Design tokens: Warm Lagos (the Figma redesign, "WYRD — Warm Lagos Redesign"): cream and sand
// grounds like a Lagos afternoon, Adire indigo, terracotta, ochre and palm green -- and its night:
// the same colours after dark, warm browns instead of cream, the accents brightened to read on them.
// Token names are kept from the green era so call sites didn't change: `green*` are the ink
// levels (deep brown-black to muted), `mint*` are headline text, `black` is the card colour (it
// was the inverse colour) and the text on solid ink fills, and `signal` is the one accent: terracotta.
import { Appearance, Platform } from 'react-native';
import { markArrival, startArrival, timelapseTheme } from './util/themeTransition';

const light = {
  bg: '#F7EFE2', // cream
  panelBg: '#FFFAF2', // card
  green: '#2A1F17', // ink: active state, accents, borders on focus
  greenDim: '#7A6656', // muted ink: secondary text, inactive icons, idle borders
  greenBorder: '#D9C7AC', // card borders, dividers
  greenBorderDim: '#EADBC4', // subtler dividers, disabled text
  mint: '#2A1F17', // headline/value text
  mintBright: '#3A2D22', // dreams, user-chat text
  glow: 'rgba(0,0,0,0)',
  danger: '#B83A26',
  ink: '#24316B', // COP's own voice: Adire indigo
  black: '#FFFAF2', // cards, and text on solid ink fills
  // the one accent: terracotta marks what is live or yours -- your messages, the active tab, WYRD
  // thinking, focus, progress, links
  signal: '#C4572E',
  signalSoft: 'rgba(196,87,46,0.10)',
  onSignal: '#FFFAF2',
  // the rest of the Warm Lagos palette, for screens that use more colour
  indigo: '#24316B',
  ochre: '#E2A32B',
  palm: '#2F6B4C',
  sand: '#EEDFC8',
  cream: '#F7EFE2',
  card: '#FFFAF2',
  // code: one distinct colour per kind of token, so code reads at a glance
  codeKeyword: '#8E3DB8', // violet
  codeString: '#2E7D46', // green
  codeNumber: '#C2410C', // orange
  codeFn: '#1F5FBF', // blue
  codeType: '#0E7C86', // teal: Classes, Types
  codeTag: '#B3262F', // red: <html> tags
  codeAttr: '#A16207', // amber: attributes, properties
  codeComment: '#8A7868',
  codeBg: '#F2E8D8',
  // glass (pop-ups, side panels, the header) and what's behind it
  glassBg: 'rgba(255,250,242,0.58)',
  glassBgSolid: 'rgba(255,250,242,0.95)', // where there is no blur (native)
  glassBorder: 'rgba(255,255,255,0.72)',
  glassTile: 'rgba(255,255,255,0.5)',
  glassTileOn: 'rgba(255,255,255,0.8)',
  glassLine: 'rgba(42,31,23,0.12)',
  scrim: 'rgba(20,16,10,0.18)',
  barBg: 'rgba(247,239,226,0.82)', // the header and tab bar, over the page
  shadow: '#2A1F17',
};

export type Palette = { [K in keyof typeof light]: string };

const dark: Palette = {
  bg: '#14110E', // night: warm near-black
  panelBg: '#1D1915', // card
  green: '#F1E6D6', // ink becomes light
  greenDim: '#B09C88',
  greenBorder: '#3B322A',
  greenBorderDim: '#2A241F',
  mint: '#F4EADB',
  mintBright: '#E9DDCB',
  glow: 'rgba(0,0,0,0)',
  danger: '#EE6A4E',
  ink: '#9AA8F2', // Adire indigo, lit for the dark
  black: '#1D1915',
  signal: '#E5743F', // terracotta, brighter at night
  signalSoft: 'rgba(229,116,63,0.16)',
  onSignal: '#FFF6EA',
  indigo: '#9AA8F2',
  ochre: '#EDB54A',
  palm: '#58AE7E',
  sand: '#2A241F',
  cream: '#14110E',
  card: '#1D1915',
  codeKeyword: '#C792EA',
  codeString: '#A5D98B',
  codeNumber: '#F78C6C',
  codeFn: '#82AAFF',
  codeType: '#7FDBCA',
  codeTag: '#F07178',
  codeAttr: '#FFCB6B',
  codeComment: '#8C7A68',
  codeBg: '#221D18',
  glassBg: 'rgba(29,25,21,0.58)',
  glassBgSolid: 'rgba(29,25,21,0.96)',
  glassBorder: 'rgba(255,240,220,0.12)',
  glassTile: 'rgba(255,240,220,0.06)',
  glassTileOn: 'rgba(255,240,220,0.14)',
  glassLine: 'rgba(255,240,220,0.1)',
  scrim: 'rgba(0,0,0,0.42)',
  barBg: 'rgba(20,17,14,0.82)',
  shadow: '#000000',
};

/** Auto follows the device; Light and Dark are chosen in Settings and kept on this device. */
export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'wyrd.theme';

export function themeMode(): ThemeMode {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function deviceDark(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return Appearance.getColorScheme() === 'dark';
}

/** True when WYRD is dark right now. Fixed for the life of the page: every screen's styles are
 *  made once, from the palette chosen here, so a change of theme reloads (see setThemeMode). */
export const isDark = themeMode() === 'dark' || (themeMode() === 'auto' && deviceDark());

export const colors: Palette = isDark ? dark : light;

// just reloaded for a change of theme: stay covered in the new background until the app is drawn
if (Platform.OS === 'web') startArrival(colors.bg);

/** Switch theme: kept on this device, then a timelapse sky -- sunset into night, or sunrise into day --
 *  carries the page into the new colours (util/themeTransition). */
export function setThemeMode(mode: ThemeMode, origin?: { x: number; y: number }) {
  try {
    if (mode === 'auto') globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, mode);
  } catch { /* not kept: still switches for now */ }
  const next = mode === 'dark' || (mode === 'auto' && deviceDark());
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (next === isDark) return; // already this colour
  // a day sped up over the page: sunset into night (or sunrise into day), then the page reloads in
  // the new colours and fades in out of the sky's last colour (AppRoot calls revealArrival)
  void origin;
  timelapseTheme(light.bg, dark.bg, next, () => { markArrival(); location.reload(); });
}

// Web: on Auto, follow the device when it changes (a phone switching to dark at sunset)
if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia && themeMode() === 'auto') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    if (themeMode() === 'auto' && e.matches !== isDark) setThemeMode('auto');
  });
}

export const fonts = {
  // the original terminal type, kept with the Warm Lagos colours
  display: 'VT323_400Regular', // big terminal readouts (VT323)
  displayBold: 'VT323_400Regular',
  displayItalic: 'VT323_400Regular',
  mono: 'ShareTechMono_400Regular', // body and labels (Share Tech Mono)
  bodyMedium: 'ShareTechMono_400Regular',
  bodyBold: 'ShareTechMono_400Regular',
  code: 'ShareTechMono_400Regular',
} as const;

export const layout = {
  phoneWidth: 390,
  phoneHeight: 844,
} as const;

export const morph = {
  MORPH_MS: 1500,
  HOLD_MS: 4200,
  BURST_MS: 900,
} as const;
