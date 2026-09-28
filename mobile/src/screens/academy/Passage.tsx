import React from 'react';
import { Text, View } from 'react-native';

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
        const figure = /^(Figure|Table|Example) \d/.test(p);
        const cap = i === capAt ? p.match(/^([“"'(]*)(\p{L})/u) : null;
        if (cap) {
          return (
            <Text key={i} selectable style={[{ fontFamily: font, fontSize: size, lineHeight: size * 1.7, color }, dir]}>
              <Text style={{ fontSize: size * 2.5, lineHeight: size * 1.7, fontWeight: '700' }}>{cap[1]}{cap[2]}</Text>
              {inline(p.slice(cap[0].length))}
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

/** Short stand-alone lines that name a chapter, letter, act or part. */
function isHeading(p: string) {
  if (p.length > 60 || p.includes('\n') || /[,;]$/.test(p)) return false;
  if (/^(chapter|book|part|volume|act|scene|letter|canto|section|stave)\b[\s.:]*([ivxlcdm\d]+|[a-z]+)?\b/i.test(p)) return true;
  const letters = p.replace(/[^A-Za-z]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase() && !/[.!?]["”’]?$/.test(p.replace(/^[IVXLC]+\.$/, ''));
}

/** _italic_ spans. */
function inline(s: string): React.ReactNode {
  const parts = s.split(/(_[^_\n]{1,120}_)/g);
  if (parts.length === 1) return s;
  return parts.map((x, i) => (/^_[^_]+_$/.test(x) ? <Text key={i} style={{ fontStyle: 'italic' }}>{x.slice(1, -1)}</Text> : x));
}
