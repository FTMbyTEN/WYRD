import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

/** One way things arrive, everywhere: a short fade with a slight rise and settle (panels, pop-ups,
 *  tabs). Reduced motion: just the fade. */
const reduced = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useEnter(active: boolean, { rise = 10, scale = 0.985, ms = 240 } = {}) {
  const v = useRef(new Animated.Value(active ? 0 : 1)).current;
  useEffect(() => {
    if (!active) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [active, v, ms]);
  return {
    opacity: v,
    transform: reduced ? [] : [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) },
    ],
  };
}

/** A big glass pop-up's way in and out: it springs up from a little smaller and lower, overshoots a
 *  touch and settles (elastic); [leave] tucks it back -- a small lift, then down and away -- and
 *  calls [done] once it's gone, so the panel can close after its exit, not before. The scrim fades
 *  with it. Reduced motion: just the fades. */
export function useElastic(active: boolean) {
  const nd = Platform.OS !== 'web';
  const v = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);
  useEffect(() => {
    if (!active) return;
    leaving.current = false;
    v.setValue(0);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(v, { toValue: 1, friction: 6.5, tension: 68, useNativeDriver: nd }),
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: nd }),
    ]).start();
  }, [active, v, fade, nd]);
  const leave = (done: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.parallel([
      Animated.timing(v, { toValue: 0, duration: 230, easing: Easing.in(Easing.back(1.6)), useNativeDriver: nd }),
      Animated.timing(fade, { toValue: 0, duration: 230, easing: Easing.in(Easing.quad), useNativeDriver: nd }),
    ]).start(() => done());
  };
  return {
    scrim: { opacity: fade },
    pane: {
      opacity: fade,
      transform: reduced ? [] : [
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
      ],
    },
    leave,
  };
}

/** Its children arrive with useEnter each time [k] changes (a tab, a page). */
export function Enter({ k, style, children }: { k: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const a = useEnter(true, { rise: 6, scale: 1, ms: 200 });
  return <Animated.View key={k} style={[{ flex: 1 }, style, a]}>{children}</Animated.View>;
}
