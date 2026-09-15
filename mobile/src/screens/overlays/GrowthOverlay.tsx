import React from 'react';
import { View } from 'react-native';
import { OverlayShell } from './OverlayShell';
import { GrowthChartCanvas } from '../../components/GrowthChartCanvas';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useGrowth } from '../../api/hooks';

export function GrowthOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { snapshots } = useGrowth();
  return (
    <OverlayShell
      visible={visible}
      title="GROWTH"
      onClose={onClose}
      black
      footer={
        <Mono style={{ borderTopWidth: 1, borderTopColor: colors.greenBorder, padding: 16, paddingBottom: 26, fontSize: 10, lineHeight: 16, letterSpacing: 1, color: colors.greenDim }}>
          TRACKED FROM WHEN THIS WAS ADDED — NO BACK-FILLED HISTORY
        </Mono>
      }
    >
      <View style={{ flex: 1 }}>
        <GrowthChartCanvas snapshots={snapshots} />
      </View>
    </OverlayShell>
  );
}
