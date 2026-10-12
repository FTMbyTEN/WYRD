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

/** Its children arrive with useEnter each time [k] changes (a tab, a page). */
export function Enter({ k, style, children }: { k: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const a = useEnter(true, { rise: 6, scale: 1, ms: 200 });
  return <Animated.View key={k} style={[{ flex: 1 }, style, a]}>{children}</Animated.View>;
}
