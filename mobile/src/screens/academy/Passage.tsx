import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CodeText } from '../../components/CodeText';
import { colors } from '../../theme';

/** A passage laid out like a page: paragraphs with room between them, headings ("## …" from
 *  textbooks, or CHAPTER / Letter lines in novels) set apart, bullet lists indented, verse kept
 *  line by line, and _italics_ in italics. */
export function Passage({ text, font, size, color, muted, rtl, dropCap }: {
  text: string;
  font: string | undefined;
  size: number;
  color: string;
  muted: string;
  rtl: boolean;
  dropCap?: boolean; // the start of a chapter or section: a large first letter
}) {
  const paras = text.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // the first ordinary paragraph gets the drop cap
  const capAt = dropCap ? paras.findIndex((p) => !p.startsWith('## ') && !p.startsWith('• ') && !isHeading(p) && p.length > 80) : -1;
  const dir = { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' } as const;

  return (
    <View style={{ gap: size * 0.9, maxWidth: 680, alignSelf: 'center', width: '100%' }}>
      {paras.map((p, i) => {
        if (p.startsWith('## ')) {
          return (
            <Text key={i} selectable style={[{ fontFamily: font, fontSize: size * 1.25, lineHeight: size * 1.6, color, fontWeight: '700', marginTop: i ? size * 0.6 : 0 }, dir]}>
              {inline(p.slice(3))}
            </Text>
          );
        }
        if (isHeading(p)) {
          return (
            <Text key={i} selectable style={[{ fontFamily: font, fontSize: size * 0.95, lineHeight: size * 1.5, color, letterSpacing: 2, textAlign: 'center', marginVertical: size * 0.4 }]}>
              {inline(p)}
            </Text>
          );
        }
        if (p.startsWith('• ')) {
          return (
            <View key={i} style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: font, fontSize: size, lineHeight: size * 1.65, color: muted }}>•</Text>
              <Text selectable style={[{ flex: 1, fontFamily: font, fontSize: size, lineHeight: size * 1.65, color }, dir]}>{inline(p.slice(2))}</Text>
            </View>
          );
        }
        if (isCode(p)) {
          // a program in a textbook: monospaced on its own panel, keywords, strings and numbers in colour
          return (
            <View key={i} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.greenBorderDim, backgroundColor: colors.codeBg }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
                <CodeText code={p} style={{ fontFamily: 'ShareTechMono_400Regular', fontSize: size * 0.82, lineHeight: size * 1.35, color: colors.codeFn }} />
              </ScrollView>
            </View>
          );
        }
        const figure = /^(Figure|Table|Example) \d/.test(p);
        // the opening of a chapter: its first few words in bold small capitals. (A large drop cap
        // drawn inline overflowed its line and overlapped the one above, since text can't float.)
        const lead = i === capAt ? /^((?:\S+\s+){1,3}?\S+)(\s)/.exec(p) : null;
        if (lead && lead[1].length <= 40) {
          return (
            <Text key={i} selectable style={[{ fontFamily: font, fontSize: size, lineHeight: size * 1.7, color }, dir]}>
              <Text style={{ fontWeight: '700', letterSpacing: 1.2, fontVariant: ['small-caps'] }}>{lead[1]}</Text>
              {lead[2]}
              {inline(p.slice(lead[0].length))}
            </Text>
          );
        }
        return (
          <Text
            key={i}
            selectable
            style={[{ fontFamily: font, fontSize: figure ? size * 0.85 : size, lineHeight: (figure ? size * 0.85 : size) * 1.7, color: figure ? muted : color }, dir]}
          >
            {inline(p)}
          </Text>
        );
      })}
    </View>
  );
}

const CODE_LINE = /^\s*(>>>|\.\.\.\s|\$ |def |class |import |from \S+ import |for .+:$|if .+:$|elif .+:$|else:$|while .+:$|try:$|except\b.*:$|return\b|print\(|[A-Za-z_][\w.]*\s*[-+*/]?=\s*\S|[A-Za-z_][\w.]*\(.*\)\s*;?$|#\s|\}|\{$|(const|let|var|function|public|int|void) )/;
/** A paragraph that is a program: most of its lines look like code, and it isn't ordinary prose. */
function isCode(p: string) {
  const lines = p.split('\n').filter((l) => l.trim());
  if (!lines.length || lines.some((l) => l.length > 160)) return false;
  const code = lines.filter((l) => CODE_LINE.test(l)).length;
  if (lines.length === 1) return code === 1 && !/[.!?]["”']?$/.test(lines[0]) && /[()=:]/.test(lines[0]) && lines[0].split(/\s+/).length <= 12;
  return code / lines.length >= 0.6;
}

/** Short stand-alone lines that name a chapter, letter, act or part. */
function isHeading(p: string) {
  if (p.length > 60 || p.includes('\n') || /[,;:]$/.test(p)) return false;
  // the whole line is a marker: "CHAPTER IV.", "Letter 3", "Act II, Scene 1", "BOOK THE FIRST"
  if (/^(chapter|book|part|volume|act|scene|letter|canto|section|stave)\s+([ivxlcdm]+|\d+|the\s+\w+|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s.,:—–-]*(scene\s+[ivxlcdm\d]+\.?)?$/i.test(p)) return true;
  // or a short line in capitals ("THE PROPOSAL", "LETTER III.")
  const letters = p.replace(/[^A-Za-z]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase() && p.split(/\s+/).length <= 8;
}

/** _italic_ spans: only an underscore that opens after a space or line start and closes before
 *  a space or punctuation, so snake_case words and file_names stay as written. */
function inline(s: string): React.ReactNode {
  const re = /(^|[\s(“"‘'—])_([^_\n]{1,120}?)_(?=$|[\s).,;:!?”"’'—])/g;
  if (!re.test(s)) return s;
  re.lastIndex = 0;
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const start = m.index + m[1].length;
    out.push(s.slice(last, start));
    out.push(<Text key={k++} style={{ fontStyle: 'italic' }}>{m[2]}</Text>);
    last = start + m[2].length + 2;
  }
  out.push(s.slice(last));
  return out;
}
