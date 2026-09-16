// The reasoning `.md` notes always lead with a metadata block (# heading, then `key: value`
// lines like `time:`/`topic:`/`supporting blocks:`) before the actual thought — a self-question
// note's real content is its `A:` line, an autonomous-reasoning note's is its closing prose
// paragraph. Joining every line indiscriminately (the original approach) surfaced the metadata
// verbatim as the displayed "last thought", e.g. "Self-questioning time: 2026-... topic: x
// supporting blocks: ... Q: ... A: ..." — readable to a developer, not to a user.
const METADATA_LINE = /^(?:#|time:|topic:|source blocks:|supporting blocks:|candidates compared:)/i;

/** Strips the light markdown + metadata preamble the reasoning `.md` notes use, down to the
 *  actual thought for compact display (WYRD tab's "LAST THOUGHT" strip). */
export function firstLineFromMarkdown(md: string, maxLen = 220): string {
  const lines = md
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !METADATA_LINE.test(l));

  const answerLine = lines.find((l) => /^A:\s*/i.test(l));
  const plain = (answerLine ? answerLine.replace(/^A:\s*/i, '') : lines.join(' ')).trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen).trim()}…` : plain;
}
