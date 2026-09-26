import React from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { FaceMark } from '../../components/FaceMark';
import { api } from '../../api/client';
import { useAuth } from '../../api/AuthContext';
import { useConversations, useMind, useProfile } from '../../api/hooks';

function daysSince(iso: string | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

interface Props {
  tts: boolean;
  onToggleTts: () => void;
  onOpenCop: () => void;
}

/** Your profile with WYRD: who you are to it, what it has learned about you, and your settings. */
export function YouTab({ tts, onToggleTts, onOpenCop }: Props) {
  const { email, logout } = useAuth();
  const { profile } = useProfile();
  const { total: msgCount } = useConversations();
  const { mind } = useMind();
  const facts = profile?.facts ?? [];
  const days = daysSince(profile?.firstSeen);

  const exportData = async () => {
    try {
      const data = await api.exportAccount();
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'WYRD account export' });
    } catch {
      Alert.alert('Export failed', 'Could not reach WYRD to export your data.');
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'WYRD keeps running and remembers you when you come back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* identity */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <FaceMark mode="scan" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Mono style={styles.eyebrow}>SIGNED IN AS</Mono>
          <Display numberOfLines={1} style={styles.name}>{(email ?? '—').split('@')[0]}</Display>
          <Mono numberOfLines={1} style={styles.email}>{email ?? ''}</Mono>
        </View>
      </View>

      {/* at a glance */}
      <View style={styles.stats}>
        <Stat value={msgCount.toLocaleString()} label="MESSAGES" />
        <View style={styles.statRule} />
        <Stat value={String(facts.length)} label="FACTS KNOWN" />
        <View style={styles.statRule} />
        <Stat value={String(days)} label={days === 1 ? 'DAY' : 'DAYS'} />
      </View>

      {/* what WYRD knows */}
      <Section title="WHAT WYRD KNOWS ABOUT YOU">
        {facts.length === 0 ? (
          <Mono style={styles.muted}>
            Nothing yet. Tell it about yourself in DIALOGUE_LINK and it will remember, privately.
          </Mono>
        ) : (
          facts.slice(0, 12).map((f, i) => (
            <View key={`${i}-${f}`} style={[styles.factRow, i > 0 && styles.rowRule]}>
              <Mono style={styles.factIndex}>{String(i + 1).padStart(2, '0')}</Mono>
              <Mono style={styles.factText}>{f}</Mono>
            </View>
          ))
        )}
        {facts.length > 12 ? <Mono style={styles.muted}>+ {facts.length - 12} more in your export</Mono> : null}
      </Section>

      {/* settings */}
      <Section title="SETTINGS">
        <Row title="Spoken replies" detail="WYRD reads its chat replies aloud">
          <Switch
            value={tts}
            onValueChange={onToggleTts}
            trackColor={{ false: colors.greenBorderDim, true: colors.green }}
            thumbColor={colors.black}
          />
        </Row>
        <Row title="COP oversight" detail="Every change WYRD made to itself, independently reviewed" onPress={onOpenCop} ruled />
        <Row
          title="Export my data"
          detail={`Your private thread and facts${mind ? ` · shared memory holds ${mind.digest.totalTopics.toLocaleString()} topics` : ''}`}
          onPress={exportData}
          ruled
        />
      </Section>

      <Pressable onPress={confirmLogout} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
        <Mono style={styles.logoutText}>LOG OUT</Mono>
      </Pressable>
      <Mono style={styles.footnote}>
        Your conversations and facts are private to you. WYRD's mind, diary and drone are shared by everyone.
      </Mono>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Display style={styles.statValue}>{value}</Display>
      <Mono style={styles.statLabel}>{label}</Mono>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Mono style={styles.eyebrow}>{title}</Mono>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ title, detail, onPress, ruled, children }: {
  title: string;
  detail: string;
  onPress?: () => void;
  ruled?: boolean;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Mono style={styles.rowTitle}>{title}</Mono>
        <Mono style={styles.rowDetail}>{detail}</Mono>
      </View>
      {children ?? <Mono style={styles.chevron}>›</Mono>}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, ruled && styles.rowRule, pressed && styles.pressed]}>
      {body}
    </Pressable>
  ) : (
    <View style={[styles.row, ruled && styles.rowRule]}>{body}</View>
  );
}

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 18 },
  eyebrow: { fontSize: 9, letterSpacing: 2.5, color: colors.greenDim },
  muted: { fontSize: 11.5, lineHeight: 17, color: colors.greenDim, paddingVertical: 4 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.green, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 32, lineHeight: 34, color: colors.green, marginTop: 2 },
  email: { fontSize: 11, color: colors.greenDim },

  stats: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.green,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 28, lineHeight: 30, color: colors.green },
  statLabel: { marginTop: 2, fontSize: 8.5, letterSpacing: 1.5, color: colors.greenDim },
  statRule: { width: HAIRLINE, alignSelf: 'stretch', backgroundColor: colors.greenBorder },

  section: { gap: 8 },
  card: { borderWidth: 1, borderColor: colors.greenBorder, paddingHorizontal: 12, paddingVertical: 4 },
  factRow: { flexDirection: 'row', gap: 10, paddingVertical: 9 },
  factIndex: { fontSize: 10, color: colors.greenBorder, paddingTop: 1 },
  factText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.mint },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowRule: { borderTopWidth: HAIRLINE, borderTopColor: colors.greenBorder },
  rowTitle: { fontSize: 13, color: colors.green },
  rowDetail: { marginTop: 2, fontSize: 10.5, lineHeight: 15, color: colors.greenDim },
  chevron: { fontSize: 20, color: colors.greenDim },
  pressed: { opacity: 0.6 },

  logout: { borderWidth: 1, borderColor: colors.danger, paddingVertical: 13, alignItems: 'center' },
  logoutText: { fontSize: 11, letterSpacing: 2.5, color: colors.danger },
  footnote: { fontSize: 10, lineHeight: 15, color: colors.greenDim, textAlign: 'center' },
});
