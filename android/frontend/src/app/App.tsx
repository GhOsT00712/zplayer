import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { fetchAccount, messageOf, type Song } from '@zplayer/library';
import { useAccount, useLibraryContext, useLibrarySync, useLiked, usePlayback, usePlaylists, useSongs } from '@zplayer/library/react';
import { MiniPlayer, PageBackground, Route, Shell, type DataState, type PlayerControls, type TrackInfo } from '@zplayer/theme';
import { LockScreen } from '../phone/LockScreen';
import { PhoneNowPlaying } from '../phone/PhoneNowPlaying';
import { EdgeBack, SystemBars } from '../phone/SystemBars';
import { albums, artists, playlists as mockPlaylists } from '../shared/data';
import { applyUrl, inTauri, report, simulateBars, type MockApi, type Screen } from '../mock/bridge';
import type { FakeSpotify } from '../mock/fakeSpotify';
import { usePrefs } from '../platform/usePrefs';
import type { AppRemoteEngine, RemoteSnapshot } from '../playback/appRemoteEngine';
import { artOf, artistNames, trackInfo } from './format';
import { PIVOT, type RouteName } from './routes';
import { AlbumPage } from './screens/AlbumPage';
import { ArtistPage } from './screens/ArtistPage';
import { Forced, type Ctx, type PhoneEngine } from './screens/common';
import { DevicesPage } from './screens/DevicesPage';
import { DiagnosticsPage } from './screens/DiagnosticsPage';
import { HomePage } from './screens/HomePage';
import { MusicHub } from './screens/MusicHub';
import { PlaylistPage } from './screens/PlaylistPage';
import { SearchHub } from './screens/SearchHub';
import { SettingsPage } from './screens/SettingsPage';
import { SignedOutScreen } from './screens/SignedOutScreen';

/** What main.tsx wires up: the Spotify app and Web API in the Android app, fake data in a browser. */
export interface Runtime {
  engine: PhoneEngine;
  /** The Spotify app connection (Android app only). */
  remote?: AppRemoteEngine;
  /** The preview's fake Spotify, so the review panel can force loading and error states. */
  fake?: FakeSpotify;
  /** The Client ID of the saved sign-in (Android app only). */
  clientId?: () => Promise<string | null>;
  upcoming: () => Song[];
}

type StackEntry = { key: number; route: RouteName };
const HOME: StackEntry[] = [{ key: 0, route: { kind: 'home' } }];

const CLIENT_KEY = 'zplayer-android-client-id'; // not a secret: remembered so it isn't typed twice
const noStatus = { subscribe: () => () => {}, getSnapshot: (): RemoteSnapshot | undefined => undefined };

const routeFor: Partial<Record<Screen, RouteName>> = {
  music: { kind: 'music', pivot: PIVOT.songs },
  'music-history': { kind: 'music', pivot: PIVOT.history },
  'music-albums': { kind: 'music', pivot: PIVOT.albums },
  'music-artists': { kind: 'music', pivot: PIVOT.artists },
  'music-playlists': { kind: 'music', pivot: PIVOT.playlists },
  search: { kind: 'search' },
  artist: { kind: 'artist', id: artists[0]!.id, name: artists[0]!.name },
  album: { kind: 'album', id: albums[0]!.id, name: albums[0]!.title, artwork: albums[0]!.art },
  playlist: { kind: 'playlist', id: mockPlaylists[0]!.id, title: mockPlaylists[0]!.title },
  'playlist-not-yours': { kind: 'playlist', id: mockPlaylists[6]!.id, title: mockPlaylists[6]!.title },
  devices: { kind: 'devices' },
  settings: { kind: 'settings' },
  diagnostics: { kind: 'diagnostics' },
};

function describe(route: RouteName) {
  switch (route.kind) {
    case 'artist': return `artist · ${route.name}`;
    case 'album': return `album · ${route.name}`;
    case 'playlist': return `playlist · ${route.title}`;
    default: return route.kind;
  }
}

const modeLabel = 'spotify app · this phone';

export function App({ runtime }: { runtime: Runtime }) {
  const { engine, remote, fake } = runtime;
  const { transport } = useLibraryContext();
  const prefs = usePrefs();
  const account = useAccount();
  const [mockSignedIn, setSignedIn] = useState(true);
  const signedIn = inTauri ? account.status.kind === 'signed-in' : mockSignedIn;
  const [spotifyInstalled, setSpotifyInstalled] = useState(true);
  const [accountName, setAccountName] = useState<string>();
  const sync = useLibrarySync(signedIn);
  const { state: playback } = usePlayback();
  const liked = useLiked();

  const [nowOpen, setNowOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [stack, setStack] = useState<StackEntry[]>(HOME);
  const [notice, setNotice] = useState<string | null>(null);
  // review-panel state
  const [dataState, setDataState] = useState<DataState>('normal');
  const [longTitles, setLongTitles] = useState(false);
  const nextKey = useRef(1);
  /** An album or artist page puts its art behind the whole screen. */
  const [pageBackground, setPageBackground] = useState<string>();

  // the Spotify app connection (Android app): connect once signed in, and show its problems for a few seconds
  useEffect(() => {
    if (!remote || !signedIn) return;
    remote.start();
    return () => remote.stop();
  }, [remote, signedIn]);
  const status = remote ?? noStatus;
  const remoteState = useSyncExternalStore(status.subscribe, status.getSnapshot);
  useEffect(() => {
    if (!remoteState?.error) return;
    const timer = window.setTimeout(() => remote?.clearError(), 6000);
    return () => window.clearTimeout(timer);
  }, [remote, remoteState?.error]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => { if (liked.error) setNotice(messageOf(liked.error)); }, [liked.error]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void fetchAccount(transport).then(me => { if (live) setAccountName(me.name); }, () => {});
    return () => { live = false; };
  }, [signedIn, transport]);

  useEffect(() => { document.documentElement.classList.toggle('sim-bars', simulateBars); }, []);

  // sign-in form (Android app): the Client ID is remembered so it isn't typed twice
  const [clientId, setClientId] = useState(() => { try { return localStorage.getItem(CLIENT_KEY) ?? ''; } catch { return ''; } });
  const readSettings = account.settings;
  useEffect(() => {
    if (inTauri) void readSettings().then(settings => { if (settings.clientId) setClientId(previous => previous || settings.clientId); }, () => {});
  }, [readSettings]);
  const form = inTauri ? {
    clientId, setClientId, busy: account.busy,
    error: account.status.kind === 'signed-out' ? account.status.error : undefined,
    connect: () => {
      try { localStorage.setItem(CLIENT_KEY, clientId.trim()); } catch { /* storage unavailable */ }
      void account.signIn(clientId.trim());
    },
  } : undefined;

  // review panel: make the preview's Spotify slow or failing, so lists show their own states
  useEffect(() => {
    if (fake) fake.mode = dataState === 'loading' ? 'loading' : dataState === 'error' ? 'error' : 'ok';
  }, [fake, dataState]);

  const song = playback.song;
  const track: TrackInfo | undefined = song && trackInfo(song);

  const run = useCallback((task: () => Promise<unknown>) => { void task().catch(error => setNotice(messageOf(error))); }, []);
  const open = useCallback((route: RouteName) => setStack(s => [...s, { key: nextKey.current++, route }]), []);
  /** Opens now playing; with nothing playing yet, opens your songs to pick one instead. */
  const openNow = (queue = false) => {
    if (!song) { open({ kind: 'music', pivot: PIVOT.songs }); return; }
    setQueueOpen(queue);
    setNowOpen(true);
  };

  /** Android back: closes up next, then now playing, then pops a page. On home it would leave the app; on the lock screen it does nothing. */
  const back = useCallback(() => {
    if (locked) return;
    if (nowOpen && queueOpen) setQueueOpen(false);
    else if (nowOpen) setNowOpen(false);
    else setStack(s => s.length > 1 ? s.slice(0, -1) : s);
  }, [locked, nowOpen, queueOpen]);

  // Keys stand in for the back gesture: Esc, Backspace outside text fields, Alt+Left.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement && !['range', 'checkbox'].includes(event.target.type);
      if (event.key === 'Escape' || (event.key === 'Backspace' && !typing) || (event.altKey && event.key === 'ArrowLeft')) {
        event.preventDefault();
        back();
      }
      if (event.key === ' ' && !typing && (nowOpen || locked)) { event.preventDefault(); run(() => engine.toggle()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, nowOpen, locked, engine, run]);

  const controls: PlayerControls = {
    playing: playback.playing,
    positionMs: playback.positionMs,
    shuffle: playback.shuffle,
    repeat: playback.repeat,
    liked: song ? liked.isLiked(song.id) : undefined,
    modeLabel,
    onToggle: () => run(() => engine.toggle()),
    onNext: () => run(() => engine.next()),
    onPrevious: () => run(() => engine.previous()),
    onSeek: ms => run(() => engine.seek(ms)),
    onShuffle: () => run(() => engine.setShuffle(!playback.shuffle)),
    onRepeat: () => run(() => engine.setRepeat(playback.repeat === 'off' ? 'all' : playback.repeat === 'all' ? 'one' : 'off')),
    onLike: song ? () => void liked.toggle(song) : undefined,
    // no onVolume: the phone's volume keys do that
  };

  const signOut = () => {
    if (inTauri) void account.signOut(); else setSignedIn(false);
    setNowOpen(false); setLocked(false); setStack(HOME);
  };

  // ---------- review page link ----------
  const topRoute = stack[stack.length - 1]!.route;
  const screen = !signedIn ? (spotifyInstalled ? 'signed out' : 'signed out · no spotify app')
    : locked ? 'lock screen' : nowOpen ? (queueOpen ? 'up next' : 'now playing') : describe(topRoute);
  useEffect(() => {
    report({ screen, dataState, longTitles, theme: prefs.theme, accent: prefs.accent, motion: prefs.motion });
  }, [screen, dataState, longTitles, prefs.theme, prefs.accent, prefs.motion]);

  const songs = useSongs();
  const playlists = usePlaylists();
  const covers = useMemo(() => [...new Set([
    ...songs.items.map(item => item.album.artwork),
    ...(playlists.data ?? []).map(item => item.artwork),
  ].filter((url): url is string => !!url))], [songs.items, playlists.data]);

  /** Review links to now playing, up next and the lock screen wait here until a song plays. */
  const [wanted, setWanted] = useState<Screen | null>(null);
  const showLayer = (target: Screen) => {
    if (target === 'now') { setQueueOpen(false); setNowOpen(true); }
    if (target === 'up-next') { setQueueOpen(true); setNowOpen(true); }
    if (target === 'lock') setLocked(true);
  };
  const started = useRef(false);
  useEffect(() => {
    if (!wanted) { started.current = false; return; }
    if (song) { showLayer(wanted); setWanted(null); return; }
    if (songs.items.length && !started.current) {
      started.current = true;
      run(() => engine.playSongs(songs.items.map(item => item.uri), 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, song, songs.items]);

  const api: MockApi = {
    go: target => {
      setLocked(false);
      setNowOpen(false);
      if (target === 'signed-out' || target === 'no-spotify-app') {
        setSignedIn(false);
        setSpotifyInstalled(target === 'signed-out');
        setStack(HOME);
        return;
      }
      setSignedIn(true);
      setSpotifyInstalled(true);
      const route = routeFor[target];
      setStack(route ? [...HOME, { key: nextKey.current++, route }] : HOME);
      // screens that need a song: start one if nothing is playing (other screens keep the glow); the
      // library fills in after launch, so wait for the first songs
      if (target === 'now' || target === 'up-next' || target === 'lock') {
        if (song) showLayer(target); else setWanted(target);
      }
    },
    back,
    set: patch => {
      if (patch.dataState) setDataState(patch.dataState);
      if (patch.longTitles !== undefined) setLongTitles(patch.longTitles);
      if (patch.theme) prefs.setTheme(patch.theme);
      if (patch.accent) prefs.setAccent(patch.accent);
      if (patch.motion) prefs.setMotion(patch.motion);
    },
    state: () => ({ screen, dataState, longTitles, theme: prefs.theme, accent: prefs.accent, motion: prefs.motion }),
  };
  window.zpMock = api;
  // The real lock screen (Android, A3): MainActivity calls zpLock() when the screen turns off while a
  // song plays, and shows this app over Android's lock screen.
  window.zpLock = () => { if (song) { setNowOpen(false); setLocked(true); } };
  useEffect(() => { window.ZpLock?.setPlaying(playback.playing && !!song); }, [playback.playing, song]);
  // once, after the first render: open whatever the URL asks for
  useEffect(() => { if (window.zpMock) applyUrl(window.zpMock); }, []);

  const bars = <>
    {simulateBars && <SystemBars locked={locked} />}
    {/* in the app, Android itself turns the edge swipe into a back press (see platform/android.ts) */}
    {!inTauri && <EdgeBack onBack={back} />}
  </>;

  // still reading the saved sign-in: just the background, so the signed-out screen doesn't flash
  if (inTauri && account.status.kind === 'loading') return <><Shell><Route visible><div /></Route></Shell>{bars}</>;

  if (!signedIn) {
    return <>
      <Shell><Route visible>
        <SignedOutScreen spotifyInstalled={inTauri ? (window.ZpRemote?.installed() ?? true) : spotifyInstalled}
          reconnect={account.status.kind === 'reconnect'} onConnect={() => setSignedIn(true)}
          onGetSpotify={() => setSpotifyInstalled(true)} form={form} />
      </Route></Shell>
      {bars}
    </>;
  }

  const page = (route: RouteName, ctx: Ctx) => {
    switch (route.kind) {
      case 'home': return <HomePage ctx={ctx} />;
      case 'music': return <MusicHub ctx={ctx} pivot={route.pivot} />;
      case 'search': return <SearchHub ctx={ctx} />;
      case 'devices': return <DevicesPage ctx={ctx} />;
      case 'settings': return <SettingsPage ctx={ctx} />;
      case 'diagnostics': return <DiagnosticsPage ctx={ctx} />;
      case 'album': return <AlbumPage ctx={ctx} id={route.id} name={route.name} artwork={route.artwork} />;
      case 'artist': return <ArtistPage ctx={ctx} id={route.id} name={route.name} />;
      case 'playlist': return <PlaylistPage ctx={ctx} id={route.id} title={route.title} />;
    }
  };

  const upcoming = runtime.upcoming();
  const toastText = remoteState?.error ?? notice;
  return <Forced.Provider value={{ state: dataState, longTitles, retry: () => setDataState('normal') }}>
    <PageBackground.Provider value={setPageBackground}>
    <Shell background={pageBackground ?? track?.art}
      footer={track && <MiniPlayer track={track} controls={controls} onOpen={() => openNow()} />}>
      {stack.map((entry, i) => {
        const top = i === stack.length - 1;
        const ctx: Ctx = {
          engine, open, back, openNow: () => openNow(), inputEnabled: top && !nowOpen && !locked, prefs, signOut,
          account: accountName ? { name: accountName } : undefined, remote: remoteState, sync, playingId: song?.id, run,
        };
        return <Route key={entry.key} visible={top}>{page(entry.route, ctx)}</Route>;
      })}
    </Shell>
    </PageBackground.Provider>
    {nowOpen && track && <PhoneNowPlaying track={track} controls={controls} queueOpen={queueOpen} onQueue={setQueueOpen}
      queue={upcoming.map(item => ({ title: item.title, artist: artistNames(item), art: artOf(item.album.artwork) }))}
      onClose={() => setNowOpen(false)} onPick={offset => run(() => engine.playUpcoming(offset))}
      onDevices={() => { setNowOpen(false); open({ kind: 'devices' }); }}
      onArtist={() => {
        setNowOpen(false);
        const artist = song?.artists[0];
        if (artist && !artist.id.startsWith('name:')) open({ kind: 'artist', id: artist.id, name: artist.name });
      }} />}
    {toastText && !locked && <div className="zp-toast" role="status" onClick={() => { remote?.clearError(); setNotice(null); }}>{toastText}</div>}
    {locked && track && <LockScreen track={track} covers={covers.length ? covers : [track.art]} controls={controls}
      onUnlock={() => { setLocked(false); window.ZpLock?.unlock(); }} />}
    {bars}
  </Forced.Provider>;
}
