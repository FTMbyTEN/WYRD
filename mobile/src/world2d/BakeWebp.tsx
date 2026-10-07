import React, { useEffect, useState } from 'react';

/** DEV ONLY (#bake-webp): re-encodes the generated PNG pictures as WebP (a fraction of the size) via the bake receiver. */
export function BakeWebp() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const names: string[] = await fetch('world2d/sprites.json').then((r) => r.json()).then((j) => Object.keys(j)).catch(() => []);
      const lm = ['central-mosque', 'tinubu-square', 'independence-house', 'necom-house', 'css-bookshop', 'union-bank', 'city-hall', 'idumota', 'obalende', 'falomo', 'link-bridge', 'bar-beach', 'federal-palace', 'muri-okunola', 'unilag-senate', 'unilag-gate', 'yaba-market', 'tejuosho', 'oshodi', 'computer-village', 'alausa', 'rail-terminal', 'shrine', 'nike-gallery'].map((n) => `lm-${n}`);
      for (const n of [...names, ...lm]) {
        const im = new Image(); im.src = `world2d/${n}.png`;
        await im.decode().catch(() => null);
        if (!im.naturalWidth) { setLog((l) => [...l, `${n}: missing`]); continue; }
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        c.getContext('2d')!.drawImage(im, 0, 0);
        const url = c.toDataURL('image/webp', 0.88);
        await fetch('http://localhost:8099/', { method: 'POST', body: JSON.stringify({ name: `pics/${n}.webp`, data: url.split(',')[1] }) });
        setLog((l) => [...l, `${n}: ${(url.length / 1366).toFixed(0)} KB`]);
      }
      setLog((l) => [...l, 'done']);
    })();
  }, []);
  return <pre style={{ padding: 20, fontSize: 13 }}>{log.join('\n')}</pre>;
}
