import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

// lighter frost than the pop-ups: what's behind (WYRD's brain) should still read clearly
const frost = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(8px) saturate(140%)', WebkitBackdropFilter: 'blur(8px) saturate(140%)' } as object)
  : {};

/**
 * A glass panel docked to one side of its parent, sliding in when [open] and out when not (it stays
 * mounted while it slides out). With [onResize], its inner edge is a handle: drag it to make the
 * panel wider or narrower, between [minWidth] and [maxWidth]; a double-click on it switches
 * between the narrowest and the widest.
 */
export function SidePanel({ open, side, width, onResize, minWidth = 340, maxWidth = 960, children, style }: {
  open: boolean;
  side: 'left' | 'right';
  width: number;
  onResize?: (w: number) => void;
  minWidth?: number;
  maxWidth?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) setShown(true);
    Animated.timing(v, {
      toValue: open ? 1 : 0,
      duration: open ? 340 : 240,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => { if (finished && !open) setShown(false); });
  }, [open, v]);

  // dragging the inner edge
  const start = useRef(width);
  const widthRef = useRef(width);
  widthRef.current = width;
  const [dragging, setDragging] = useState(false);
  // (the drag handler is made once: it reads the current limits through a ref)
  const limits = useRef({ minWidth, maxWidth });
  limits.current = { minWidth, maxWidth };
  const clamp = (w: number) => Math.round(Math.min(limits.current.maxWidth, Math.max(limits.current.minWidth, w)));
  const lastTap = useRef(0);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = widthRef.current; setDragging(true); },
    onPanResponderMove: (_e, g) => onResizeRef.current?.(clamp(start.current + (side === 'right' ? -g.dx : g.dx))),
    onPanResponderRelease: (_e, g) => {
      setDragging(false);
      // a double-click on the edge (no drag) switches between the narrowest and the widest
      if (Math.abs(g.dx) < 3) {
        const now = Date.now();
        if (now - lastTap.current < 350) {
          const { minWidth: lo, maxWidth: hi } = limits.current;
          onResizeRef.current?.(widthRef.current < (lo + hi) / 2 ? hi : lo);
        }
        lastTap.current = now;
      }
    },
    onPanResponderTerminate: () => setDragging(false),
  })).current;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  if (!shown) return null;
  const off = width + 32;
  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[
        styles.panel,
        frost,
        side === 'right' ? styles.right : styles.left,
        { width, opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [side === 'right' ? off : -off, 0] }) }] },
        style,
      ]}
    >
      {children}
      {onResize ? (
        <View
          {...pan.panHandlers}
          style={[styles.handle, side === 'right' ? { left: -6 } : { right: -6 }, Platform.OS === 'web' && ({ cursor: 'col-resize' } as object)]}
          accessibilityLabel="Drag to resize"
        >
          <View style={[styles.grip, dragging && styles.gripOn]} pointerEvents="none" />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', top: 10, bottom: 10, zIndex: 20,
    backgroundColor: Platform.OS === 'web' ? colors.glassBg : colors.glassBgSolid,
    borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 22,
    shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: 10 },
  },
  right: { right: 10 },
  left: { left: 10 },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 12, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  grip: { width: 4, height: 44, borderRadius: 2, backgroundColor: colors.glassLine },
  gripOn: { backgroundColor: colors.signal, height: 64 },
});
