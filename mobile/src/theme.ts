// Design tokens: Warm Lagos (the Figma redesign, "WYRD — Warm Lagos Redesign"): cream and sand
// grounds like a Lagos afternoon, Adire indigo, terracotta, ochre and palm green; Fraunces (a warm
// serif) for display, DM Sans for everything else.
// Token names are kept from the green era so call sites didn't change: `green*` are the ink
// levels (deep brown-black to muted), `mint*` are headline text, `black` is the card colour (it
// was the inverse colour), and `signal` is the one accent: terracotta.

export const colors = {
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
  black: '#FFFAF2', // cards and text on solid ink fills
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
  // code
  codeString: '#2F6B4C',
  codeNumber: '#B4471C',
  codeFn: '#2A1F17',
  codeComment: '#8A7868',
  codeBg: '#F2E8D8',
} as const;

export const fonts = {
  display: 'Fraunces_400Regular', // warm serif for display
  displayBold: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_400Regular_Italic',
  mono: 'DMSans_400Regular', // body and labels (the name stays: call sites use it)
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_600SemiBold',
  code: 'ShareTechMono_400Regular', // code blocks keep a monospace
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
