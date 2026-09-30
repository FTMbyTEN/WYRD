import React from 'react';
import { Platform } from 'react-native';
import { Canvas, Picture } from '@shopify/react-native-skia';
import type { SkiaLoop } from './skiaLoop';

/**
 * Shows a useSkiaLoop animation. On web it's a plain <canvas> the loop draws on directly with the
 * browser's 2D canvas (see canvas2d.ts) -- no React render per frame, and a fraction of Skia's
 * per-frame cost there; on native it renders the loop's picture with Skia.
 */
export function SkiaLoopView({ loop, width, height }: { loop: SkiaLoop; width: number; height: number }) {
  if (Platform.OS === 'web') {
    return React.createElement('canvas', {
      ref: loop.canvasRef,
      style: { width, height, display: 'block' },
    });
  }
  return (
    <Canvas style={{ width, height }}>
      {loop.picture && <Picture picture={loop.picture} />}
    </Canvas>
  );
}
