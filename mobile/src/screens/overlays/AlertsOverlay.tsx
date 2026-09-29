import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { OverlayShell } from './OverlayShell';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useAlerts, type AlertItem } from '../../api/alerts';

const serif = Platform.select({ web: 'Georgia, "Iowan Old Style", "Noto Serif", "Times New Roman", serif', ios: 'Georgia', default: 'serif' });

type Tag = AlertItem['tag'];

const KINDS: Record<Tag, { name: string; what: string; Icon: (p: { c: string }) => React.ReactElement }> = {
  DIARY: { name: 'Diary', what: 'WYRD wrote in its diary', Icon: PenIcon },
  DREAM: { name: 'Dream', what: 'WYRD dreamed', Icon: MoonIcon },
  COP: { name: 'Oversight', what: 'COP reviewed a change WYRD made to itself', Icon: ShieldIcon },
  DIGEST: { name: 'Milestone', what: 'WYRD reached a digest milestone', Icon: FlagIcon },
};
const ORDER: Tag[] = ['COP', 'DIARY', 'DREAM', 'DIGEST'];

/** "3m ago" / "5h ago" / "2d ago" -> hours ago (unknown -> a lot). */
function hoursAgo(ago: string) {
  const m = /(\d+)\s*(s|sec|m|min|h|hr|d|day|w)/i.exec(ago);
  if (!m) return /just now|now/i.test(ago) ? 0 : 1e6;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  return u.startsWith('s') ? 0 : u.startsWith('m') ? n / 60 : u.startsWith('h') ? n : u.startsWith('d') ? n * 24 : n * 168;
}

function group(h: number) {
  return h < 1 ? 'THE LAST HOUR' : h < 24 ? 'TODAY' : h < 24 * 7 ? 'THIS WEEK' : 'EARLIER';
}

/** ALERTS: what happened in WYRD's mind while you were away -- diary entries, dreams, oversight
 *  reports and milestones -- as a timeline you can filter by kind. */
export function AlertsOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const alerts = useAlerts();
  const [filter, setFilter] = useState<Tag | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    alerts.forEach((a) => { c[a.tag] = (c[a.tag] ?? 0) + 1; });
    return c;
  }, [alerts]);

  const groups = useMemo(() => {
    const out: [string, AlertItem[]][] = [];
    for (const a of alerts.filter((x) => !filter || x.tag === filter)) {
      const g = group(hoursAgo(a.ago));
      const last = out[out.length - 1];
      if (last && last[0] === g) last[1].push(a);
      else out.push([g, [a]]);
    }
    return out;
  }, [alerts, filter]);

  return (
    <OverlayShell visible={visible} title="ALERTS" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>
          {/* summary */}
          <View style={styles.summary}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Mono style={styles.label}>WHILE YOU WERE AWAY</Mono>
              <Display style={styles.total}>{alerts.length}</Display>
              <Mono style={styles.muted}>{alerts.length === 1 ? 'thing happened in WYRD’s mind' : 'things happened in WYRD’s mind'}</Mono>
            </View>
            <View style={styles.tally}>
              {ORDER.map((t) => {
                const { Icon, name } = KINDS[t];
                return (
                  <View key={t} style={styles.tallyItem}>
                    <Icon c={counts[t] ? colors.mint : colors.greenBorder} />
                    <Display style={[styles.tallyN, !counts[t] && { color: colors.greenBorder }]}>{counts[t] ?? 0}</Display>
                    <Mono style={styles.tallyName}>{name.toUpperCase()}</Mono>
                  </View>
                );
              })}
            </View>
          </View>

          {/* filters */}
          <View style={styles.chips}>
            <Chip label={`ALL · ${alerts.length}`} on={!filter} onPress={() => setFilter(null)} />
            {ORDER.filter((t) => counts[t]).map((t) => (
              <Chip key={t} label={`${KINDS[t].name.toUpperCase()} · ${counts[t]}`} on={filter === t} onPress={() => setFilter(filter === t ? null : t)} />
            ))}
          </View>

          {alerts.length === 0 ? (
            <View style={styles.empty}>
              <Svg width={46} height={46} viewBox="0 0 20 20">
                <Path d="M5 14 V9 A5 5 0 0 1 15 9 V14 L16.5 15.5 H3.5 Z" stroke={colors.greenBorder} strokeWidth={1.2} fill="none" />
                <Path d="M8.5 17.5 Q10 19 11.5 17.5" stroke={colors.greenBorder} strokeWidth={1.2} fill="none" />
              </Svg>
              <Text style={[styles.emptyTitle, { fontFamily: serif }]}>All quiet.</Text>
              <Mono style={[styles.muted, { textAlign: 'center' }]}>
                When WYRD writes in its diary, dreams, reaches a milestone, or COP reviews a change it made to itself, you'll see it here.
              </Mono>
            </View>
          ) : (
            groups.map(([g, items]) => (
              <View key={g} style={{ gap: 10 }}>
                <View style={styles.groupHead}>
                  <Mono style={styles.groupName}>{g}</Mono>
                  <View style={styles.rule} />
                </View>
                {items.map((a, i) => <AlertCard key={a.id} alert={a} last={i === items.length - 1} />)}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </OverlayShell>
  );
}

function AlertCard({ alert, last }: { alert: AlertItem; last: boolean }) {
  const kind = KINDS[alert.tag] ?? KINDS.DIGEST;
  const cop = alert.tag === 'COP';
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.node, cop && styles.nodeCop]}><kind.Icon c={cop ? '#fff' : colors.mint} /></View>
        {!last && <View style={styles.railLine} />}
      </View>
      <View style={[styles.card, cop && styles.cardCop]}>
        <View style={styles.cardHead}>
          <Mono style={[styles.kind, cop && { color: colors.mint }]}>{kind.what.toUpperCase()}</Mono>
          <Mono style={styles.ago}>{alert.ago}</Mono>
        </View>
        <Text style={[styles.body, { fontFamily: serif }]}>{alert.body}</Text>
      </View>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.7 }]}>
      <Mono style={[styles.chipText, on && { color: '#fff' }]}>{label}</Mono>
    </Pressable>
  );
}

function PenIcon({ c }: { c: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20">
      <Path d="M4 16 L5 12 L13.5 3.5 L16.5 6.5 L8 15 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Line x1="3" y1="18" x2="17" y2="18" stroke={c} strokeWidth={1.5} />
    </Svg>
  );
}
function MoonIcon({ c }: { c: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20">
      <Path d="M13 3 A7 7 0 1 0 17 13 A5.5 5.5 0 1 1 13 3 Z" stroke={c} strokeWidth={1.5} fill="none" />
      <Circle cx="15.5" cy="4.5" r="0.9" fill={c} />
    </Svg>
  );
}
function ShieldIcon({ c }: { c: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20">
      <Path d="M10 2 L17 5 V10 Q17 15 10 18 Q3 15 3 10 V5 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M7 10 L9.3 12.3 L13.5 8" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}
function FlagIcon({ c }: { c: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20">
      <Line x1="5" y1="2" x2="5" y2="18" stroke={c} strokeWidth={1.5} />
      <Path d="M5 3 H15 L12.5 6.5 L15 10 H5" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 18 },
  label: { fontSize: 9, letterSpacing: 2.2, color: colors.greenDim },
  muted: { fontSize: 11, lineHeight: 16, color: colors.greenDim },

  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: colors.mint, paddingBottom: 14 },
  total: { fontSize: 56, lineHeight: 58, color: colors.mint },
  tally: { flexDirection: 'row', gap: 18 },
  tallyItem: { alignItems: 'center', gap: 2, minWidth: 54 },
  tallyN: { fontSize: 22, lineHeight: 24, color: colors.mint },
  tallyName: { fontSize: 8, letterSpacing: 1.4, color: colors.greenDim },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.mint, borderColor: colors.mint },
  chipText: { fontSize: 9.5, letterSpacing: 1.4, color: colors.mint },

  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  groupName: { fontSize: 9.5, letterSpacing: 2.2, color: colors.mint },
  rule: { flex: 1, height: 1, backgroundColor: colors.greenBorderDim },

  row: { flexDirection: 'row', gap: 12 },
  rail: { width: 32, alignItems: 'center' },
  node: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.mint, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  nodeCop: { backgroundColor: colors.mint },
  railLine: { flex: 1, width: 1, backgroundColor: colors.greenBorderDim, marginTop: 4, minHeight: 10 },
  card: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.greenBorderDim, backgroundColor: '#fff', padding: 12, gap: 6, marginBottom: 2 },
  cardCop: { borderColor: colors.mint, borderWidth: 1.5 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  kind: { fontSize: 8.5, letterSpacing: 1.4, color: colors.greenDim, flexShrink: 1 },
  ago: { fontSize: 9, color: colors.greenDim },
  body: { fontSize: 15, lineHeight: 22, color: colors.mint },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 50, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 24, fontStyle: 'italic', color: colors.mint },
});
