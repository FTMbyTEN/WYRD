import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Header } from './Header';
import { TabBar, type TabKey } from './TabBar';
import { WyrdTab } from './tabs/WyrdTab';
import { ScreenEffects } from '../components/ScreenEffects';
import { prefetchBrain, prefetchDialogue, useDroneAccess, useMind } from '../api/hooks';
import { useUnreadAlertCount, markAllAlertsRead } from '../api/alerts';
import { colors } from '../theme';
import { useIsDesktop } from '../util/layout';
import { preloadVoice, setSound, sfx, unlock, useSound, voice, type VoiceLine } from '../util/sound';

/** WYRD's greeting, by how long it's been: first ever, a new morning or evening, or just back. */
function greeting(): VoiceLine | null {
  let last = 0;
  try { last = Number(localStorage.getItem('wyrd.lastVisit') || 0); localStorage.setItem('wyrd.lastVisit', String(Date.now())); } catch { return null; }
  if (!last) return 'greet-first';
  const away = Date.now() - last;
  if (away < 20 * 60 * 1000) return null; // a reload, not a return
  const h = new Date().getHours();
  if (away > 4 * 3600 * 1000 && h >= 5 && h < 12) return 'greet-morning';
  if (away > 4 * 3600 * 1000 && h >= 17) return 'greet-evening';
  return 'greet-return';
}

// Everything but the home tab is loaded on demand: the first screen downloads and parses only
// what it shows, and each other tab or overlay arrives the first time it's opened.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const named = (load: () => Promise<Record<string, any>>, name: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType<any> })));

const JournalTab = named(() => import('./tabs/JournalTab'), 'JournalTab') as unknown as typeof import('./tabs/JournalTab').JournalTab;
const AcademyTab = named(() => import('./tabs/AcademyTab'), 'AcademyTab') as unknown as typeof import('./tabs/AcademyTab').AcademyTab;
const GamesTab = named(() => import('./tabs/GamesTab'), 'GamesTab') as unknown as typeof import('./tabs/GamesTab').GamesTab;
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
  const droneAccess = useDroneAccess();
  // a book Dialogue Link pulled up: the Academy opens it (behind the chat, which stays open)
  const [bookFocus, setBookFocus] = useState<{ id: number; at: number } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Dialogue Link keeps its draft and scroll once opened; every other overlay is mounted only
  // while open, so a closed one never polls the server or holds memory
  const [linkOpened, setLinkOpened] = useState(false);
  // VOICE (reading whole replies aloud) is remembered between visits
  const tts = useSound().voice;
  const setTts = (f: (v: boolean) => boolean) => { unlock(); setSound({ voice: f(tts) }); };
  const [globeFocus, setGlobeFocus] = useState<string | null>(null);
  const [appPreviewHtml, setAppPreviewHtml] = useState<string | null>(null);

  const { mind } = useMind();
  const desktop = useIsDesktop();
  const unread = useUnreadAlertCount();

  const open = (o: Overlay) => {
    if (o === 'link') setLinkOpened(true);
    if (o !== overlay) sfx('open');
    setOverlay(o);
  };
  const openAlerts = () => { open('alerts'); markAllAlertsRead(); };
  const close = () => { if (overlay) sfx('close'); setOverlay(null); };
  const changeTab = (t: TabKey) => { if (t !== tab) sfx('tab'); setTab(t); };

  // a signal when new alerts arrive (not for the ones already waiting on arrival)
  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (lastUnread.current != null && unread > lastUnread.current) sfx('alert');
    lastUnread.current = unread;
  }, [unread]);

  // DIALOGUE_LINK is the panel people open most: its code is fetched as soon as the first screen is up,
  // so the tap opens it at once instead of waiting on a download
  useEffect(() => {
    const t = setTimeout(() => { void import('./overlays/DialogueLinkOverlay'); prefetchDialogue(); }, 600);
    return () => clearTimeout(t);
  }, []);

  // BRAIN_3D opens at once: its code and data are fetched ahead once the app has settled
  useEffect(() => {
    const t = setTimeout(() => { void import('./overlays/BrainOverlay'); prefetchBrain(); void import('../components/BrainCanvas').then((m) => m.brainFor(400)); }, 2500); // its mesh too, at the size a grown brain uses
    return () => clearTimeout(t);
  }, []);

  // every other tab and panel: their code fetched one after another once the app is idle, so the
  // first tap on any of them opens it at once instead of waiting on a download
  useEffect(() => {
    const rest: (() => Promise<unknown>)[] = [
      () => import('./tabs/JournalTab'), () => import('./tabs/AcademyTab').then((m) => m.warmDesk()), () => import('./tabs/GamesTab'),
      () => import('./tabs/YouTab'), () => import('./overlays/AlertsOverlay'), () => import('./overlays/CopOverlay'),
      () => import('./overlays/ConceptMapOverlay'), () => import('./overlays/GrowthOverlay'),
      () => import('./overlays/GlobeOverlay'), () => import('./tabs/DroneTab'),
    ];
    let i = 0, timer: ReturnType<typeof setTimeout>;
    const next = () => { if (i < rest.length) void rest[i++]().finally(() => { timer = setTimeout(next, 250); }); };
    timer = setTimeout(next, 4000);
    return () => clearTimeout(timer);
  }, []);

  // WYRD greets whoever just came in (signing in was a tap, so sound is allowed by now)
  useEffect(() => {
    const line = greeting();
    if (!line) return;
    preloadVoice([line]);
    const t = setTimeout(() => { void voice(line); }, 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.root}>
      <ScreenEffects />

      <View style={[styles.content, desktop && styles.contentDesktop]}>
        {desktop && <TabBar active={tab} onChange={changeTab} vertical drone={droneAccess} />}
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
            {tab === 'games' && <GamesTab />}
            {tab === 'drone' && droneAccess && <DroneTab />}
            {tab === 'you' && <YouTab tts={tts} onToggleTts={() => setTts((v) => !v)} onOpenCop={() => open('cop')} />}
          </Suspense>
        </View>

        {!desktop && <TabBar active={tab} onChange={changeTab} drone={droneAccess} />}
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
            onOpenDrone={() => { setOverlay(null); changeTab('drone'); }}
            onOpenBook={(id) => { setBookFocus({ id, at: Date.now() }); changeTab('academy'); }}
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
