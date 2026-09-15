/** Strips the light markdown the reasoning `.md` notes use (headers, bold, bullets) down to a
 *  plain first line/sentence for compact display (WYRD tab's "LAST THOUGHT" strip). */
export function firstLineFromMarkdown(md: string, maxLen = 220): string {
  const plain = md
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  return plain.length > maxLen ? `${plain.slice(0, maxLen).trim()}…` : plain;
}
