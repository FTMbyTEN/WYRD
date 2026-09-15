import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from './Header';
import { TabBar, type TabKey } from './TabBar';
import { WyrdTab } from './tabs/WyrdTab';
import { DiaryTab } from './tabs/DiaryTab';
import { CopTab } from './tabs/CopTab';
import { FeedTab } from './tabs/FeedTab';
import { YouTab } from './tabs/YouTab';
import { AlertsOverlay } from './overlays/AlertsOverlay';
import { DialogueLinkOverlay } from './overlays/DialogueLinkOverlay';
import { BrainOverlay } from './overlays/BrainOverlay';
import { GlobeOverlay } from './overlays/GlobeOverlay';
import { ConceptMapOverlay } from './overlays/ConceptMapOverlay';
import { GrowthOverlay } from './overlays/GrowthOverlay';
import { AppPreviewOverlay } from './overlays/AppPreviewOverlay';
import { RainBackground } from '../components/RainBackground';
import { ScreenEffects } from '../components/ScreenEffects';
import { useMind } from '../api/hooks';
import { useUnreadAlertCount, markAllAlertsRead } from '../api/alerts';
import { colors } from '../theme';

type Overlay = 'alerts' | 'link' | 'brain' | 'globe' | 'concept' | 'growth' | 'appPreview' | null;

export function AppShell() {
  const [tab, setTab] = useState<TabKey>('wyrd');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tts, setTts] = useState(false);
  const [globeFocus, setGlobeFocus] = useState<string | null>(null);
  const [appPreviewHtml, setAppPreviewHtml] = useState<string | null>(null);

  const { mind } = useMind();
  const unread = useUnreadAlertCount();

  const openAlerts = () => { setOverlay('alerts'); markAllAlertsRead(); };
  const close = () => setOverlay(null);

  return (
    <View style={styles.root}>
      <RainBackground opacity={0.1} />
      <ScreenEffects />

      <View style={styles.content}>
        <Header
          mind={mind}
          tts={tts}
          onToggleTts={() => setTts((v) => !v)}
          alertCount={unread}
          onOpenAlerts={openAlerts}
        />

        <View style={{ flex: 1, minHeight: 0 }}>
          {tab === 'wyrd' && (
            <WyrdTab onOpenBrain={() => setOverlay('brain')} onOpenLink={() => setOverlay('link')} />
          )}
          {tab === 'diary' && <DiaryTab />}
          {tab === 'cop' && <CopTab />}
          {tab === 'feed' && (
            <FeedTab
              onOpenConcept={() => setOverlay('concept')}
              onOpenGrowth={() => setOverlay('growth')}
              onOpenGlobe={() => { setGlobeFocus(null); setOverlay('globe'); }}
            />
          )}
          {tab === 'you' && <YouTab tts={tts} onToggleTts={() => setTts((v) => !v)} />}
        </View>

        <TabBar active={tab} onChange={setTab} />
      </View>

      <AlertsOverlay visible={overlay === 'alerts'} onClose={close} />
      <DialogueLinkOverlay
        visible={overlay === 'link'}
        onClose={close}
        tts={tts}
        onOpenGlobe={(country) => { setGlobeFocus(country); setOverlay('globe'); }}
        onOpenAppPreview={(html) => { setAppPreviewHtml(html); setOverlay('appPreview'); }}
      />
      <BrainOverlay visible={overlay === 'brain'} onClose={close} />
      <GlobeOverlay visible={overlay === 'globe'} onClose={close} focusCountryName={globeFocus} />
      <ConceptMapOverlay visible={overlay === 'concept'} onClose={close} />
      <GrowthOverlay visible={overlay === 'growth'} onClose={close} />
      <AppPreviewOverlay visible={overlay === 'appPreview'} onClose={close} html={appPreviewHtml} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  content: { flex: 1 },
});
