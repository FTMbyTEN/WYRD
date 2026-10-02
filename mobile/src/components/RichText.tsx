import React from 'react';
import { Linking, StyleSheet, Text, TextStyle, View } from 'react-native';
import { colors, fonts } from '../theme';

// **bold**, __bold__, *italic*, _italic_, `code`, [label](url) -- markers only count at word
// boundaries, so "2*3*4" and snake_case_names stay as they are
const INLINE = /(\*\*(?=\S)[\s\S]*?\S\*\*|__(?=\S)[\s\S]*?\S__|(?<![\w*])\*(?=[^\s*])[^*\n]*?[^\s*]\*(?![\w*])|(?<![\w_])_(?=[^\s_])[^_\n]*?[^\s_]_(?![\w_])|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**') || t.startsWith('__')) out.push(<Text key={k} style={styles.bold}>{inline(t.slice(2, -2), k)}</Text>);
    else if (t.startsWith('`')) out.push(<Text key={k} style={styles.code}>{t.slice(1, -1)}</Text>);
    else if (t.startsWith('[')) {
      const [, label, url] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? [];
      out.push(<Text key={k} style={styles.link} onPress={() => { if (/^https?:/.test(url)) Linking.openURL(url); }}>{label}</Text>);
    } else out.push(<Text key={k} style={styles.italic}>{inline(t.slice(1, -1), k)}</Text>);
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'p' | 'quote'; text: string }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'li'; marker: string; text: string; depth: number }
  | { kind: 'rule' };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push({ kind: 'p', text: para.join(' ') }); para = []; };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) { flush(); continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push({ kind: 'rule' }); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.+)$/))) { flush(); out.push({ kind: 'h', level: m[1].length, text: m[2].replace(/\s*#+$/, '') }); continue; }
    if ((m = line.match(/^(\s*)([-*•+])\s+(.+)$/))) { flush(); out.push({ kind: 'li', marker: '•', text: m[3], depth: Math.min(2, Math.floor(m[1].length / 2)) }); continue; }
    if ((m = line.match(/^(\s*)(\d{1,3}[.)])\s+(.+)$/))) { flush(); out.push({ kind: 'li', marker: m[2].replace(')', '.'), text: m[3], depth: Math.min(2, Math.floor(m[1].length / 2)) }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); out.push({ kind: 'quote', text: m[1] }); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

/** Markdown the way a reader expects it: bold is bold, not "**bold**". Paragraphs, headings,
 *  bullet and numbered lists, quotes, rules, and inline bold/italic/code/links. */
export const RichText = React.memo(function RichText({ text, style }: { text: string; style?: TextStyle }) {
  const base = [styles.base, style];
  return (
    <View style={styles.wrap}>
      {blocks(text).map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case 'h':
            return <Text key={k} style={[base, styles.h, b.level <= 2 && styles.h1]}>{inline(b.text, k)}</Text>;
          case 'li':
            return (
              <View key={k} style={[styles.li, { paddingLeft: b.depth * 14 }]}>
                <Text style={[base, styles.marker]}>{b.marker}</Text>
                <Text style={[base, styles.liText]}>{inline(b.text, k)}</Text>
              </View>
            );
          case 'quote':
            return <View key={k} style={styles.quote}><Text style={[base, styles.italic]}>{inline(b.text, k)}</Text></View>;
          case 'rule':
            return <View key={k} style={styles.rule} />;
          default:
            return <Text key={k} style={base}>{inline(b.text, k)}</Text>;
        }
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  base: { fontFamily: fonts.mono, fontSize: 13.5, lineHeight: 21, color: colors.mint },
  bold: { fontWeight: '700', color: colors.green },
  italic: { fontStyle: 'italic' },
  code: { backgroundColor: colors.signalSoft, color: colors.signal, fontSize: 12.5 },
  link: { textDecorationLine: 'underline', color: colors.signal },
  h: { fontWeight: '700', color: colors.green, letterSpacing: 0.4, marginTop: 2 },
  h1: { fontSize: 15, letterSpacing: 1.2, textTransform: 'uppercase' },
  li: { flexDirection: 'row', gap: 8 },
  marker: { minWidth: 14, color: colors.greenDim },
  liText: { flex: 1 },
  quote: { borderLeftWidth: 2, borderLeftColor: colors.greenBorder, paddingLeft: 10 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.greenBorder, marginVertical: 4 },
});
