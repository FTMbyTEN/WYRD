import React from 'react';
import { Text, TextStyle } from 'react-native';
import { colors } from '../theme';

// A small, language-agnostic highlighter for the common languages people learn (Python, JS/TS,
// Dart, Java, C, shell): comments, strings, keywords, numbers and function names. Signal's three
// code colours make commands stand out without leaving the monochrome brand.
const KEYWORDS = new Set((
  'def class return if elif else for while in not and or is import from as with try except finally raise ' +
  'lambda pass break continue yield global None True False print ' +
  'function const let var new this typeof instanceof async await export default extends implements interface ' +
  'type enum public private protected static final void int double float bool boolean string char long ' +
  'null true false undefined switch case do throw catch late required echo fi then'
).split(' '));

const TOKEN = /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b(\s*\()?/g;

export function CodeText({ code, style }: { code: string; style?: TextStyle | TextStyle[] }) {
  const parts: React.ReactNode[] = [];
  let last = 0, i = 0;
  for (const m of code.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(code.slice(last, at));
    const k = i++;
    if (m[1]) parts.push(<Text key={k} style={{ color: colors.codeComment, fontStyle: 'italic' }}>{m[1]}</Text>);
    else if (m[2]) parts.push(<Text key={k} style={{ color: colors.codeString }}>{m[2]}</Text>);
    else if (m[3]) parts.push(<Text key={k} style={{ color: colors.codeNumber }}>{m[3]}</Text>);
    else if (m[4] && KEYWORDS.has(m[4])) parts.push(<Text key={k} style={{ color: colors.signal }}>{m[4]}</Text>, m[5] ?? '');
    else if (m[4] && m[5]) parts.push(<Text key={k} style={{ color: colors.codeFn }}>{m[4]}</Text>, m[5]);
    else parts.push(m[0]);
    last = at + m[0].length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return <Text style={style}>{parts}</Text>;
}
