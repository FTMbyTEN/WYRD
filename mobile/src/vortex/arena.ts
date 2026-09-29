import { Skia } from '@shopify/react-native-skia';

/**
 * Skia on the web (CanvasKit) keeps every Paint, Path, Picture and Image in WebAssembly memory
 * until `.dispose()` is called -- the garbage collector never frees them. Animations that make
 * fresh paints and paths every frame therefore leak a little per frame, forever (Chrome grew past
 * 2 GB). `withArena` runs one frame's drawing and frees every Paint and Path it made afterwards,
 * without each drawing function having to remember to.
 */
type Disposable = { dispose?: () => void };

const skia = Skia as unknown as {
  Paint: () => Disposable;
  Path: { Make: () => Disposable };
};

let arena: Disposable[] | null = null;
let patched = false;

function patch() {
  if (patched) return;
  patched = true;
  const makePaint = skia.Paint.bind(Skia);
  skia.Paint = () => {
    const p = makePaint();
    arena?.push(p);
    return p;
  };
  const makePath = skia.Path.Make.bind(skia.Path);
  skia.Path.Make = () => {
    const p = makePath();
    arena?.push(p);
    return p;
  };
}

export function withArena<T>(draw: () => T): T {
  patch();
  const outer = arena;
  const mine: Disposable[] = [];
  arena = mine;
  try {
    return draw();
  } finally {
    arena = outer;
    for (const o of mine) {
      try { o.dispose?.(); } catch { /* already freed */ }
    }
  }
}

/** Frees [o] a moment later -- after React has swapped the new frame in -- so a frame is never
 *  freed while it is still on screen. */
export function disposeSoon(o: Disposable | null | undefined) {
  if (!o) return;
  setTimeout(() => { try { o.dispose?.(); } catch { /* already freed */ } }, 100);
}

/** True while the page is hidden (another tab, minimised): animations should rest. */
export function pageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
