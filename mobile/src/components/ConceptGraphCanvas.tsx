import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { useSkiaLoop } from '../vortex/skiaLoop';
import type { ConceptsGraph } from '../api/types';

/** Port of `initGraph()` — CONCEPT_MAP overlay. The design used a fixed demo label set laid out
 *  on a ring; here nodes/edges come straight from GET /api/concepts (topic co-occurrence), laid
 *  out on the same ring-with-drift so the look matches even though the topic count varies. */
export function ConceptGraphCanvas({ graph }: { graph: ConceptsGraph | null }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const font = useMemo(() => Skia.Font(undefined, 9), []);

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const index = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);

  const layout = useMemo(
    () =>
      nodes.map((n, i) => {
        const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - 1.2;
        const r = 0.5 + ((i * 7) % 5) * 0.08;
        return { ...n, a, r, w: 2 + Math.min(6, Math.round(n.count)) };
      }),
    [nodes],
  );

  const picture = useSkiaLoop(
    (canvas, W, H, now) => {
      const R = Math.min(W, H) * 0.4, cx = W / 2, cy = H / 2;
      const drift = Math.sin(now * 0.0004) * 0.05;
      canvas.clear(Skia.Color('rgba(0,0,0,0)'));
      if (!layout.length) return;

      const P = layout.map((n) => ({
        ...n,
        x: cx + Math.cos(n.a + drift) * R * n.r,
        y: cy + Math.sin(n.a + drift) * R * n.r,
      }));

      const edgePaint = Skia.Paint();
      edgePaint.setStyle(1);
      edgePaint.setStrokeWidth(0.7);
      edgePaint.setColor(Skia.Color('rgba(10,156,47,0.55)'));
      edges.forEach((e) => {
        const ai = index.get(e.a), bi = index.get(e.b);
        if (ai === undefined || bi === undefined || !P[ai] || !P[bi]) return;
        canvas.drawLine(P[ai].x, P[ai].y, P[bi].x, P[bi].y, edgePaint);
      });

      const nodePaint = Skia.Paint();
      nodePaint.setColor(Skia.Color('#00ff41'));
      const labelPaint = Skia.Paint();
      labelPaint.setColor(Skia.Color('#7fffb0'));
      P.forEach((n) => {
        canvas.drawCircle(n.x, n.y, n.w * 0.9, nodePaint);
        canvas.drawText(n.id, n.x - font.getTextWidth(n.id) / 2, n.y - (n.w + 6), labelPaint, font);
      });
    },
    size.width,
    size.height,
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={{ width: '100%', height: '100%' }} onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      )}
    </View>
  );
}
