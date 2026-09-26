import { useWindowDimensions } from 'react-native';

/** Desktop layout: a landscape screen at least this wide gets the sidebar + side-by-side views. */
export const DESKTOP_MIN_WIDTH = 1024;

/** True on wide landscape screens (desktop/laptop browsers, big tablets held sideways). */
export function useIsDesktop() {
  const { width, height } = useWindowDimensions();
  return width >= DESKTOP_MIN_WIDTH && width > height;
}
