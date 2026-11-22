import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { messageOf, type PlaybackEngine } from '@zplayer/library';
import { useAccount, useLiked, useLibrarySync, usePlayback, usePlaylists, useSongs } from '@zplayer/library/react';
import { MiniPlayer, Mosaic, NowPlaying, PageBackground, Route, Shell, TopMenu, WindowControls, type FullscreenAdapter, type PlayerControls } from '@zplayer/theme';
import type { Environment } from '../platform/environment';
import { usePrefs } from '../platform/usePrefs';
import type { SdkEngine } from '../playback/sdkEngine';
import { artOf, trackInfo } from './format';
import { PIVOT, type Action, type RouteName } from './routes';
import { AlbumPage } from './screens/AlbumPage';
import { ArtistPage } from './screens/ArtistPage';
import type { Ctx } from './screens/common';
import { DiagnosticsPage } from './screens/DiagnosticsPage';
import { MusicHub } from './screens/MusicHub';
import { PlaylistPage } from './screens/PlaylistPage';
import { SearchHub } from './screens/SearchHub';
import { SettingsPage } from './screens/SettingsPage';
import { SignedOutPage, StartingPage } from './screens/SignedOutPage';
import { StartPage } from './screens/StartPage';
import './app.css';

type StackEntry = { key: number; route: RouteName };
const HOME: StackEntry[] = [{ key: 0, route: { kind: 'home' } }];

/** Full screen for the Tauri window (the browser Fullscreen API doesn't resize a Tauri window). */
const windowFullscreen: FullscreenAdapter = {
  enter: () => getCurrentWindow().setFullscreen(true),
  exit: () => getCurrentWindow().setFullscreen(false),
};

/** The top menu word that owns a screen. History belongs to songs. */
function sectionOf(route: RouteName): string | undefined {
  switch (route.kind) {
    case 'home': return undefined;
    case 'music':
      return route.pivot === PIVOT.albums ? 'albums' : route.pivot === PIVOT.artists ? 'artists'
        : route.pivot === PIVOT.playlists ? 'playlists' : 'songs';
    case 'album': return 'albums';
    case 'artist': return 'artists';
    case 'playlist': return 'playlists';
    case 'diagnostics': return 'settings';
    default: return route.kind;
  }
}

export function App({ engine, environment }: { engine: SdkEngine & PlaybackEngine; environment: Environment }) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const account = useAccount();
  const signedIn = account.status.kind === 'signed-in';
  const sync = useLibrarySync(signedIn);
  const prefs = usePrefs();
  const { state: playback } = usePlayback();
  const liked = useLiked();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [stack, setStack] = useState<StackEntry[]>(HOME);
  const [nowOpen, setNowOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [signedOutDiagnostics, setSignedOutDiagnostics] = useState(false);
  const locked = useRef(false);
  const nextKey = useRef(1);
  /** An album or artist page puts its art behind the whole window, menu bar included. */
  const [pageBackground, setPageBackground] = useState<string>();

  const song = playback.song;
  const track = song ? trackInfo(song) : undefined;
  // While the seek bar is dragged, show the dragged position and ask Spotify once the drag pauses.
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const seekTimer = useRef(0);
  const positionMs = scrubMs ?? playback.positionMs;
  const seek = useCallback((ms: number) => {
    setScrubMs(ms);
    window.clearTimeout(seekTimer.current);
    seekTimer.current = window.setTimeout(() => {
      void engine.seek(ms).catch(error => setNotice(messageOf(error))).finally(() => setScrubMs(null));
    }, 250);
  }, [engine]);

  // The window has no Windows title bar; these drive our own minimize / maximize / close buttons.
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const check = () => void getCurrentWindow().isMaximized().then(setMaximized).catch(() => {});
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
  useEffect(() => { if (liked.error) setNotice(messageOf(liked.error)); }, [liked.error]);

  // Back to the start page on sign-out; close the playing layers.
  useEffect(() => {
    if (signedIn) return;
    setStack(HOME);
    setNowOpen(false);
    setFullOpen(false);
  }, [signedIn]);

  // Covers for the full-screen mosaic: albums of your songs plus your playlists' art.
  const songs = useSongs();
  const playlists = usePlaylists();
  const covers = useMemo(() => [...new Set([
    ...songs.items.map(item => item.album.artwork),
    ...(playlists.data ?? []).map(item => item.artwork),
  ].filter((url): url is string => !!url))], [songs.items, playlists.data]);

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
        if (key === ' ') { event.preventDefault(); action(() => engine.toggle()); }
        return;
      }
      if (key === 'f' && track && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); setFullOpen(true); return; }
      if (nowOpen) {
        if (key === 'escape') setNowOpen(false);
        if (key === ' ') { event.preventDefault(); action(() => engine.toggle()); }
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
  }, [fullOpen, nowOpen, track, action, engine, back]);

  const windowControls = !fullOpen && <WindowControls maximized={maximized}
    onMinimize={() => void getCurrentWindow().minimize()}
    onToggleMaximize={() => void getCurrentWindow().toggleMaximize()}
    onClose={() => void getCurrentWindow().close()} />;

  if (account.status.kind === 'loading') return <><Shell><Route visible><StartingPage /></Route></Shell>{windowControls}</>;

  if (!signedIn) {
    const reconnect = account.status.kind === 'reconnect';
    return <><Shell>
      <Route visible>{signedOutDiagnostics
        ? <DiagnosticsPage snapshot={snapshot} environment={environment} onBack={() => setSignedOutDiagnostics(false)} />
        : <SignedOutPage settings={account.settings} signIn={account.signIn} busy={account.busy || busy} action={action}
            reason={account.status.kind === 'signed-out' ? account.status.error ?? snapshot.reason : undefined}
            reconnect={reconnect} onDiagnostics={() => setSignedOutDiagnostics(true)} />}
      </Route>
      {notice && <p className="toast" role="alert">{notice}</p>}
    </Shell>{windowControls}</>;
  }

  const controlsDisabled = snapshot.mode === 'starting';
  const guarded = (task: () => Promise<unknown>) => () => { if (!controlsDisabled) action(task); };
  const controls: PlayerControls = {
    playing: playback.playing,
    positionMs,
    modeLabel: [snapshot.mode, snapshot.targetName?.toLowerCase()].filter(Boolean).join(' · '),
    onToggle: guarded(() => engine.toggle()),
    onNext: guarded(() => engine.next()),
    onPrevious: guarded(() => engine.previous()),
    onSeek: controlsDisabled ? undefined : seek,
    shuffle: playback.shuffle,
    repeat: playback.repeat,
    volume: playback.volume,
    liked: song ? liked.isLiked(song.id) : undefined,
    onShuffle: guarded(() => engine.setShuffle(!playback.shuffle)),
    onRepeat: guarded(() => engine.setRepeat(playback.repeat === 'off' ? 'all' : playback.repeat === 'all' ? 'one' : 'off')),
    onVolume: level => void engine.setVolume(level).catch(error => setNotice(messageOf(error))),
    onLike: song ? () => void liked.toggle(song) : undefined,
  };

  // The top menu, above every screen except now playing. Picking an item starts a fresh trail from home,
  // so back always leads home; the current section is white. Now playing opens the player, or songs when idle.
  const sections: { label: string; route?: RouteName }[] = [
    { label: 'now playing' },
    { label: 'songs', route: { kind: 'music', pivot: PIVOT.songs } },
    { label: 'albums', route: { kind: 'music', pivot: PIVOT.albums } },
    { label: 'playlists', route: { kind: 'music', pivot: PIVOT.playlists } },
    { label: 'artists', route: { kind: 'music', pivot: PIVOT.artists } },
    { label: 'search', route: { kind: 'search' } },
    { label: 'settings', route: { kind: 'settings' } },
  ];
  const topRoute = stack[stack.length - 1]!.route;
  const currentLabel = sectionOf(topRoute);
  const header = <TopMenu current={sections.findIndex(s => s.label === currentLabel)} stack={topRoute.kind === 'home'}
    onBack={stack.length > 1 ? back : undefined}
    menu={sections.map(s => ({ label: s.label, onClick: () => {
      const route = s.route ?? { kind: 'music', pivot: PIVOT.songs } as RouteName;
      if (!s.route && track) return setNowOpen(true);
      if (s.label !== currentLabel || topRoute.kind === 'home' || (topRoute.kind === 'music' && s.route?.kind === 'music' && topRoute.pivot !== s.route.pivot)) {
        setStack([...HOME, { key: nextKey.current++, route }]);
      }
    } }))} />;

  const page = (route: RouteName, ctx: Ctx) => {
    switch (route.kind) {
      case 'home': return <StartPage ctx={ctx} />;
      case 'music': return <MusicHub ctx={ctx} pivot={route.pivot} />;
      case 'search': return <SearchHub ctx={ctx} />;
      case 'settings': return <SettingsPage ctx={ctx} onSignOut={account.signOut} />;
      case 'diagnostics': return <DiagnosticsPage snapshot={snapshot} environment={environment} onBack={back} />;
      case 'album': return <AlbumPage ctx={ctx} id={route.id} name={route.name} artwork={route.artwork} />;
      case 'artist': return <ArtistPage ctx={ctx} id={route.id} name={route.name} />;
      case 'playlist': return <PlaylistPage ctx={ctx} playlist={route.playlist} />;
    }
  };

  const artist = song?.artists[0];
  return <PageBackground.Provider value={setPageBackground}>
    <Shell background={pageBackground ?? track?.art} header={header}
      footer={track && <MiniPlayer track={track} controls={controls} onOpen={() => setNowOpen(true)} />}>
      {stack.map((entry, i) => {
        const top = i === stack.length - 1;
        const ctx: Ctx = {
          engine, snapshot, environment, prefs, open, back, inputEnabled: top && !nowOpen && !fullOpen, action, busy, sync,
          playingId: song?.id,
        };
        return <Route key={entry.key} visible={top}>{page(entry.route, ctx)}</Route>;
      })}
    </Shell>
    {nowOpen && track && <NowPlaying track={track} controls={controls} onClose={() => setNowOpen(false)}
      onArtist={artist ? () => { setNowOpen(false); open({ kind: 'artist', id: artist.id, name: artist.name }); } : undefined}
      onFullscreen={() => setFullOpen(true)} />}
    {fullOpen && track && <Mosaic track={track} covers={covers.length ? covers : [artOf(song?.album.artwork)]}
      controls={controls} onClose={closeFull} fullscreen={windowFullscreen} />}
    {notice && <p className="toast" role="alert">{notice}</p>}
    {windowControls}
  </PageBackground.Provider>;
}
