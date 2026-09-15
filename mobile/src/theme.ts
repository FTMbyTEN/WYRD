// Design tokens lifted directly from `WYRD Mobile.dc.html` (screen 4a) — the terminal-green
// "restricted node" aesthetic shared with public/style.css in the consciousness-bot backend.

export const colors = {
  bg: '#07090a',
  panelBg: '#000000',
  green: '#00ff41', // primary — active state, accents, borders on focus
  greenDim: '#0a9c2f', // secondary text, inactive icons, idle borders
  greenBorder: '#0e5c22', // panel borders, dividers
  greenBorderDim: '#063d13', // subtler dividers, disabled text
  mint: '#baffc9', // headline/value text
  mintBright: '#6fffb0', // dreams, user-chat text
  danger: '#ff3b3b', // logout, flagged verdicts
  ink: '#baffc9', // COP's own voice — deliberately not green
  black: '#000000',
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
