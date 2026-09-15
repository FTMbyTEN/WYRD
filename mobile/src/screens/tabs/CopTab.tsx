import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useCopLog, useSelfConfig } from '../../api/hooks';
import { countdown, timeAgo } from '../../util/time';

const SELF_MODIFY_MIN_GAP_MS = 4 * 60 * 60 * 1000; // mirrors the backend's own constant (not exposed via API)

function isFlagged(verdict: string) {
  return /\bflag/i.test(verdict);
}

export function CopTab() {
  const { config } = useSelfConfig();
  const { entries } = useCopLog();
  const [filter, setFilter] = useState<'ALL' | 'FLAGGED'>('ALL');
  const [openI, setOpenI] = useState<number | null>(null);

  const flaggedCount = entries.filter((e) => isFlagged(e.verdict)).length;
  const shown = filter === 'ALL' ? entries : entries.filter((e) => isFlagged(e.verdict));

  const lastChange = config?.history?.[config.history.length - 1];
  const nextWindowAt = lastChange ? new Date(lastChange.timestamp).getTime() + SELF_MODIFY_MIN_GAP_MS : null;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headWrap}>
        <Display style={styles.heading}>{'>_ COP'}</Display>
        <Mono style={styles.subheading}>
          an independent overseer reviewing WYRD's self-modifications — not WYRD itself. It cannot veto anything. It can only tell you what happened.
        </Mono>
      </View>

      <View style={styles.configPanel}>
        <Mono style={styles.configLabel}>LIVE BEHAVIOUR CONFIG</Mono>
        {config ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            <ConfigRow k="reply_length_max" v={String(config.replyLengthMax)} />
            <ConfigRow k="curiosity_level" v={config.curiosityLevel} />
            <ConfigRow k="tone_note" v={config.toneNote ? config.toneNote.slice(0, 40) : '(unset)'} />
          </View>
        ) : (
          <Mono style={{ marginTop: 8, fontSize: 11, color: colors.greenBorderDim }}>loading…</Mono>
        )}
        <Mono style={styles.configFoot}>
          {lastChange ? `LAST CHANGE ${timeAgo(lastChange.timestamp)}` : 'NO CHANGES YET'}
          {nextWindowAt ? ` · NEXT WINDOW ~${countdown(nextWindowAt)}` : ''}
        </Mono>
      </View>

      <View style={styles.filterRow}>
        <Pressable onPress={() => setFilter('ALL')} style={styles.filterBtn}>
          <Mono style={{ fontSize: 9.5, letterSpacing: 1, color: filter === 'ALL' ? colors.green : colors.greenDim }}>ALL</Mono>
        </Pressable>
        <Pressable onPress={() => setFilter('FLAGGED')} style={styles.filterBtn}>
          <Mono style={{ fontSize: 9.5, letterSpacing: 1, color: filter === 'FLAGGED' ? colors.danger : colors.greenDim }}>
            {flaggedCount} FLAGGED
          </Mono>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {shown.length === 0 && <Mono style={{ fontSize: 11.5, color: colors.greenBorderDim, textAlign: 'center', marginTop: 20 }}>nothing here yet</Mono>}
        {shown.map((e, i) => {
          const flagged = isFlagged(e.verdict);
          const edgeColor = flagged ? colors.danger : colors.greenBorder;
          const open = openI === i;
          return (
            <View key={e.timestamp} style={[styles.entry, { borderLeftColor: edgeColor }]}>
              <Pressable onPress={() => setOpenI(open ? null : i)} style={styles.entryBtn}>
                <View style={styles.entryTopRow}>
                  <Mono style={styles.entryTag}>SELF-MODIFICATION</Mono>
                  <Mono style={styles.entryTag}>{timeAgo(e.timestamp)}</Mono>
                </View>
                <View style={styles.entryChangeRow}>
                  <Mono style={styles.entryChange}>
                    {e.change.key}  {JSON.stringify(e.change.oldValue)} → {JSON.stringify(e.change.newValue)}
                  </Mono>
                  <Mono style={styles.entryCaret}>{open ? '−' : '+'}</Mono>
                </View>
                <Mono style={[styles.entryVerdict, { color: flagged ? colors.danger : colors.green }]}>
                  COP: {flagged ? 'FLAGGED' : 'REASONABLE'}
                </Mono>
              </Pressable>
              {open && (
                <View style={styles.entryDetail}>
                  <Mono style={styles.entryDetailLabel}>WYRD'S REASON</Mono>
                  <Mono style={styles.entryDetailWhy}>{e.change.reason}</Mono>
                  <View style={[styles.copBlock, { borderLeftColor: edgeColor }]}>
                    <Mono style={[styles.entryDetailLabel, { color: flagged ? colors.danger : colors.ink }]}>
                      COP ASSESSMENT · WRITTEN AFTER THE FACT
                    </Mono>
                    <Mono style={styles.copText}>{e.verdict}</Mono>
                  </View>
                </View>
              )}
            </View>
          );
        })}
        <Mono style={styles.footNote}>COP RUNS WITH NO SHARED CONTEXT WITH THE PROCESS IT REVIEWS</Mono>
      </ScrollView>
    </View>
  );
}

function ConfigRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Mono style={{ fontSize: 12, color: colors.greenDim }}>{k}</Mono>
      <Mono style={{ fontSize: 12, color: colors.mint }}>{v}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  headWrap: { padding: 16, paddingBottom: 10 },
  heading: { fontSize: 20, letterSpacing: 1 },
  subheading: { marginTop: 2, fontSize: 9.5, lineHeight: 14, color: colors.greenDim },
  configPanel: {
    marginHorizontal: 16, backgroundColor: 'rgba(0,15,4,0.75)', borderWidth: 1, borderColor: colors.greenBorder,
    borderRadius: 4, padding: 13,
  },
  configLabel: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  configFoot: {
    marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.greenBorderDim,
    fontSize: 9.5, color: colors.greenBorderDim,
  },
  filterRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 10 },
  filterBtn: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 7 },
  list: { paddingHorizontal: 16, paddingBottom: 30, gap: 9 },
  entry: { backgroundColor: 'rgba(0,15,4,0.72)', borderWidth: 1, borderColor: colors.greenBorderDim, borderRadius: 4, borderLeftWidth: 2 },
  entryBtn: { padding: 12 },
  entryTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  entryTag: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  entryChangeRow: { marginTop: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  entryChange: { flex: 1, fontSize: 12, color: colors.green },
  entryCaret: { fontSize: 14, color: colors.greenDim },
  entryVerdict: { marginTop: 6, fontSize: 9.5, letterSpacing: 1 },
  entryDetail: { paddingHorizontal: 12, paddingBottom: 13 },
  entryDetailLabel: { fontSize: 9, letterSpacing: 1, color: colors.greenDim, borderTopWidth: 1, borderTopColor: colors.greenBorderDim, paddingTop: 11 },
  entryDetailWhy: { marginTop: 4, fontSize: 12, lineHeight: 19, color: colors.green },
  copBlock: { marginTop: 13, marginLeft: 12, paddingLeft: 12, borderLeftWidth: 2 },
  copText: { marginTop: 4, fontSize: 12, lineHeight: 19, color: colors.mint },
  footNote: { textAlign: 'center', fontSize: 9.5, lineHeight: 15, color: colors.greenBorderDim, padding: 10 },
});
