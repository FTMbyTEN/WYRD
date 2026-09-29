/**
 * A shared file, kept only in this browser: split into passages once, then for each message the
 * passages most relevant to it are picked here and sent along -- the file itself never leaves the
 * device whole and is never stored on the server.
 */
export interface DocIndex {
  name: string;
  passages: string[];
  terms: Set<string>[];
  df: Map<string, number>;
}

const PASSAGE = 1100; // characters per passage, split on paragraph and sentence boundaries
const STOP = new Set(('the and that this with from have what which when where there their about would could should into them they were been does mean explain file document tell please summarize summarise more some just like also your you are was for not but all can how why who its it\'s his her him she our out one any may very much such than then these those well only even most other over give show says said make made').split(' '));

function terms(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 5 && w.endsWith('s') ? w.slice(0, -1) : w)); // costs ~ cost
}

export function buildIndex(name: string, text: string): DocIndex {
  const passages: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (cur && cur.length + p.length > PASSAGE) { passages.push(cur); cur = ''; }
    if (p.length > PASSAGE * 1.6) {
      // a very long paragraph: cut at sentence ends
      for (const s of p.split(/(?<=[.!?])\s+/)) {
        if (cur && cur.length + s.length > PASSAGE) { passages.push(cur); cur = ''; }
        cur += (cur ? ' ' : '') + s;
      }
    } else {
      cur += (cur ? '\n\n' : '') + p;
    }
  }
  if (cur) passages.push(cur);
  const termSets = passages.map((p) => new Set(terms(p)));
  const df = new Map<string, number>();
  for (const set of termSets) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  return { name, passages, terms: termSets, df };
}

/**
 * The passages to send with [question] (at most [budget] characters, in the file's order): the
 * best matches by rare shared words, each with a little of what follows; for a vague question
 * ("tell me more", "explain this") the opening and passages spread through the whole file.
 */
export function passagesFor(ix: DocIndex, question: string, budget = 9000): string[] {
  const n = ix.passages.length;
  if (n === 0) return [];
  const q = [...new Set(terms(question))];
  const score = ix.terms.map((set) =>
    q.reduce((s, t) => (set.has(t) ? s + Math.log(1 + n / (ix.df.get(t) ?? 1)) : s), 0));
  const ranked = score.map((s, i) => [i, s] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const pick = new Set<number>();
  let used = 0;
  const add = (i: number) => {
    if (i < 0 || i >= n || pick.has(i) || used + ix.passages[i].length > budget) return false;
    pick.add(i);
    used += ix.passages[i].length;
    return true;
  };
  if (ranked.length > 0 && ranked[0][1] >= 1.5) {
    for (const [i] of ranked.slice(0, 6)) { add(i); add(i + 1); }
  } else {
    // vague: the beginning, then evenly through the file
    add(0);
    const steps = 7;
    for (let k = 1; k <= steps; k++) add(Math.floor(((k + 0.5) * n) / (steps + 1)));
  }
  return [...pick].sort((a, b) => a - b).map((i) => ix.passages[i]);
}

/** A sample of the whole file for WYRD's first read: the opening, then pieces from throughout. */
export function sampleOf(ix: DocIndex, budget = 150000): string {
  const n = ix.passages.length;
  const total = ix.passages.reduce((s, p) => s + p.length, 0);
  if (total <= budget) return ix.passages.join('\n\n');
  const out: number[] = [];
  let used = 0;
  // the opening third of the budget, then an even spread
  for (let i = 0; i < n && used < budget / 3; i++) { out.push(i); used += ix.passages[i].length; }
  const rest = Math.max(1, Math.floor((budget - used) / (total / n)));
  const start = out.length;
  for (let k = 0; k < rest; k++) {
    const i = start + Math.floor((k * (n - start)) / rest);
    if (!out.includes(i) && used + ix.passages[i].length <= budget) { out.push(i); used += ix.passages[i].length; }
  }
  return out.sort((a, b) => a - b).map((i) => ix.passages[i]).join('\n\n');
}

export function wordCount(text: string): number {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const space = c === 32 || c === 10 || c === 9 || c === 13;
    if (!space && !inWord) n++;
    inWord = !space;
  }
  return n;
}
