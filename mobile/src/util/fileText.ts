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

const MAX_BYTES = 25 * 1024 * 1024; // a big PDF; the text sent is capped below
const MAX_CHARS = 1_000_000; // ~170,000 words -- fits the server's request limit in any script
const MAX_PDF_PAGES = 600;

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
    input.accept = ACCEPT;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    // a cancelled picker fires no change event; the window regains focus instead
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) resolve(null); }, 800), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

// pdf.js is loaded only when someone attaches a PDF, from our own server (mobile/public/pdfjs),
// through a native import() the bundler leaves alone.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, no-new-func
const nativeImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>;

async function pdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await nativeImport('/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
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
export async function extractText(file: File): Promise<ExtractedFile> {
  const kind = kindOf(file.name);
  if (!kind) throw new Error('That kind of file isn’t supported yet. Try a PDF, Word (.docx), text, CSV, JSON, web page or code file.');
  if (file.size > MAX_BYTES) throw new Error('That file is over 25 MB. Try a smaller one, or just the part you need.');
  let text: string;
  let pages: number | undefined;
  if (kind === 'pdf') ({ text, pages } = await pdfText(file));
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
