import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Header } from './Header';
import { FirstRunTour } from '../components/FirstRunTour';
import { TabBar, type TabKey } from './TabBar';
import { OverlayShell } from './overlays/OverlayShell';
import { AppsSheet } from './AppsSheet';
import { Enter } from '../components/motion';
import { WyrdTab } from './tabs/WyrdTab';
import { ScreenEffects } from '../components/ScreenEffects';
import { prefetchBrain, prefetchDialogue, useAgentBadge, useDroneAccess, useMind } from '../api/hooks';
import { useUnreadAlertCount, markAllAlertsRead } from '../api/alerts';
import { colors, setAccent, setTextSize, setThemeMode } from '../theme';
import { WyrdCall } from '../components/WyrdCall';
import { setGamesOrder } from '../util/gamesOrder';
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
const TasksOverlay = named(() => import('./overlays/TasksOverlay'), 'TasksOverlay') as unknown as typeof import('./overlays/TasksOverlay').TasksOverlay;
const CopOverlay = named(() => import('./overlays/CopOverlay'), 'CopOverlay') as unknown as typeof import('./overlays/CopOverlay').CopOverlay;

type Overlay = 'alerts' | 'link' | 'brain' | 'globe' | 'concept' | 'growth' | 'appPreview' | 'cop' | 'tasks' | 'you' | null;

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
  // agent tasks with something new for you: a result you haven't read, or a question waiting
  const { count: taskBadge, reload: refreshTasks } = useAgentBadge();
  // a book Dialogue Link pulled up: the Academy opens it (behind the chat, which stays open)
  const [bookFocus, setBookFocus] = useState<{ id: number; at: number } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [starter, setStarter] = useState<{ text: string; at: number } | null>(null); // a drafted request for Dialogue Link
  // Dialogue Link keeps its draft and scroll once opened; every other overlay is mounted only
  // while open, so a closed one never polls the server or holds memory
  const [linkOpened, setLinkOpened] = useState(false);
  // VOICE (reading whole replies aloud) is remembered between visits
  const tts = useSound().voice;
  const setTts = (f: (v: boolean) => boolean) => { unlock(); setSound({ voice: f(tts) }); };
  const [globeFocus, setGlobeFocus] = useState<string | null>(null);
  const [appPreviewHtml, setAppPreviewHtml] = useState<string | null>(null);
  // a task picked in the home page's left column: the TASKS panel opens straight on it
  const [taskFocus, setTaskFocus] = useState<number | null>(null);
  // the home page's tasks column (desktop): closed until TASKS is pressed
  const [tasksColumn, setTasksColumn] = useState(false);

  const { mind } = useMind();
  const desktop = useIsDesktop();
  const unread = useUnreadAlertCount();

  // the docked chat's width (desktop), kept between visits
  const { width: winWidth } = useWindowDimensions();
  const [chatWidth, setChatWidth] = useState(() => {
    try { return Number(globalThis.localStorage?.getItem('wyrd.chatWidth')) || 460; } catch { return 460; }
  });
  const resizeChat = (w: number) => {
    setChatWidth(w);
    try { globalThis.localStorage?.setItem('wyrd.chatWidth', String(w)); } catch { /* not kept: fine */ }
  };
  // a panel Dialogue Link opened (an app preview, the globe, tasks) goes back to the chat when it closes
  const [backTo, setBackTo] = useState<Overlay>(null);
  const open = (o: Overlay) => {
    if (o === 'link') setLinkOpened(true);
    if (o !== overlay) sfx('open');
    setBackTo(null);
    setOverlay(o);
  };
  const openFromChat = (o: Overlay) => { open(o); setBackTo('link'); };
  const openAlerts = () => { open('alerts'); markAllAlertsRead(); };
  const [appsOpen, setAppsOpen] = useState(false);
  const openApps = () => { sfx('open'); setAppsOpen(true); };
  const close = () => { if (overlay) sfx('close'); setOverlay(backTo); setBackTo(null); };
  // You is a glass pop-up over the page (as Dialogue Link, Tasks, Alerts and COP), not a page of its own
  const changeTab = (t: TabKey) => { if (t === 'you') { open('you'); return; } if (t !== tab) sfx('tab'); setTab(t); };
  // the tour brings each tab forward as it describes it (a stable callback, so it doesn't re-run)
  const tourTab = useCallback((t: string) => setTab(t as TabKey), []);

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
      () => import('./overlays/GlobeOverlay'), () => import('./overlays/TasksOverlay'), () => import('./tabs/DroneTab'),
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

  // Dialogue Link: a full-screen panel on phones; on desktop a glass panel docked on the right,
  // as wide as you drag it (remembered), still showing while something it opened is on top
  const maxChat = Math.max(420, Math.min(980, Math.round(winWidth * 0.62)));
  // where they are, told to WYRD with each message, so it knows what "this" is
  const TAB_SCREEN: Record<string, string> = {
    wyrd: 'the home screen (WYRD tab: its brain, last thought, Dialogue Link box, chess challenge, LAGOS ISLAND card)',
    journal: 'the Journal (diary, dreams, reasoning, feed)',
    academy: 'the Academy (library and reading)',
    games: 'the Games tab (chess, Connect Four, Reversi, Tic-tac-toe, leaderboard, and YOUR GAMES that WYRD programmed for them)',
    drone: 'the Drone tab',
    you: 'the You page (profile, memories, settings)',
    settings: 'the You page (profile, memories, settings)',
  };
  const OVERLAY_SCREEN: Record<string, string> = {
    alerts: 'the Alerts panel', brain: 'BRAIN_3D', globe: 'the world globe', concept: 'the concept map',
    growth: 'the growth panel', appPreview: 'an app or game WYRD built, open full screen', cop: 'the COP panel',
    tasks: 'the Tasks panel', you: 'the You page (profile, memories, settings)',
  };
  const where = (o: Overlay) => (o && o !== 'link' ? OVERLAY_SCREEN[o] : TAB_SCREEN[tab]) ?? TAB_SCREEN[tab];
  const callWyrd = () => { open('link'); setBackTo(overlay && overlay !== 'link' ? overlay : null); };
  const PLACE: Record<string, () => void> = {
    wyrd: () => { setOverlay(null); changeTab('wyrd'); }, academy: () => { setOverlay(null); changeTab('academy'); },
    games: () => { setOverlay(null); changeTab('games'); }, journal: () => { setOverlay(null); changeTab('journal'); },
    drone: () => { setOverlay(null); changeTab('drone'); }, you: () => open('you'), tasks: () => open('tasks'),
    alerts: () => open('alerts'), cop: () => open('cop'), brain: () => open('brain'), globe: () => open('globe'),
  };
  // a change WYRD made (customize_app), applied as its reply arrives
  const customize = (setting: string, value: string) => {
    if (setting === 'theme' && (value === 'light' || value === 'dark' || value === 'auto')) setThemeMode(value);
    else if (setting === 'accent') setAccent(/^#[0-9a-f]{6}$/i.test(value) ? value : null);
    else if (setting === 'text_size') setTextSize(value);
    else if (setting === 'open') PLACE[value]?.();
    else if (setting === 'games_order') setGamesOrder(value);
  };

  const dialogue = linkOpened ? (
    <DialogueLinkOverlay
      visible={overlay === 'link' || (desktop && backTo === 'link')}
      onClose={close}
      tts={tts}
      onOpenGlobe={(country) => { setGlobeFocus(country); openFromChat('globe'); }}
      onOpenAppPreview={(html) => { setAppPreviewHtml(html); openFromChat('appPreview'); }}
      onOpenDrone={() => { setOverlay(null); changeTab('drone'); }}
      onOpenTasks={() => { setTaskFocus(null); openFromChat('tasks'); void refreshTasks(); }}
      onOpenBook={(id) => { setBookFocus({ id, at: Date.now() }); changeTab('academy'); }}
      starter={starter}
      // worked out afresh for every message: the page they're on now, not the one they called WYRD from
      screen={where(overlay && overlay !== 'link' ? overlay : backTo && backTo !== 'link' ? backTo : null)}
      onCustomize={customize}
      dock={desktop ? { width: Math.min(chatWidth, maxChat), onResize: resizeChat, minWidth: 380, maxWidth: maxChat } : undefined}
    />
  ) : null;

  return (
    <View style={styles.root}>
      <ScreenEffects />

      <View nativeID="wyrd-page" style={[styles.content, desktop && styles.contentDesktop]}>
        {desktop && <TabBar active={overlay === 'you' ? 'you' : tab} onChange={changeTab} vertical onApps={openApps} appsOpen={appsOpen} onOpenChat={() => open('link')} />}
        <View style={{ flex: 1, minWidth: 0 }}>
        <Header
          mind={mind}
          alertCount={unread}
          onOpenAlerts={openAlerts}
          onOpenCop={() => open('cop')}
          taskCount={taskBadge}
          // desktop home: TASKS opens and closes the left column; elsewhere it opens the TASKS panel
          onOpenTasks={() => { if (desktop && tab === 'wyrd') setTasksColumn((v) => !v); else { setTaskFocus(null); open('tasks'); } }}
        />

        <View style={{ flex: 1, minHeight: 0 }}>
          {/* each tab arrives with a short fade and rise */}
          <Enter key={tab} k={tab}>
          <Suspense fallback={<Loading />}>
            {tab === 'wyrd' && (
              <WyrdTab onPlayChess={() => setTab('games')} onOpenBrain={() => open('brain')} onOpenLink={() => open('link')} onOpenTask={(id) => { setTaskFocus(id); open('tasks'); }} showTasks={tasksColumn} onCloseTasks={() => setTasksColumn(false)} />
            )}
            {tab === 'journal' && droneAccess && (
              <JournalTab
                onOpenConcept={() => open('concept')}
                onOpenGrowth={() => open('growth')}
                onOpenGlobe={() => { setGlobeFocus(null); open('globe'); }}
              />
            )}
            {tab === 'academy' && <AcademyTab focus={bookFocus} onAsk={() => open('link')} />}
            {tab === 'games' && (
              <GamesTab
                onAskWyrd={(text) => { setStarter({ text, at: Date.now() }); open('link'); }}
                onPlay={(html) => { setAppPreviewHtml(html); open('appPreview'); }}
              />
            )}
            {tab === 'drone' && droneAccess && <DroneTab />}
            {tab === 'you' && <YouTab tts={tts} onToggleTts={() => setTts((v) => !v)} onOpenCop={() => open('cop')} />}
            {tab === 'settings' && <YouTab tts={tts} onToggleTts={() => setTts((v) => !v)} onOpenCop={() => open('cop')} />}
          </Suspense>
          </Enter>
          {/* desktop: Dialogue Link docked on the right, over the page */}
          {desktop ? <Suspense fallback={null}>{dialogue}</Suspense> : null}
        </View>

        {!desktop && <TabBar active={overlay === 'you' ? 'you' : tab} onChange={changeTab} onApps={openApps} appsOpen={appsOpen} onOpenChat={() => open('link')} />}
        </View>
      </View>

      <Suspense fallback={null}>
        {/* first time only: a short tour of the place */}
        <FirstRunTour onTab={tourTab} />
        {/* APPS: Drone, Journal, Games (and on phones your chats) in one glass pop-up */}
        <AppsSheet
          visible={appsOpen}
          onClose={() => setAppsOpen(false)}
          onPick={changeTab}
          drone={droneAccess}
          withChats={!desktop}
          onOpenChat={() => open('link')}
        />
        {overlay === 'alerts' && <AlertsOverlay visible onClose={close} />}
        {!desktop && dialogue}
        {overlay === 'brain' && <BrainOverlay visible onClose={close} />}
        {overlay === 'globe' && <GlobeOverlay visible onClose={close} focusCountryName={globeFocus} />}
        {overlay === 'concept' && <ConceptMapOverlay visible onClose={close} />}
        {overlay === 'growth' && <GrowthOverlay visible onClose={close} />}
        {overlay === 'appPreview' && <AppPreviewOverlay visible onClose={close} html={appPreviewHtml} />}
        {overlay === 'cop' && <CopOverlay visible onClose={close} />}
        {overlay === 'you' && (
          <OverlayShell visible title="YOU" onClose={close} glassWidth={860} glassHeight={880}>
            <YouTab tts={tts} onToggleTts={() => setTts((v) => !v)} onOpenCop={() => { open('cop'); setBackTo('you'); }} />
          </OverlayShell>
        )}
        {/* ASK WYRD: over every screen but home (which has its own Dialogue Link box) and Dialogue Link itself */}
        <WyrdCall visible={overlay !== 'link' && !(desktop && backTo === 'link') && !(tab === 'wyrd' && !overlay)} onPress={callWyrd} raised={!desktop} />
        {overlay === 'tasks' && <TasksOverlay visible openId={taskFocus} onClose={() => { close(); void refreshTasks(); }} />}
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
