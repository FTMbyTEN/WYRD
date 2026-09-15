import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { OverlayShell } from './OverlayShell';
import { GlobeCanvas } from '../../components/GlobeCanvas';
import { Display, Mono } from '../../components/ui';
import { colors } from '../../theme';
import { api } from '../../api/client';
import type { CountryDetail, CountryListItem } from '../../api/types';

// Open-Meteo WMO weather codes, collapsed to short labels for the country card.
const WEATHER_LABELS: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog', 51: 'light drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 95: 'thunderstorm',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  focusCountryName?: string | null; // from the chat's `open_world_map` action, or a marker tap
}

export function GlobeOverlay({ visible, onClose, focusCountryName }: Props) {
  const [countries, setCountries] = useState<CountryListItem[]>([]);
  const [detail, setDetail] = useState<CountryDetail | null>(null);

  useEffect(() => {
    if (!visible) return;
    api.countries().then(setCountries).catch(() => {});
  }, [visible]);

  const focused = useMemo(
    () => countries.find((c) => c.name.toLowerCase() === (focusCountryName ?? '').toLowerCase()) ?? countries[0] ?? null,
    [countries, focusCountryName],
  );

  useEffect(() => {
    if (!focused) return;
    api.country(focused.cca3).then(setDetail).catch(() => setDetail(null));
  }, [focused]);

  return (
    <OverlayShell
      visible={visible}
      title="WORLD_MAP"
      onClose={onClose}
      black
      footer={
        <ScrollView style={styles.footer} contentContainerStyle={{ paddingBottom: 26 }}>
          <Display style={styles.countryName}>{detail?.name ?? focused?.name ?? '—'}</Display>
          <View style={{ marginTop: 10, gap: 6 }}>
            <Row k="capital" v={detail?.capital ?? '—'} />
            <Row k="region" v={detail ? `${detail.region}${detail.subregion ? ` · ${detail.subregion}` : ''}` : '—'} />
            <Row k="live weather" v={detail?.weather ? `${detail.weather.tempC.toFixed(0)}°C · ${WEATHER_LABELS[detail.weather.code] ?? 'code ' + detail.weather.code}` : '—'} />
          </View>
          {focusCountryName && (
            <Mono style={styles.note}>focused because WYRD opened the map here during your conversation</Mono>
          )}
        </ScrollView>
      }
    >
      <View style={{ flex: 1 }}>
        <GlobeCanvas countries={countries} focused={focused} />
        <Mono style={styles.hint}>drag to spin · scroll to zoom · tap a marker</Mono>
      </View>
    </OverlayShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Mono style={{ fontSize: 11.5, color: colors.greenDim }}>{k}</Mono>
      <Mono style={{ fontSize: 11.5, color: colors.mint }}>{v}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center', fontSize: 9.5, letterSpacing: 1, color: colors.greenDim },
  footer: { borderTopWidth: 1, borderTopColor: colors.greenBorder, padding: 16 },
  countryName: { fontSize: 26, letterSpacing: 2 },
  note: { marginTop: 10, fontSize: 11, lineHeight: 16, color: colors.greenDim },
});
