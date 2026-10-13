import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Mono } from './ui';
import { CodeText } from './CodeText';
import { colors, fonts } from '../theme';

/** What WYRD drew (show_visual) or the Python it ran for them (run_python), inside its reply.
 *  Both arrive as one kept string, marked by kind (see the server's visual_tools.dart). They run
 *  in a sealed frame: scripts only -- no way into this app, its storage, its sign-in or the server. */
export const VISUAL_MARK = '<!--wyrd:visual-->';
export const PYTHON_MARK = '<!--wyrd:python-->';
/** A picture WYRD drew itself (draw_picture): one SVG, already cleaned on the server. */
export const PICTURE_MARK = '<!--wyrd:picture-->';

export const isInline = (s: string | null | undefined): s is string =>
  !!s && (s.startsWith(VISUAL_MARK) || s.startsWith(PYTHON_MARK) || s.startsWith(PICTURE_MARK));

/** Programs that arrived in this session run straight away; older ones wait for a tap (loading
 *  Python costs a few MB the first time). */
export const freshRuns = new Set<string>();

function parse(kept: string) {
  const python = kept.startsWith(PYTHON_MARK);
  const picture = kept.startsWith(PICTURE_MARK);
  const rest = kept.slice((python ? PYTHON_MARK : picture ? PICTURE_MARK : VISUAL_MARK).length);
  const m = /^<!--([\s\S]*?)-->\n?/.exec(rest);
  return {
    python,
    picture,
    title: m?.[1]?.trim() || (python ? 'Python' : picture ? 'Picture' : 'Visual'),
    body: m ? rest.slice(m[0].length) : rest,
  };
}

/** A picture's page: the SVG filling the frame, centred, at its own proportions. */
function picturePage(svg: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent}
body{display:flex;align-items:center;justify-content:center}svg{width:100%;height:100%;display:block}</style></head><body>${svg}</body></html>`;
}

/** The picture as a PNG, twice the size of its viewBox, drawn in the browser. */
function downloadPng(name: string, svg: string) {
  if (Platform.OS !== 'web') return;
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  const w = vb ? Number(vb[1]) : 800, h = vb ? Number(vb[2]) : 600;
  const withSize = svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/g, '').replace('<svg', `<svg width="${w * 2}" height="${h * 2}"`),
  );
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withSize);
}

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

/** A page that loads Python (Pyodide) and runs the code, showing what it prints and any
 *  matplotlib figures, and tells the frame's owner how tall it is. */
function pythonPage(code: string) {
  const src = JSON.stringify(code).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:12px;font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#FFFAF2;color:#1c1b19}
pre{margin:0;white-space:pre-wrap;word-break:break-word}.err{color:#b3261e}.st{color:#7a756c}img{max-width:100%;display:block;margin:8px 0}</style></head>
<body><div class="st" id="st">Starting Python…</div><pre id="out"></pre><div id="figs"></div>
<script>
const out=document.getElementById('out'),st=document.getElementById('st'),figs=document.getElementById('figs');
function tell(){const h=document.body.scrollHeight+2;try{parent.postMessage({wyrdRunH:h},'*')}catch(e){}try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(String(h))}catch(e){}}
function write(t,cls){const s=document.createElement('span');if(cls)s.className=cls;s.textContent=t+'\\n';out.appendChild(s);tell()}
window.wyrdImg=function(b64){const i=new Image();i.onload=tell;i.src='data:image/png;base64,'+b64;figs.appendChild(i)};
const code=${src};
const s=document.createElement('script');s.src='${PYODIDE}pyodide.js';
s.onerror=()=>{st.textContent='Could not load Python (no connection?).';st.className='err';tell()};
s.onload=async()=>{try{
 const py=await loadPyodide({indexURL:'${PYODIDE}'});
 py.setStdout({batched:t=>write(t)});py.setStderr({batched:t=>write(t,'err')});
 st.textContent='Loading packages…';tell();
 await py.loadPackagesFromImports(code,{messageCallback:m=>{if(/^Loading /.test(m)){st.textContent=m.slice(0,90)+(/matplotlib/.test(m)?' (about 20 MB the first time, kept after)':'')+'…';tell()}}});
 if(/matplotlib/.test(code)){await py.runPythonAsync(\`
import io, base64, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from js import wyrdImg
def _wyrd_show(*a, **k):
    for n in plt.get_fignums():
        b = io.BytesIO(); plt.figure(n).savefig(b, format='png', dpi=110, bbox_inches='tight')
        wyrdImg(base64.b64encode(b.getvalue()).decode())
    plt.close('all')
plt.show = _wyrd_show
\`)}
 st.textContent='Running…';tell();
 await py.runPythonAsync(code);
 if(/matplotlib/.test(code))await py.runPythonAsync('_wyrd_show()');
 st.textContent=out.childNodes.length||figs.childNodes.length?'Finished.':'Finished (it printed nothing).';
}catch(e){write(String(e&&e.message||e),'err');st.textContent='It stopped with an error.';st.className='err'}tell()};
document.head.appendChild(s);tell();
</script></body></html>`;
}

function Frame({ html, height, onHeight, label }: { html: string; height: number; onHeight?: (h: number) => void; label: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !onHeight) return;
    const on = (e: MessageEvent) => {
      if (e.source && e.source === ref.current?.contentWindow && typeof e.data?.wyrdRunH === 'number') onHeight(e.data.wyrdRunH);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [onHeight]);
  if (Platform.OS === 'web') {
    return React.createElement('iframe', {
      ref,
      srcDoc: html,
      sandbox: 'allow-scripts',
      referrerPolicy: 'no-referrer',
      title: label,
      style: { border: 0, width: '100%', height, display: 'block', background: '#FFFAF2' },
    });
  }
  return (
    <View style={{ height }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        onMessage={(e) => { const h = Number(e.nativeEvent.data); if (onHeight && h > 0) onHeight(h); }}
        style={{ backgroundColor: '#FFFAF2' }}
      />
    </View>
  );
}

function download(name: string, text: string, type: string) {
  if (Platform.OS !== 'web') return;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function InlineRun({ kept, onOpen }: { kept: string; onOpen?: (html: string) => void }) {
  const { python, picture, title, body } = parse(kept);
  const [run, setRun] = useState(() => (python ? freshRuns.has(kept) : true));
  const [runs, setRuns] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [h, setH] = useState(python ? 120 : 380);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || (python ? 'program' : picture ? 'picture' : 'visual');

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Mono style={styles.tag}>{python ? 'PYTHON · RUNS IN YOUR BROWSER' : picture ? 'A PICTURE · DRAWN BY WYRD' : 'VISUAL'}</Mono>
          <Mono style={styles.title} numberOfLines={1}>{title}</Mono>
        </View>
        {python ? (
          <>
            <Pressable onPress={() => setShowCode((s) => !s)} style={styles.btn} accessibilityLabel={showCode ? 'Hide the code' : 'Show the code'}>
              <Mono style={styles.btnText}>{showCode ? 'HIDE CODE' : 'CODE'}</Mono>
            </Pressable>
            <Pressable onPress={() => { setRun(true); setRuns((n) => n + 1); }} style={[styles.btn, styles.btnMain]} accessibilityLabel={run ? `Run ${title} again` : `Run ${title}`}>
              <Mono style={[styles.btnText, { color: colors.onSignal }]}>{run ? 'RUN AGAIN' : 'RUN ▸'}</Mono>
            </Pressable>
          </>
        ) : onOpen ? (
          <Pressable onPress={() => onOpen(picture ? picturePage(body) : body)} style={styles.btn} accessibilityLabel={`Open ${title} full screen`}>
            <Mono style={styles.btnText}>OPEN</Mono>
          </Pressable>
        ) : null}
        {Platform.OS === 'web' && picture ? (
          <>
            <Pressable onPress={() => download(`${slug}.svg`, body, 'image/svg+xml')} style={styles.btn} accessibilityLabel={`Download ${title} as SVG`}>
              <Mono style={styles.btnText}>.SVG ↓</Mono>
            </Pressable>
            <Pressable onPress={() => downloadPng(`${slug}.png`, body)} style={[styles.btn, styles.btnMain]} accessibilityLabel={`Download ${title} as PNG`}>
              <Mono style={[styles.btnText, { color: colors.onSignal }]}>.PNG ↓</Mono>
            </Pressable>
          </>
        ) : Platform.OS === 'web' ? (
          <Pressable
            onPress={() => (python ? download(`${slug}.py`, body + '\n', 'text/x-python') : download(`${slug}.html`, body, 'text/html'))}
            style={styles.btn}
            accessibilityLabel={`Download ${title}`}
          >
            <Mono style={styles.btnText}>{python ? '.PY ↓' : '.HTML ↓'}</Mono>
          </Pressable>
        ) : null}
      </View>
      {python && showCode ? (
        <ScrollView style={styles.code} nestedScrollEnabled><CodeText code={body} lang="python" style={styles.codeText} /></ScrollView>
      ) : null}
      {run ? (
        <View style={styles.frame}>
          <Frame
            key={runs}
            html={python ? pythonPage(body) : picture ? picturePage(body) : body}
            height={python ? Math.min(Math.max(h, 80), 900) : picture ? 420 : 380}
            onHeight={python ? (n) => setH(n + 4) : undefined}
            label={title}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8, borderWidth: 1, borderColor: colors.signal, borderRadius: 12, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, flexWrap: 'wrap' },
  tag: { fontSize: 8.5, letterSpacing: 1.6, color: colors.signal },
  title: { fontSize: 14, color: colors.mint, marginTop: 2 },
  btn: { borderWidth: 1, borderColor: colors.signal, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  btnMain: { backgroundColor: colors.signal },
  btnText: { fontSize: 10.5, letterSpacing: 1, color: colors.signal },
  code: { maxHeight: 260, paddingHorizontal: 12, paddingBottom: 10 },
  codeText: { fontSize: 11.5, lineHeight: 17, color: colors.mint, fontFamily: fonts.code },
  frame: { backgroundColor: '#FFFAF2' },
});
