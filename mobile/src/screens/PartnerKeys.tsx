import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { colors, fonts } from '../theme';

/**
 * The owner's page for WYRD's partner API (#partners): test the API end to end, open staging once Konnectly has
 * paid, issue keys (shown once, to pass on through a one-time secret link) and revoke them. Owner only; the server
 * checks too.
 */
const PARTNER = 'konnectly';
type Keys = Awaited<ReturnType<typeof api.partnerKeys>>;
type Test = Awaited<ReturnType<typeof api.partnerSelfTest>>;

export function PartnerKeys({ onClose }: { onClose: () => void }) {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [data, setData] = useState<Keys | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState('');
  const [label, setLabel] = useState('');
  const [env, setEnv] = useState<'test' | 'live'>('test');
  const [fresh, setFresh] = useState<{ key: string; prefix: string; env: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.partnerKeys(PARTNER).then(setData).catch((e) => setError(String(e?.message ?? e)));
  useEffect(() => {
    api.cityCanDesign().then((ok) => { setOwner(ok); if (ok) void load(); }).catch(() => setOwner(false));
  }, []);

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await job(); await load(); } catch (e) { setError(String((e as Error)?.message ?? e)); }
    setBusy(false);
  };

  if (owner === null) return <View style={s.page}><Text style={s.muted}>Checking access…</Text></View>;
  if (!owner) {
    return (
      <View style={s.page}>
        <Text style={s.h1}>Partner keys</Text>
        <Text style={s.muted}>This page is for WYRD's owner.</Text>
        <Btn label="Back to WYRD" onPress={onClose} />
      </View>
    );
  }
  const staging = data?.accounts.find((a) => a.env === 'test');
  const stagingOpen = !!staging?.valid_until && new Date(staging.valid_until) > new Date();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.page}>
      <View style={s.head}>
        <Text style={s.h1}>Partner keys · Konnectly</Text>
        <Pressable onPress={onClose} accessibilityRole="button"><Text style={s.link}>Close</Text></Pressable>
      </View>
      {error ? <Text style={[s.card, s.err]}>{error}</Text> : null}

      {/* one real call, with the server's own key */}
      <View style={s.card}>
        <Text style={s.h2}>Test the API</Text>
        <Text style={s.muted}>Sends one real support question to the model in the partner API's shape. Costs a fraction of a cent; nothing is stored.</Text>
        <Btn label={testing ? 'Testing…' : 'Run the test'} disabled={testing} onPress={async () => {
          setTesting(true); setTest(null);
          try { setTest(await api.partnerSelfTest()); } catch (e) { setError(String((e as Error)?.message ?? e)); }
          setTesting(false);
        }} />
        {test ? (
          <View style={s.result}>
            <Text style={[s.mono, { color: test.ok ? '#2E7D4F' : colors.danger }]}>{test.ok ? 'Working' : 'Not working'} · {test.model} · {test.ms} ms</Text>
            {test.ok && test.answer ? <Text style={s.mono}>Reply: {String(test.answer.reply)}{'\n'}Handoff: {String(test.answer.handoff_needed)} ({String(test.answer.handoff_reason)}) · grounded: {String(test.answer.grounded)}</Text> : null}
            {!test.ok ? <Text style={s.mono}>{test.refused ? 'The model declined the request.' : `${test.error ?? ''}${test.detail ? ` — ${test.detail}` : ''}`}</Text> : null}
            <Text style={s.muted}>{test.input_tokens} tokens in, {test.output_tokens} out · ${test.cost_usd.toFixed(5)}</Text>
          </View>
        ) : null}
      </View>

      {/* staging: opened once the $5 is paid */}
      <View style={s.card}>
        <Text style={s.h2}>Staging</Text>
        <Text style={s.muted}>
          {stagingOpen
            ? `Open until ${new Date(staging!.valid_until!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${staging!.used} of ${staging!.allowance} requests used${staging!.note ? ` · ${staging!.note}` : ''}`
            : 'Not open. Open it once Konnectly has paid the $5: 2,000 requests for 30 days.'}
        </Text>
        <TextInput value={note} onChangeText={setNote} placeholder="How it was paid (e.g. transfer ref)" placeholderTextColor={colors.greenDim} style={s.input} accessibilityLabel="Payment note" />
        <Btn label={stagingOpen ? 'Renew staging (another $5)' : 'Open staging ($5 paid)'} disabled={busy || note.trim().length < 3} onPress={() => run(() => api.partnerOpenStaging(PARTNER, note.trim()).then(() => setNote('')))} />
      </View>

      {/* issue a key: shown once */}
      <View style={s.card}>
        <Text style={s.h2}>Issue a key</Text>
        <View style={s.row}>
          {(['test', 'live'] as const).map((e) => (
            <Pressable key={e} onPress={() => setEnv(e)} style={[s.chip, env === e && s.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: env === e }}>
              <Text style={[s.mono, env === e && { color: colors.onSignal }]}>{e === 'test' ? 'Staging' : 'Production'}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={label} onChangeText={setLabel} placeholder="Label (e.g. Konnectly backend, Oct 2026)" placeholderTextColor={colors.greenDim} style={s.input} accessibilityLabel="Key label" />
        <Btn label="Issue key" disabled={busy || label.trim().length < 3} onPress={() => run(async () => { setFresh(await api.partnerIssueKey(PARTNER, env, label.trim())); setLabel(''); setCopied(false); })} />
        {fresh ? (
          <View style={[s.result, { borderColor: colors.signal }]}>
            <Text style={s.warn}>Copy this key now. It won't be shown again — only its hash is kept.</Text>
            <Text selectable style={s.key}>{fresh.key}</Text>
            <View style={s.row}>
              <Btn label={copied ? 'Copied' : 'Copy key'} onPress={() => {
                navigator.clipboard?.writeText(fresh.key).then(() => setCopied(true)).catch(() => setCopied(false));
              }} />
              <Btn label="I've saved it" onPress={() => setFresh(null)} />
            </View>
            <Text style={s.muted}>Send it to Konnectly's technical lead through a one-time secret link (a self-destructing share), never by email or chat in plain text.</Text>
          </View>
        ) : null}
      </View>

      {/* the keys */}
      <View style={s.card}>
        <Text style={s.h2}>Keys</Text>
        {!data ? <Text style={s.muted}>Loading…</Text> : !data.keys.length ? <Text style={s.muted}>No keys yet.</Text> : data.keys.map((k) => (
          <View key={k.prefix} style={s.keyRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.mono}>{k.prefix}…  <Text style={{ color: colors.greenDim }}>{k.env === 'test' ? 'staging' : 'production'} · {k.label}</Text></Text>
              <Text style={s.muted}>{k.active ? (k.last_used ? `Last used ${new Date(k.last_used).toLocaleString('en-GB')}` : 'Never used') : 'Revoked'}</Text>
            </View>
            {k.active ? (revoking === k.prefix ? (
              <View style={s.row}>
                <Btn label="Confirm revoke" danger onPress={() => run(() => api.partnerRevokeKey(k.prefix)).then(() => setRevoking(null))} />
                <Btn label="Keep" onPress={() => setRevoking(null)} />
              </View>
            ) : <Btn label="Revoke" onPress={() => setRevoking(k.prefix)} />) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Btn({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [s.btn, danger && { backgroundColor: colors.danger }, (disabled || pressed) && { opacity: disabled ? 0.45 : 0.8 }]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center', backgroundColor: colors.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { fontFamily: fonts.display, fontSize: 34, color: colors.mint },
  h2: { fontFamily: fonts.display, fontSize: 24, color: colors.mint },
  muted: { fontFamily: fonts.mono, fontSize: 13, color: colors.greenDim, lineHeight: 19 },
  mono: { fontFamily: fonts.mono, fontSize: 14, color: colors.mint, lineHeight: 20 },
  link: { fontFamily: fonts.mono, fontSize: 14, color: colors.signal },
  card: { backgroundColor: colors.panelBg, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 12, padding: 16, gap: 10 },
  err: { fontFamily: fonts.mono, color: colors.danger },
  warn: { fontFamily: fonts.mono, fontSize: 13, color: colors.signal },
  result: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 10, padding: 12, gap: 6 },
  input: { fontFamily: fonts.mono, fontSize: 14, color: colors.mint, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  key: { fontFamily: fonts.code, fontSize: 15, color: colors.mint, backgroundColor: colors.signalSoft, padding: 10, borderRadius: 8 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.greenBorderDim },
  btn: { backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' },
  btnText: { fontFamily: fonts.mono, fontSize: 14, color: colors.onSignal },
});
