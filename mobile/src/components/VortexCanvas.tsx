import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { makeVortexEngine } from '../vortex/engine';
import { useSkiaLoop } from '../vortex/skiaLoop';

export interface VortexHandle {
  burst: () => void;
  setIntensity: (v: number) => void;
}

interface Props {
  active?: boolean;
  onShapeChange?: (name: string) => void;
  style?: React.ComponentProps<typeof View>['style'];
}

export const VortexCanvas = forwardRef<VortexHandle, Props>(({ active = true, onShapeChange, style }, ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const engine = useMemo(() => makeVortexEngine(onShapeChange), []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    burst: () => engine.burst(),
    setIntensity: (v: number) => engine.setIntensity(v),
  }), [engine]);

  const picture = useSkiaLoop(
    (canvas, w, h, now) => engine.frame(canvas, w, h, now),
    size.width,
    size.height,
    active,
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={[{ flex: 1 }, style]} onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      )}
    </View>
  );
});
VortexCanvas.displayName = 'VortexCanvas';
