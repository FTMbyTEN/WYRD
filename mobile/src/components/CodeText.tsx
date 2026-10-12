import React, { useMemo } from 'react';
import { Text, TextStyle } from 'react-native';
import { colors } from '../theme';

// A small, language-agnostic highlighter for the common languages people learn (Python, JS/TS,
// Dart, Java, C, shell) and for the HTML/CSS apps WYRD builds: each kind of token gets its own
// colour -- keywords violet, strings green, numbers orange, function calls blue, Types teal, tags
// red, attributes and properties amber, comments muted -- so code reads at a glance.
const KEYWORDS = new Set((
  'def class return if elif else for while in not and or is import from as with try except finally raise ' +
  'lambda pass break continue yield global None True False print self ' +
  'function const let var new this typeof instanceof async await export default extends implements interface ' +
  'type enum public private protected static final void int double float bool boolean string char long ' +
  'null true false undefined switch case do throw catch late required echo fi then'
).split(' '));

// languages where # starts a comment (elsewhere it's a CSS colour, a selector, a #define...)
const HASH_COMMENTS = /^(py|python|sh|bash|shell|zsh|console|ruby|rb|yaml|yml|r|toml|perl|pl|ini|conf|dockerfile|make|makefile)$/i;
const MARKUP = /^(html?|xml|svg|vue|jsx|tsx)$/i;

function tokenizer(lang: string | null | undefined, code: string) {
  const hash = lang ? HASH_COMMENTS.test(lang) : !/[{};]\s*$/m.test(code) || /^\s*#!/.test(code);
  const markup = lang ? MARKUP.test(lang) : /<\/[a-z]/i.test(code);
  const comment = String.raw`<!--[\s\S]*?-->|\/\/[^\n]*|\/\*[\s\S]*?\*\/` + (hash ? String.raw`|#[^\n]*` : '');
  const string = String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|` + '`(?:\\\\.|[^`\\\\])*`';
  const tag = markup ? String.raw`<\/?[A-Za-z][\w-]*` : '(?!)';
  const attr = markup ? String.raw`\b[A-Za-z_:][\w:-]*(?==)` : '(?!)';
  return new RegExp(
    `(${comment})|(${string})|(${tag})|\\b(\\d+(?:\\.\\d+)?(?:px|em|rem|%|s|ms|vh|vw)?)\\b|(${attr})|\\.([A-Za-z_]\\w*)\\b(?!\\s*\\()|\\b([A-Za-z_]\\w*)\\b(\\s*\\()?`,
    'g',
  );
}

export function CodeText({ code, style, lang }: { code: string; style?: TextStyle | TextStyle[]; lang?: string | null }) {
  const parts = useMemo(() => {
    const out: React.ReactNode[] = [];
    let last = 0, i = 0;
    const paint = (text: string, color: string, italic = false) =>
      <Text key={i++} style={{ color, fontStyle: italic ? 'italic' : 'normal' }}>{text}</Text>;
    for (const m of code.matchAll(tokenizer(lang, code))) {
      const at = m.index ?? 0;
      if (at > last) out.push(code.slice(last, at));
      if (m[1]) out.push(paint(m[1], colors.codeComment, true));
      else if (m[2]) out.push(paint(m[2], colors.codeString));
      else if (m[3]) out.push(paint(m[3], colors.codeTag));
      else if (m[4]) out.push(paint(m[4], colors.codeNumber));
      else if (m[5]) out.push(paint(m[5], colors.codeAttr));
      else if (m[6]) out.push('.', paint(m[6], colors.codeAttr));
      else if (m[7] && KEYWORDS.has(m[7])) out.push(paint(m[7], colors.codeKeyword), m[8] ?? '');
      else if (m[7] && m[8]) out.push(paint(m[7], colors.codeFn), m[8]);
      else if (m[7] && /^[A-Z][a-z]\w*$/.test(m[7])) out.push(paint(m[7], colors.codeType));
      else out.push(m[0]);
      last = at + m[0].length;
    }
    if (last < code.length) out.push(code.slice(last));
    return out;
  }, [code, lang]);
  return <Text style={style}>{parts}</Text>;
}
