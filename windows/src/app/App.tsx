import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Environment } from '../environment';
import { messageOf, type MusicProvider } from '../music';
import { MiniPlayer, Mosaic, NowPlaying, Route, Shell, TopMenu, WindowControls, type FullscreenAdapter, type PlayerControls } from '@zplayer/theme';
import { artOf, trackInfo, useLivePosition } from './data';
import {
  DevicesPage, DiagnosticsPage, HomePage, MusicHub, PlaylistPage, QuickplayHub, SearchHub, SettingsPage, SignedOutPage,
  StartingPage, type Action, type Ctx, type RouteName,
} from './pages';
import { usePins } from './usePins';
import { usePrefs } from './usePrefs';
import './app.css';

type StackEntry = { key: number; route: RouteName };
const HOME: StackEntry[] = [{ key: 0, route: { kind: 'home' } }];

/** Full screen for the Tauri window (the browser Fullscreen API doesn't resize a Tauri window). */
const windowFullscreen: FullscreenAdapter = {
  enter: () => getCurrentWindow().setFullscreen(true),
  exit: () => getCurrentWindow().setFullscreen(false),
};

export function App({ provider, environment }: { provider: MusicProvider; environment: Environment }) {
  const snapshot = useSyncExternalStore(provider.subscribe, provider.getSnapshot);
  const prefs = usePrefs();
  const pins = usePins();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [stack, setStack] = useState<StackEntry[]>(HOME);
  const [nowOpen, setNowOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [signedOutDiagnostics, setSignedOutDiagnostics] = useState(false);
  const [covers, setCovers] = useState<string[]>([]);
  const locked = useRef(true);
  const nextKey = useRef(1);

  const playback = snapshot.playback;
  const track = playback?.track ? trackInfo(playback.track) : undefined;
  const livePosition = useLivePosition(playback);
  // While the seek bar is dragged, show the dragged position and ask Spotify once the drag pauses.
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const seekTimer = useRef(0);
  const positionMs = scrubMs ?? livePosition;
  const seek = useCallback((ms: number) => {
    setScrubMs(ms);
    window.clearTimeout(seekTimer.current);
    seekTimer.current = window.setTimeout(() => {
      void provider.seek(ms).catch(error => setNotice(messageOf(error))).finally(() => setScrubMs(null));
    }, 250);
  }, [provider]);

  // The window has no Windows title bar; these drive our own minimize / maximize / close buttons.
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const check = () => void getCurrentWindow().isMaximized().then(setMaximized).catch(() => {});
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Restore a saved Spotify sign-in once at start.
  useEffect(() => {
    void provider.restore().catch(error => setNotice(messageOf(error)))
      .finally(() => { locked.current = false; setBusy(false); setReady(true); });
  }, [provider]);

  // One action at a time; errors show as a short notice.
  const action: Action = useCallback(task => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice('');
    void task().catch(error => setNotice(messageOf(error)))
      .finally(() => { locked.current = false; setBusy(false); });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Back to home on sign-out; close the playing layers.
  useEffect(() => {
    if (snapshot.signedIn) return;
    setStack(HOME);
    setNowOpen(false);
    setFullOpen(false);
  }, [snapshot.signedIn]);

  // Covers for the full-screen mosaic: albums of your liked songs plus your playlists' art.
  useEffect(() => {
    if (!snapshot.signedIn) return;
    let live = true;
    void Promise.allSettled([provider.tracks('liked songs', 0), provider.tracks('liked songs', 30), provider.playlists(0)])
      .then(([first, second, lists]) => {
        if (!live) return;
        const arts = [
          ...[first, second].flatMap(r => r.status === 'fulfilled' ? r.value.items.map(t => t.album?.artwork) : []),
          ...(lists.status === 'fulfilled' ? lists.value.items.map(p => p.artwork) : []),
        ].filter((url): url is string => !!url);
        setCovers([...new Set(arts)]);
      });
    return () => { live = false; };
  }, [provider, snapshot.signedIn]);

  const open = useCallback((route: RouteName) => setStack(s => [...s, { key: nextKey.current++, route }]), []);
  const back = useCallback(() => setStack(s => s.length > 1 ? s.slice(0, -1) : s), []);
  const closeFull = useCallback(() => setFullOpen(false), []);

  // Keys: Esc / Backspace / Alt+← / mouse back go back (closing full screen, then now playing first).
  // F toggles full screen while something is playing; Space plays/pauses on the playing screens.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement && !['range', 'checkbox'].includes(event.target.type);
      if (typing && event.key !== 'Escape') return;
      const key = event.key.toLowerCase();
      if (fullOpen) {
        if (key === 'escape' || key === 'f') { event.preventDefault(); setFullOpen(false); }
        if (key === ' ') { event.preventDefault(); action(() => provider.control('toggle')); }
        return;
      }
      if (key === 'f' && track && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); setFullOpen(true); return; }
      if (nowOpen) {
        if (key === 'escape') setNowOpen(false);
        if (key === ' ') { event.preventDefault(); action(() => provider.control('toggle')); }
        return;
      }
      if (key === 'escape' || key === 'backspace' || (event.altKey && key === 'arrowleft')) { event.preventDefault(); back(); }
    };
    const onMouse = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      if (fullOpen) setFullOpen(false); else if (nowOpen) setNowOpen(false); else back();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse); };
  }, [fullOpen, nowOpen, track, action, provider, back]);

  const windowControls = !fullOpen && <WindowControls maximized={maximized}
    onMinimize={() => void getCurrentWindow().minimize()}
    onToggleMaximize={() => void getCurrentWindow().toggleMaximize()}
    onClose={() => void getCurrentWindow().close()} />;

  if (!ready) return <><Shell><Route visible><StartingPage /></Route></Shell>{windowControls}</>;

  if (!snapshot.signedIn) {
    return <><Shell>
      <Route visible>{signedOutDiagnostics
        ? <DiagnosticsPage snapshot={snapshot} environment={environment} onBack={() => setSignedOutDiagnostics(false)} />
        : <SignedOutPage provider={provider} snapshot={snapshot} busy={busy} action={action} onDiagnostics={() => setSignedOutDiagnostics(true)} />}
      </Route>
      {notice && <p className="toast" role="alert">{notice}</p>}
    </Shell>{windowControls}</>;
  }

  const controlsDisabled = snapshot.mode === 'starting';
  const controls: PlayerControls = {
    playing: !!playback?.playing,
    positionMs,
    modeLabel: [snapshot.mode, snapshot.targetName?.toLowerCase()].filter(Boolean).join(' · '),
    onToggle: () => { if (!controlsDisabled) action(() => provider.control('toggle')); },
    onNext: () => { if (!controlsDisabled) action(() => provider.control('next')); },
    onPrevious: () => { if (!controlsDisabled) action(() => provider.control('previous')); },
    onSeek: controlsDisabled ? undefined : seek,
    // Shuffle, repeat, volume and like arrive with the backend work; until then the theme hides them.
  };

  // The top menu, above every screen except now playing. Picking an item starts a fresh trail from home,
  // so back always leads home; the current section is white.
  const sections: { label: string; route: RouteName }[] = [
    { label: 'quickplay', route: { kind: 'quickplay' } },
    { label: 'music', route: { kind: 'music' } },
    { label: 'playlists', route: { kind: 'music', pivot: 1 } },
    ...(provider.capabilities.search ? [{ label: 'search', route: { kind: 'search' } as RouteName }] : []),
    { label: 'devices', route: { kind: 'devices' } },
    { label: 'settings', route: { kind: 'settings' } },
  ];
  const topRoute = stack[stack.length - 1]!.route;
  const currentLabel = topRoute.kind === 'home' ? 'quickplay'
    : topRoute.kind === 'playlist' || (topRoute.kind === 'music' && topRoute.pivot === 1) ? 'playlists'
    : topRoute.kind === 'diagnostics' ? 'settings' : topRoute.kind;
  const header = <TopMenu current={sections.findIndex(s => s.label === currentLabel)} stack={topRoute.kind === 'home'}
    onBack={stack.length > 1 ? back : undefined}
    menu={sections.map(s => ({ label: s.label, onClick: () => {
      if (s.label !== currentLabel || topRoute.kind === 'home') setStack([...HOME, { key: nextKey.current++, route: s.route }]);
    } }))} />;

  const page = (route: RouteName, ctx: Ctx) => {
    switch (route.kind) {
      case 'home': return <HomePage ctx={ctx} />;
      case 'quickplay': return <QuickplayHub ctx={ctx} pivot={route.pivot} />;
      case 'music': return <MusicHub ctx={ctx} pivot={route.pivot} />;
      case 'search': return <SearchHub ctx={ctx} />;
      case 'devices': return <DevicesPage ctx={ctx} />;
      case 'settings': return <SettingsPage ctx={ctx} />;
      case 'diagnostics': return <DiagnosticsPage snapshot={snapshot} environment={environment} onBack={back} />;
      case 'playlist': return <PlaylistPage ctx={ctx} playlist={route.playlist} />;
    }
  };

  return <>
    <Shell background={track?.art} header={header}
      footer={track && <MiniPlayer track={track} controls={controls} onOpen={() => setNowOpen(true)} />}>
      {stack.map((entry, i) => {
        const top = i === stack.length - 1;
        const ctx: Ctx = { provider, snapshot, environment, prefs, open, back, inputEnabled: top && !nowOpen && !fullOpen, action, busy, pins };
        return <Route key={entry.key} visible={top}>{page(entry.route, ctx)}</Route>;
      })}
    </Shell>
    {nowOpen && track && <NowPlaying track={track} controls={controls} onClose={() => setNowOpen(false)}
      onFullscreen={() => setFullOpen(true)} />}
    {fullOpen && track && <Mosaic track={track} covers={covers.length ? covers : [artOf(playback?.track?.album?.artwork)]}
      controls={controls} onClose={closeFull} fullscreen={windowFullscreen} />}
    {notice && <p className="toast" role="alert">{notice}</p>}
    {windowControls}
  </>;
}
