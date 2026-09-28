import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from './Header';
import { TabBar, type TabKey } from './TabBar';
import { WyrdTab } from './tabs/WyrdTab';
import { JournalTab } from './tabs/JournalTab';
import { YouTab } from './tabs/YouTab';
import { DroneTab } from './tabs/DroneTab';
import { AcademyTab } from './tabs/AcademyTab';
import { AlertsOverlay } from './overlays/AlertsOverlay';
import { DialogueLinkOverlay } from './overlays/DialogueLinkOverlay';
import { BrainOverlay } from './overlays/BrainOverlay';
import { GlobeOverlay } from './overlays/GlobeOverlay';
import { ConceptMapOverlay } from './overlays/ConceptMapOverlay';
import { GrowthOverlay } from './overlays/GrowthOverlay';
import { AppPreviewOverlay } from './overlays/AppPreviewOverlay';
import { CopOverlay } from './overlays/CopOverlay';
import { RainBackground } from '../components/RainBackground';
import { ScreenEffects } from '../components/ScreenEffects';
import { useMind } from '../api/hooks';
import { useUnreadAlertCount, markAllAlertsRead } from '../api/alerts';
import { colors } from '../theme';
import { useIsDesktop } from '../util/layout';

type Overlay = 'alerts' | 'link' | 'brain' | 'globe' | 'concept' | 'growth' | 'appPreview' | 'cop' | null;

export function AppShell() {
  const [tab, setTab] = useState<TabKey>('wyrd');
  // a book Dialogue Link pulled up: the Academy opens it (behind the chat, which stays open)
  const [bookFocus, setBookFocus] = useState<{ id: number; at: number } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tts, setTts] = useState(false);
  const [globeFocus, setGlobeFocus] = useState<string | null>(null);
  const [appPreviewHtml, setAppPreviewHtml] = useState<string | null>(null);

  const { mind } = useMind();
  const desktop = useIsDesktop();
  const unread = useUnreadAlertCount();

  const openAlerts = () => { setOverlay('alerts'); markAllAlertsRead(); };
  const close = () => setOverlay(null);

  return (
    <View style={styles.root}>
      <RainBackground opacity={0.1} />
      <ScreenEffects />

      <View style={[styles.content, desktop && styles.contentDesktop]}>
        {desktop && <TabBar active={tab} onChange={setTab} vertical />}
        <View style={{ flex: 1, minWidth: 0 }}>
        <Header
          mind={mind}
          tts={tts}
          onToggleTts={() => setTts((v) => !v)}
          alertCount={unread}
          onOpenAlerts={openAlerts}
          onOpenCop={() => setOverlay('cop')}
        />

        <View style={[{ flex: 1, minHeight: 0 }, desktop && tab !== 'wyrd' && tab !== 'academy' && tab !== 'journal' && tab !== 'drone' && tab !== 'you' && styles.readable]}>
          {tab === 'wyrd' && (
            <WyrdTab onOpenBrain={() => setOverlay('brain')} onOpenLink={() => setOverlay('link')} />
          )}
          {tab === 'journal' && (
            <JournalTab
              onOpenConcept={() => setOverlay('concept')}
              onOpenGrowth={() => setOverlay('growth')}
              onOpenGlobe={() => { setGlobeFocus(null); setOverlay('globe'); }}
            />
          )}
          {tab === 'academy' && <AcademyTab focus={bookFocus} onAsk={() => setOverlay('link')} />}
          {tab === 'drone' && <DroneTab />}
          {tab === 'you' && <YouTab tts={tts} onToggleTts={() => setTts((v) => !v)} onOpenCop={() => setOverlay('cop')} />}
        </View>

        {!desktop && <TabBar active={tab} onChange={setTab} />}
        </View>
      </View>

      <AlertsOverlay visible={overlay === 'alerts'} onClose={close} />
      <DialogueLinkOverlay
        visible={overlay === 'link'}
        onClose={close}
        tts={tts}
        onOpenGlobe={(country) => { setGlobeFocus(country); setOverlay('globe'); }}
        onOpenAppPreview={(html) => { setAppPreviewHtml(html); setOverlay('appPreview'); }}
        onOpenDrone={() => { setOverlay(null); setTab('drone'); }}
        onOpenBook={(id) => { setBookFocus({ id, at: Date.now() }); setTab('academy'); }}
      />
      <BrainOverlay visible={overlay === 'brain'} onClose={close} />
      <GlobeOverlay visible={overlay === 'globe'} onClose={close} focusCountryName={globeFocus} />
      <ConceptMapOverlay visible={overlay === 'concept'} onClose={close} />
      <GrowthOverlay visible={overlay === 'growth'} onClose={close} />
      <AppPreviewOverlay visible={overlay === 'appPreview'} onClose={close} html={appPreviewHtml} />
      <CopOverlay visible={overlay === 'cop'} onClose={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  content: { flex: 1 },
  contentDesktop: { flexDirection: 'row' },
  // on wide screens, text-heavy tabs stay a comfortable reading width instead of stretching
  readable: { width: '100%', maxWidth: 860, alignSelf: 'center' },
});
