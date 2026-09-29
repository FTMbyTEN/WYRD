import { Platform } from 'react-native';

export type FileKind = 'pdf' | 'docx' | 'text' | 'html' | 'csv' | 'json' | 'code';

export interface ExtractedFile {
  name: string;
  kind: FileKind;
  text: string;
  pages?: number;
}

/** What can be attached, for the file picker. */
export const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.rtf,.log,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.swift,.kt,.dart,.sql,.yaml,.yml,.ini,.tex';

// The file stays in this browser (only a sample and, per question, the relevant passages are
// sent), so the limits are about what a browser can comfortably read, not what the server takes.
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_CHARS = 8_000_000; // ~1.3 million words
const MAX_PDF_PAGES = 3000;

/** Reading progress: [done] of [total] (pages for a PDF), for the loading bar. */
export type Progress = (done: number, total: number) => void;

// let the page breathe between chunks of work, so reading a big file never freezes it
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

const CODE = /\.(js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|rb|php|swift|kt|dart|sql|yaml|yml|ini|tex)$/i;

function kindOf(name: string): FileKind | null {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx')) return 'docx';
  if (/\.(html?|xml)$/.test(n)) return 'html';
  if (/\.(csv|tsv)$/.test(n)) return 'csv';
  if (n.endsWith('.json')) return 'json';
  if (CODE.test(n)) return 'code';
  if (/\.(txt|md|markdown|rtf|log)$/.test(n)) return 'text';
  return null;
}

/** Opens the system file picker (web) and resolves with the chosen file, or null if cancelled. */
export function pickFile(): Promise<File | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // phones: no type filter -- Android's picker greys out files whose type it can't map from an
    // extension (.md, code), and the kind is checked after picking anyway
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (!touch) input.accept = ACCEPT;
    // off-screen rather than display:none, which some iOS versions refuse to open a picker for
    Object.assign(input.style, { position: 'fixed', left: '-9999px', top: '0', opacity: '0', width: '1px', height: '1px' });
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    // a cancelled picker says so with 'cancel'. (Guessing from the window regaining focus used to
    // drop real picks whose change event came late -- a big file, or one still syncing from
    // OneDrive -- so nothing happened at all. A picker closed without either event just leaves
    // this promise waiting, which is harmless.)
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

// pdf.js is loaded only when someone attaches a PDF, from our own server (mobile/public/pdfjs),
// through a native import() the bundler leaves alone.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, no-new-func
const nativeImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>;

// pdf.js here is its legacy build, with fallbacks for what older and current browsers lack
// (Uint8Array.toHex, Promise.withResolvers, ...) built into both of its files; see
// scripts/copy-canvaskit.js.
// The pdf.js files are cached for a week by browsers and the CDN in front of the server, so their
// address carries this revision: change it whenever the files change (a pdf.js upgrade, or a
// change to scripts/copy-canvaskit.js), and everyone gets the new files at once.
const PDFJS_REV = '6.3.289-legacy.1';

async function pdfText(file: File, onProgress?: Progress): Promise<{ text: string; pages: number }> {
  const pdfjs = await nativeImport(`/pdfjs/pdf.min.mjs?v=${PDFJS_REV}`);
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.min.mjs?v=${PDFJS_REV}`;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  // a PDF that can't be opened says so, rather than leaving the card reading forever
  const doc = await Promise.race([
    task.promise,
    new Promise<never>((_, reject) => setTimeout(() => {
      task.destroy?.();
      reject(new Error('That PDF took too long to open. Try again, or a smaller file.'));
    }, 90000)),
  ]);
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const out: string[] = [];
  let total = 0;
  for (let i = 1; i <= pages && total < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== 'string') continue;
      line += item.str;
      if (item.hasEOL) { lines.push(line); line = ''; }
    }
    if (line) lines.push(line);
    // join wrapped lines into paragraphs; keep blank lines as paragraph breaks
    const text = lines.join('\n').replace(/([^\n.!?:])\n(?=[a-z(])/g, '$1 ').trim();
    out.push(text);
    total += text.length;
    page.cleanup?.();
    onProgress?.(i, pages);
    if (i % 4 === 0) await breathe();
  }
  await doc.destroy?.();
  return { text: out.join('\n\n'), pages: doc.numPages };
}

async function docxText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('That Word file has no readable text.');
  const text = xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decode(text);
}

function decode(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return (doc.body?.innerText || doc.documentElement.textContent || '').replace(/\n{3,}/g, '\n\n');
}

/** Reads the text out of [file] in the browser; only this text is sent to WYRD. */
export async function extractText(file: File, onProgress?: Progress): Promise<ExtractedFile> {
  const kind = kindOf(file.name);
  if (!kind) throw new Error('That kind of file isn’t supported yet. Try a PDF, Word (.docx), text, CSV, JSON, web page or code file.');
  if (file.size > MAX_BYTES) throw new Error('That file is over 150 MB. Try a smaller one, or just the part you need.');
  let text: string;
  let pages: number | undefined;
  if (kind === 'pdf') ({ text, pages } = await pdfText(file, onProgress));
  else if (kind === 'docx') text = await docxText(file);
  else if (kind === 'html') text = htmlText(await file.text());
  else text = await file.text();
  text = text.replace(/\u0000/g, '').trim();
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  if (text.length < 20) {
    throw new Error(kind === 'pdf'
      ? 'I couldn’t find text in that PDF — it may be a scanned image. Try a PDF with selectable text.'
      : 'That file looks empty.');
  }
  return { name: file.name, kind, text, pages };
}
