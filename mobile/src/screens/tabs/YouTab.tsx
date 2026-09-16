import React from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Display, Mono } from '../../components/ui';
import { HoloButton, HoloFrame, HoloReadout } from '../../components/Holo';
import { colors } from '../../theme';
import { FaceMark } from '../../components/FaceMark';
import { api } from '../../api/client';
import { useAuth } from '../../api/AuthContext';
import { useConversations, useMind, useProfile } from '../../api/hooks';

function daysSince(iso: string | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function YouTab({ tts, onToggleTts }: { tts: boolean; onToggleTts: () => void }) {
  const { username, logout } = useAuth();
  const { profile } = useProfile();
  const { total: msgCount } = useConversations();
  const { mind } = useMind();

  const exportData = async () => {
    try {
      const data = await api.exportAccount();
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'WYRD account export' });
    } catch {
      Alert.alert('Export failed', 'Could not reach WYRD to export your data.');
    }
  };

  const rows = [
    { k: 'PRIVATE THREAD', v: `${msgCount} messages` },
    { k: 'FACTS ABOUT YOU', v: `${profile?.facts.length ?? 0} retained` },
    { k: 'SHARED MEMORY', v: `${(mind?.digest.totalTopics ?? 0).toLocaleString()} topics` },
    { k: 'MEMBER SINCE', v: profile ? new Date(profile.firstSeen).toDateString() : '—' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <HoloFrame glow={0.6} beam={false} style={styles.identityWrap}>
        <View style={styles.identityPanel}>
          <View style={styles.avatarWrap}><FaceMark mode="scan" /></View>
          <Display style={styles.name}>{(username ?? '—').toUpperCase()}</Display>
          <Mono style={styles.sessionLine}>OWNER NODE · SESSION {daysSince(profile?.firstSeen)}d</Mono>
        </View>
      </HoloFrame>

      <View style={styles.grid}>
        {rows.map((r) => (
          <HoloReadout key={r.k} label={r.k} value={r.v} glow={0.4} style={styles.gridCell} />
        ))}
      </View>

      <HoloFrame glow={0.35} beam={false} style={styles.capWrap}>
        <View style={styles.capPanel}>
          <Mono style={styles.capLabel}>OWNER-ONLY CAPABILITIES</Mono>
          <View style={{ marginTop: 8, gap: 7 }}>
            <CapRow label="Real browsing" value="READ-ONLY · ACCOUNT-GATED" />
            <CapRow label="Code execution" value="SANDBOXED · ACCOUNT-GATED" />
            <CapRow label="Discord bridge" value="SEPARATE PROCESS" />
          </View>
          <Mono style={styles.capFoot}>
            It can never click, type, or submit anything — on this or any site. Availability of the
            three above depends on whether this designation is the configured owner account.
          </Mono>
        </View>
      </HoloFrame>

      <HoloFrame glow={tts ? 0.6 : 0.3} beam={false} groundLight={false} style={styles.ttsWrap}>
        <Pressable onPress={onToggleTts} style={styles.ttsRow}>
          <Mono style={{ fontSize: 11, letterSpacing: 1, color: tts ? colors.green : colors.greenDim }}>
            {tts ? 'SPOKEN REPLIES: ON' : 'SPOKEN REPLIES: OFF'}
          </Mono>
        </Pressable>
      </HoloFrame>

      <View style={styles.bottomRow}>
        <HoloButton label="EXPORT DATA" onPress={exportData} />
        <HoloButton label="LOGOUT" onPress={logout} tone="danger" />
      </View>
    </ScrollView>
  );
}

function CapRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Mono style={{ fontSize: 11.5, color: colors.mint }}>{label}</Mono>
      <Mono style={{ fontSize: 11.5, color: colors.green }}>{value}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 14, paddingBottom: 40 },
  identityWrap: { width: '100%' },
  identityPanel: { alignItems: 'center', padding: 18 },
  avatarWrap: { width: 64, height: 64, marginBottom: 10 },
  name: { fontSize: 40, lineHeight: 40, letterSpacing: 4, textShadowColor: colors.green, textShadowRadius: 14 },
  sessionLine: { marginTop: 6, fontSize: 10, letterSpacing: 1, color: colors.greenDim },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: { width: '47%' },
  capWrap: { width: '100%' },
  capPanel: { padding: 12 },
  capLabel: { fontSize: 9, letterSpacing: 1, color: colors.greenDim },
  capFoot: { marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.greenBorderDim, fontSize: 9.5, lineHeight: 14, color: colors.greenBorderDim },
  ttsWrap: { width: '100%' },
  ttsRow: { padding: 12, alignItems: 'center' },
  bottomRow: { flexDirection: 'row', gap: 8 },
});
