// Design tokens, originally the terminal-green look of `WYRD Mobile.dc.html` (screen 4a), now
// recolored to monochrome (white background, black foreground) to match public/style.css.
// Token names are kept from the green era so call sites didn't change: `green*` are black-to-grey
// ink levels, `mint*` are near-black text, and `black` is the inverse color (white) used for
// text on solid ink fills.

export const colors = {
  bg: '#ffffff',
  panelBg: '#ffffff',
  green: '#000000', // primary — active state, accents, borders on focus
  greenDim: '#555555', // secondary text, inactive icons, idle borders
  greenBorder: '#999999', // panel borders, dividers
  greenBorderDim: '#cccccc', // subtler dividers, disabled text
  mint: '#111111', // headline/value text
  mintBright: '#222222', // dreams, user-chat text
  glow: 'rgba(0,0,0,0)', // text-shadow halo: off -- crisp black type reads better on white than any bloom
  danger: '#ff3b3b', // logout, flagged verdicts
  ink: '#111111', // COP's own voice — deliberately not green
  black: '#ffffff',
} as const;

export const fonts = {
  display: 'VT323_400Regular', // big terminal readouts (VT323)
  mono: 'ShareTechMono_400Regular', // body/labels (Share Tech Mono)
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
