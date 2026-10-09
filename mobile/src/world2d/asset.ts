/**
 * The game's data and pictures (map tiles, water, sprites, people and vehicle sheets) are asked for with the build's
 * version on the address, so the server can let browsers keep them for weeks (a returning player loads the map from
 * their own disk instead of waiting on a round trip per file) while a new deploy -- a new version, new addresses --
 * still shows at once. EXPO_PUBLIC_BUILD is set when the web app is exported; without it (development) addresses are
 * left as they are.
 */
const V = process.env.EXPO_PUBLIC_BUILD ?? '';

export const asset = (path: string) => (V ? `${path}${path.includes('?') ? '&' : '?'}v=${V}` : path);
