import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { OverlayShell } from './OverlayShell';
import { Mono } from '../../components/ui';
import { colors } from '../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  html: string | null;
}

/** Renders whatever the owner's `preview_app` tool call actually returned (a self-contained
 *  HTML/CSS/JS document — see server.js's `preview_app` tool) in a sandboxed WebView. The design
 *  mocked a static "Tip Splitter" demo; this shows the real thing WYRD just built, whatever it
 *  is, with JS enabled but no navigation/file access beyond the document itself. */
export function AppPreviewOverlay({ visible, onClose, html }: Props) {
  return (
    <OverlayShell
      visible={visible}
      title="APP_PREVIEW"
      onClose={onClose}
      black
      footer={
        <Mono style={{ padding: 12, fontSize: 9.5, lineHeight: 14, color: colors.greenDim, borderTopWidth: 1, borderTopColor: colors.greenBorderDim }}>
          a real app WYRD built, running live — sandboxed, cannot touch this app or your data
        </Mono>
      }
    >
      <View style={{ flex: 1, backgroundColor: '#0d0f0d' }}>
        {html ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            setSupportMultipleWindows={false}
            style={{ backgroundColor: '#0d0f0d' }}
          />
        ) : (
          <Mono style={{ textAlign: 'center', marginTop: 40, color: colors.greenBorderDim }}>nothing built yet this session</Mono>
        )}
      </View>
    </OverlayShell>
  );
}
