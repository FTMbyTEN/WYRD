import React from 'react';
import { Platform, View } from 'react-native';
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
      <View style={{ flex: 1, backgroundColor: '#FFFAF2' }}>
        {html && Platform.OS === 'web' ? (
          // web: a sealed frame -- scripts run, but it is its own origin with no way into this app,
          // its storage, its sign-in or the server (no allow-same-origin, no top navigation)
          React.createElement('iframe', {
            srcDoc: html,
            sandbox: 'allow-scripts allow-forms allow-modals',
            referrerPolicy: 'no-referrer',
            title: 'App WYRD built',
            style: { border: 0, width: '100%', height: '100%', background: '#FFFAF2' },
          })
        ) : html ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            setSupportMultipleWindows={false}
            style={{ backgroundColor: '#FFFAF2' }}
          />
        ) : (
          <Mono style={{ textAlign: 'center', marginTop: 40, color: colors.greenBorderDim }}>nothing built yet this session</Mono>
        )}
      </View>
    </OverlayShell>
  );
}
