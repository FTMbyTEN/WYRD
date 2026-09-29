import React, { Suspense, lazy, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Header } from './Header';
import { TabBar, type TabKey } from './TabBar';
import { WyrdTab } from './tabs/WyrdTab';
import { RainBackground } from '../components/RainBackground';
import { ScreenEffects } from '../components/ScreenEffects';
import { useMind } from '../api/hooks';
import { useUnreadAlertCount, markAllAlertsRead } from '../api/alerts';
import { colors } from '../theme';
import { useIsDesktop } from '../util/layout';
import { LITE } from '../util/perf';

// Everything but the home tab is loaded on demand: the first screen downloads and parses only
// what it shows, and each other tab or overlay arrives the first time it's opened.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const named = (load: () => Promise<Record<string, any>>, name: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType<any> })));

const JournalTab = named(() => import('./tabs/JournalTab'), 'JournalTab') as unknown as typeof import('./tabs/JournalTab').JournalTab;
const AcademyTab = named(() => import('./tabs/AcademyTab'), 'AcademyTab') as unknown as typeof import('./tabs/AcademyTab').AcademyTab;
const DroneTab = named(() => import('./tabs/DroneTab'), 'DroneTab') as unknown as typeof import('./tabs/DroneTab').DroneTab;
const YouTab = named(() => import('./tabs/YouTab'), 'YouTab') as unknown as typeof import('./tabs/YouTab').YouTab;
const AlertsOverlay = named(() => import('./overlays/AlertsOverlay'), 'AlertsOverlay') as unknown as typeof import('./overlays/AlertsOverlay').AlertsOverlay;
const DialogueLinkOverlay = named(() => import('./overlays/DialogueLinkOverlay'), 'DialogueLinkOverlay') as unknown as typeof import('./overlays/DialogueLinkOverlay').DialogueLinkOverlay;
const BrainOverlay = named(() => import('./overlays/BrainOverlay'), 'BrainOverlay') as unknown as typeof import('./overlays/BrainOverlay').BrainOverlay;
const GlobeOverlay = named(() => import('./overlays/GlobeOverlay'), 'GlobeOverlay') as unknown as typeof import('./overlays/GlobeOverlay').GlobeOverlay;
const ConceptMapOverlay = named(() => import('./overlays/ConceptMapOverlay'), 'ConceptMapOverlay') as unknown as typeof import('./overlays/ConceptMapOverlay').ConceptMapOverlay;
const GrowthOverlay = named(() => import('./overlays/GrowthOverlay'), 'GrowthOverlay') as unknown as typeof import('./overlays/GrowthOverlay').GrowthOverlay;
const AppPreviewOverlay = named(() => import('./overlays/AppPreviewOverlay'), 'AppPreviewOverlay') as unknown as typeof import('./overlays/AppPreviewOverlay').AppPreviewOverlay;
const CopOverlay = named(() => import('./overlays/CopOverlay'), 'CopOverlay') as unknown as typeof import('./overlays/CopOverlay').CopOverlay;

type Overlay = 'alerts' | 'link' | 'brain' | 'globe' | 'concept' | 'growth' | 'appPreview' | 'cop' | null;

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.green} />
    </View>
  );
}

export function AppShell() {
  const [tab, setTab] = useState<TabKey>('wyrd');
  // a book Dialogue Link pulled up: the Academy opens it (behind the chat, which stays open)
  const [bookFocus, setBookFocus] = useState<{ id: number; at: number } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Dialogue Link keeps its draft and scroll once opened; every other overlay is mounted only
  // while open, so a closed one never polls the server or holds memory
  const [linkOpened, setLinkOpened] = useState(false);
  const [tts, setTts] = useState(false);
  const [globeFocus, setGlobeFocus] = useState<string | null>(null);
  const [appPreviewHtml, setAppPreviewHtml] = useState<string | null>(null);

  const { mind } = useMind();
  const desktop = useIsDesktop();
  const unread = useUnreadAlertCount();

  const open = (o: Overlay) => {
    if (o === 'link') setLinkOpened(true);
    setOverlay(o);
  };
  const openAlerts = () => { open('alerts'); markAllAlertsRead(); };
  const close = () => setOverlay(null);

  return (
    <View style={styles.root}>
      {!LITE && <RainBackground opacity={0.1} />}
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
          onOpenCop={() => open('cop')}
        />

        <View style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={<Loading />}>
            {tab === 'wyrd' && (
              <WyrdTab onOpenBrain={() => open('brain')} onOpenLink={() => open('link')} />
            )}
            {tab === 'journal' && (
              <JournalTab
                onOpenConcept={() => open('concept')}
                onOpenGrowth={() => open('growth')}
                onOpenGlobe={() => { setGlobeFocus(null); open('globe'); }}
              />
            )}
            {tab === 'academy' && <AcademyTab focus={bookFocus} onAsk={() => open('link')} />}
            {tab === 'drone' && <DroneTab />}
            {tab === 'you' && <YouTab tts={tts} onToggleTts={() => setTts((v) => !v)} onOpenCop={() => open('cop')} />}
          </Suspense>
        </View>

        {!desktop && <TabBar active={tab} onChange={setTab} />}
        </View>
      </View>

      <Suspense fallback={null}>
        {overlay === 'alerts' && <AlertsOverlay visible onClose={close} />}
        {linkOpened && (
          <DialogueLinkOverlay
            visible={overlay === 'link'}
            onClose={close}
            tts={tts}
            onOpenGlobe={(country) => { setGlobeFocus(country); open('globe'); }}
            onOpenAppPreview={(html) => { setAppPreviewHtml(html); open('appPreview'); }}
            onOpenDrone={() => { setOverlay(null); setTab('drone'); }}
            onOpenBook={(id) => { setBookFocus({ id, at: Date.now() }); setTab('academy'); }}
          />
        )}
        {overlay === 'brain' && <BrainOverlay visible onClose={close} />}
        {overlay === 'globe' && <GlobeOverlay visible onClose={close} focusCountryName={globeFocus} />}
        {overlay === 'concept' && <ConceptMapOverlay visible onClose={close} />}
        {overlay === 'growth' && <GrowthOverlay visible onClose={close} />}
        {overlay === 'appPreview' && <AppPreviewOverlay visible onClose={close} html={appPreviewHtml} />}
        {overlay === 'cop' && <CopOverlay visible onClose={close} />}
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  content: { flex: 1 },
  contentDesktop: { flexDirection: 'row' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
