import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import type { QuizQuestion, QuizStats } from '../../api/types';

const VERDICTS: [number, string][] = [
  [1, 'Flawless. You were really reading.'],
  [0.8, 'Sharp reading.'],
  [0.6, 'Solid — a couple slipped past.'],
  [0.4, 'Worth a second look at the passage.'],
  [0, 'Read it once more, then try again.'],
];

/** Quiz me: five questions from the passage just read, one at a time. Tap an answer to see
 *  whether it's right and the sentence it came from; at the end, a score, the words that
 *  slipped (they come back next round), and another go. Made on WYRD's server with no AI. */
export function QuizPanel({ itemId, passage, night, onClose, onNext, onStats }: {
  itemId: number;
  passage: string;
  night: boolean;
  onClose: () => void;
  onNext?: () => void;
  onStats?: (s: QuizStats) => void;
}) {
  const [qs, setQs] = useState<QuizQuestion[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);

  const ink = night ? '#F0E4D0' : colors.mint;
  const paper = night ? '#101010' : '#FFFAF2';
  const line = night ? '#3a3a3a' : colors.greenBorder;
  const dim = night ? '#A8957F' : colors.greenDim;

  useEffect(() => {
    let alive = true;
    setQs(null); setFailed(null); setAt(0); setPicked(null); setScore(0); setMissed([]); setDone(false);
    api.libraryQuiz(itemId, passage)
      .then((x) => { if (alive) (x.length ? setQs(x) : setFailed('This passage is too short to quiz on — read on a little, then try again.')); })
      .catch((e) => { if (alive) setFailed(e instanceof Error ? e.message.replace(/^Exception:\s*/, '') : 'Could not make a quiz just now.'); });
    return () => { alive = false; };
  }, [itemId, passage, round]);

  const q = qs?.[at];
  const choose = (i: number) => {
    if (picked != null || !q) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
    else setMissed((m) => [...m, q.keyword]);
  };
  const next = () => {
    if (!qs) return;
    if (at + 1 < qs.length) { setAt(at + 1); setPicked(null); return; }
    setDone(true);
    api.libraryQuizDone(itemId, score, qs.length, missed).then((s) => onStats?.(s)).catch(() => {});
  };

  return (
    <View style={[styles.box, { borderColor: ink, backgroundColor: paper }]}>
      <View style={styles.head}>
        <Mono style={[styles.eyebrow, { color: dim }]}>QUIZ ME · FROM THIS PASSAGE</Mono>
        {qs && !done && (
          <View style={styles.dots}>
            {qs.map((_, i) => <View key={i} style={[styles.dot, { borderColor: ink }, i < at || (i === at && picked != null) ? { backgroundColor: ink } : null]} />)}
          </View>
        )}
        <Pressable onPress={onClose}><Mono style={[styles.close, { color: dim }]}>CLOSE ✕</Mono></Pressable>
      </View>

      {failed ? <Mono style={[styles.note, { color: dim }]}>{failed}</Mono>
        : !qs ? <View style={styles.loading}><ActivityIndicator color={ink} /><Mono style={[styles.note, { color: dim }]}>Writing your questions…</Mono></View>
        : done ? (
          <View style={styles.result}>
            <Display style={[styles.big, { color: ink }]}>{score}/{qs.length}</Display>
            <Mono style={[styles.verdict, { color: ink }]}>{VERDICTS.find(([t]) => score / qs.length >= t)![1]}</Mono>
            {missed.length > 0 && (
              <Mono style={[styles.note, { color: dim }]}>
                To look at again: {[...new Set(missed)].join(', ')}. They’ll come up in your next round.
              </Mono>
            )}
            <View style={styles.row}>
              <Btn label="ANOTHER ROUND" onPress={() => setRound((r) => r + 1)} ink={ink} paper={paper} solid />
              {onNext && <Btn label="NEXT PASSAGE →" onPress={onNext} ink={ink} paper={paper} />}
            </View>
          </View>
        ) : q ? (
          <View style={styles.qa}>
            <Mono style={[styles.kind, { color: dim }]}>
              {q.kind === 'truefalse' ? `QUESTION ${at + 1} · TRUE OR FALSE, ACCORDING TO THE PASSAGE?` : `QUESTION ${at + 1} · FILL IN THE BLANK`}
            </Mono>
            <Mono style={[styles.prompt, { color: ink }]}>{q.kind === 'truefalse' ? `“${q.prompt}”` : q.prompt}</Mono>
            <View style={q.kind === 'truefalse' ? styles.row : styles.options}>
              {q.options.map((o, i) => {
                const right = picked != null && i === q.answer;
                const wrong = picked === i && i !== q.answer;
                return (
                  <Pressable
                    key={o}
                    onPress={() => choose(i)}
                    style={({ pressed }) => [
                      styles.option,
                      { borderColor: line, backgroundColor: paper },
                      q.kind === 'truefalse' && { flex: 1 },
                      right && { backgroundColor: ink, borderColor: ink },
                      wrong && { borderColor: colors.danger },
                      pressed && picked == null && { opacity: 0.7 },
                    ]}
                  >
                    <Mono style={[styles.letter, { color: right ? paper : dim }]}>{q.kind === 'truefalse' ? '' : 'ABCD'[i]}</Mono>
                    <Mono style={[styles.optionText, { color: right ? paper : wrong ? colors.danger : ink }]}>{o}</Mono>
                  </Pressable>
                );
              })}
            </View>
            {picked != null && (
              <View style={[styles.why, { borderLeftColor: picked === q.answer ? ink : colors.danger }]}>
                <Mono style={[styles.whyHead, { color: picked === q.answer ? ink : colors.danger }]}>
                  {picked === q.answer ? 'RIGHT' : `NOT QUITE — ${q.kind === 'truefalse' ? `IT'S ${q.options[q.answer].toUpperCase()}` : `IT'S “${q.options[q.answer]}”`}`}
                </Mono>
                <Mono style={[styles.note, { color: dim }]}>The passage: “{q.explanation}”</Mono>
                <Btn label={at + 1 < qs.length ? 'NEXT QUESTION →' : 'SEE MY SCORE →'} onPress={next} ink={ink} paper={paper} solid />
              </View>
            )}
          </View>
        ) : null}
    </View>
  );
}

function Btn({ label, onPress, ink, paper, solid }: { label: string; onPress: () => void; ink: string; paper: string; solid?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, { borderColor: ink, backgroundColor: solid ? ink : paper }, pressed && { opacity: 0.7 }]}>
      <Mono style={[styles.btnText, { color: solid ? paper : ink }]}>{label}</Mono>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 9, letterSpacing: 2 },
  dots: { flexDirection: 'row', gap: 5, flex: 1 },
  dot: { width: 9, height: 9, borderWidth: 1, borderRadius: 5 },
  close: { fontSize: 10, letterSpacing: 1.4, marginLeft: 'auto' },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  note: { fontSize: 11.5, lineHeight: 17 },
  qa: { gap: 12 },
  kind: { fontSize: 9, letterSpacing: 1.8 },
  prompt: { fontSize: 15, lineHeight: 23 },
  options: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  option: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44 },
  letter: { fontSize: 11, width: 12 },
  optionText: { fontSize: 13, flexShrink: 1 },
  why: { borderLeftWidth: 3, paddingLeft: 12, gap: 8 },
  whyHead: { fontSize: 10, letterSpacing: 1.6 },
  result: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  big: { fontSize: 64, lineHeight: 68 },
  verdict: { fontSize: 13, letterSpacing: 1 },
  btn: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  btnText: { fontSize: 11, letterSpacing: 1.6 },
});
