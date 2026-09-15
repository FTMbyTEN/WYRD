import React from 'react';
import { View } from 'react-native';
import { OverlayShell } from './OverlayShell';
import { ConceptGraphCanvas } from '../../components/ConceptGraphCanvas';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';
import { useConcepts } from '../../api/hooks';

export function ConceptMapOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { graph } = useConcepts();
  return (
    <OverlayShell
      visible={visible}
      title="CONCEPT_MAP"
      onClose={onClose}
      black
      footer={
        <Mono style={{ borderTopWidth: 1, borderTopColor: colors.greenBorder, padding: 16, paddingBottom: 26, fontSize: 10, lineHeight: 16, letterSpacing: 1, color: colors.greenDim }}>
          TOPICS THAT ACTUALLY CO-OCCUR IN REAL MEMORY — NOT A CURATED TAXONOMY
        </Mono>
      }
    >
      <View style={{ flex: 1 }}>
        <ConceptGraphCanvas graph={graph} />
      </View>
    </OverlayShell>
  );
}
