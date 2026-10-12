import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type Dashboard as Data, type EvalRunDetail } from '../api/client';
import { colors, fonts } from '../theme';

/**
 * The owner's dashboard (#dashboard): what the AI cost today and over two weeks, WYRD's test-question
 * runs (run them again after a change, and read every answer), what's waiting on the owner, and the
 * city's health. Owner only; the server checks too.
 */
export function Dashboard({ onClose }: { onClose: () => void }) {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [run, setRun] = useState<EvalRunDetail | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.dashboard().then(setData).catch((e) => setError(String(e?.message ?? e)));
  useEffect(() => {
    api.cityCanDesign().then((ok) => { setOwner(ok); if (ok) void load(); }).catch(() => setOwner(false));
  }, []);

  const runEval = async () => {
    setRunning(true); setError(null);
    try { setRun(await api.dashboardRunEval()); await load(); } catch (e) { setError(String((e as Error)?.message ?? e)); }
    setRunning(false);
  };
  const openRun = (id: number) => api.dashboardEvalRun(id).then(setRun).catch((e) => setError(String(e?.message ?? e)));

  if (owner === null) return <View style={s.page}><Text style={s.muted}>Checking access…</Text></View>;
  if (!owner) {
    return (
      <View style={s.page}>
        <Text style={s.h1}>Dashboard</Text>
        <Text style={s.muted}>This page is for WYRD's owner.</Text>
        <Pressable onPress={onClose}><Text style={s.link}>Back to WYRD</Text></Pressable>
      </View>
    );
  }
  const ai = data?.ai;
  const peak = Math.max(0.0001, ...(ai?.days.map((d) => d.usd) ?? [0]));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.page}>
      <View style={s.head}>
        <Text style={s.h1}>Dashboard</Text>
        <View style={s.row}>
          <Pressable onPress={() => void load()}><Text style={s.link}>Refresh</Text></Pressable>
          <Pressable onPress={onClose}><Text style={s.link}>Close</Text></Pressable>
        </View>
      </View>
      {error ? <Text style={[s.card, s.err]}>{error}</Text> : null}
      {!data ? <Text style={s.muted}>Loading…</Text> : (
        <>
          <View style={s.card}>
            <Text style={s.h2}>AI spend</Text>
            <View style={s.tiles}>
              <Tile label="today" value={`$${ai!.spentTodayUsd.toFixed(4)}`} sub={`of $${ai!.capUsd.toFixed(2)} cap`} />
              <Tile label="calls today" value={String(ai!.callsToday)} />
              <Tile label="model" value={ai!.model} />
            </View>
            <View style={s.bars} accessibilityLabel="Spend per day, last 14 days">
              {ai!.days.map((d) => (
                <View key={d.day} style={s.barCol}>
                  <View style={[s.bar, { height: Math.max(2, (d.usd / peak) * 80) }]} />
                  <Text style={s.barDay}>{d.day.slice(8)}</Text>
                </View>
              ))}
            </View>
            <Text style={s.muted}>Daily spend, last 14 days (UTC). Highest: ${peak.toFixed(4)}.</Text>
          </View>

          <View style={s.card}>
            <View style={s.head}>
              <Text style={s.h2}>Test questions</Text>
              <Pressable onPress={runEval} disabled={running} style={[s.btn, running && { opacity: 0.5 }]}>
                <Text style={s.btnText}>{running ? 'Running…' : 'Run now'}</Text>
              </Pressable>
            </View>
            <Text style={s.muted}>The same questions every time, through WYRD's real chat prompt; checked by rules and a short graded call. Costs a fraction of a cent.</Text>
            {data.evals.length === 0 ? <Text style={s.muted}>No runs yet.</Text> : data.evals.map((r) => (
              <Pressable key={r.id} onPress={() => void openRun(r.id)} style={[s.runRow, run?.id === r.id && { borderColor: colors.signal }]}>
                <Text style={[s.mono, { color: r.passed === r.total ? colors.green : colors.signal }]}>{r.passed}/{r.total}</Text>
                <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>{new Date(r.at).toLocaleString()} · {r.model}</Text>
                <Text style={s.muted}>${r.usd.toFixed(4)} · {(r.ms / 1000).toFixed(1)}s</Text>
              </Pressable>
            ))}
            {run ? (
              <View style={{ gap: 8 }}>
                {run.results.map((q) => (
                  <View key={q.id} style={[s.result, !q.pass && { borderColor: colors.danger }]}>
                    <Text style={[s.mono, { color: q.pass ? colors.green : colors.danger }]}>{q.pass ? 'PASS' : 'FAIL'} · {q.id}</Text>
                    <Text style={s.muted} numberOfLines={3}>Q: {q.ask}</Text>
                    <Text style={s.mono} numberOfLines={6}>{q.answer ?? '(no answer)'}</Text>
                    {q.why.map((w) => <Text key={w} style={s.warn}>{w}</Text>)}
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={s.card}>
            <Text style={s.h2}>Waiting on you</Text>
            <View style={s.tiles}>
              <Tile label="agent asks" value={String(data.agent.waiting)} warn={data.agent.waiting > 0} />
              <Tile label="disputes queued" value={String(data.city.disputesQueued)} warn={data.city.disputesQueued > 0} />
              <Tile label="appeals queued" value={String(data.city.appealsQueued)} warn={data.city.appealsQueued > 0} />
            </View>
            <Text style={s.muted}>Agent: {data.agent.running} running or queued, {data.agent.scheduled} scheduled, {data.agent.failedThisWeek} failed this week.</Text>
          </View>

          <View style={s.card}>
            <Text style={s.h2}>NAIJA 2099</Text>
            <View style={s.tiles}>
              <Tile label="players" value={String(data.city.players)} sub={`${data.city.activeToday} active today`} />
              <Tile label="naira held" value={`₦${data.city.naira.toLocaleString()}`} sub={`₦${data.city.debt.toLocaleString()} owed`} />
              <Tile label="the books" value={data.city.booksBalance ? 'balance' : `${data.city.unbalanced} off`} warn={!data.city.booksBalance} />
              <Tile label="fines pending" value={String(data.city.finesPending)} />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <View style={[s.tile, warn && { borderColor: colors.signal }]}>
      <Text style={s.tileLabel}>{label.toUpperCase()}</Text>
      <Text style={[s.tileValue, warn && { color: colors.signal }]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={s.tileLabel}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 14, maxWidth: 820, width: '100%', alignSelf: 'center', backgroundColor: colors.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  h1: { fontFamily: fonts.display, fontSize: 34, color: colors.mint },
  h2: { fontFamily: fonts.display, fontSize: 24, color: colors.mint },
  muted: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.greenDim, lineHeight: 18 },
  mono: { fontFamily: fonts.mono, fontSize: 13.5, color: colors.mint, lineHeight: 19 },
  link: { fontFamily: fonts.mono, fontSize: 14, color: colors.signal },
  warn: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.signal },
  err: { fontFamily: fonts.mono, color: colors.danger },
  card: { backgroundColor: colors.panelBg, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 12, padding: 16, gap: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 140, borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 10, padding: 12, gap: 4 },
  tileLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.greenDim },
  tileValue: { fontFamily: fonts.mono, fontSize: 18, color: colors.mint },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 100 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', backgroundColor: colors.green, borderRadius: 3 },
  barDay: { fontFamily: fonts.mono, fontSize: 9, color: colors.greenDim },
  runRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 8, padding: 10 },
  result: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 10, padding: 12, gap: 6 },
  btn: { backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { fontFamily: fonts.mono, fontSize: 14, color: colors.black },
});
