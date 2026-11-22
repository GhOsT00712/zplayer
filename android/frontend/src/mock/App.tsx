import { useCallback, useEffect, useRef, useState } from 'react';
import { MiniPlayer, Route, Shell, type DataState, type PlayerControls, type TrackInfo } from '@zplayer/theme';
import { LockScreen } from '../phone/LockScreen';
import { PhoneNowPlaying } from '../phone/PhoneNowPlaying';
import { EdgeBack, SystemBars } from '../phone/SystemBars';
import { albums, artistByName, artists, defaultPins, likedSongs, mosaicCovers, playlists, type MockSong, type PinRef } from '../shared/data';
import { usePlayer } from '../shared/usePlayer';
import { applyUrl, inTauri, report, simulateBars, type MockApi, type Screen } from './bridge';
import {
  AlbumPage, ArtistPage, DevicesPage, DiagnosticsPage, HomePage, MusicHub, PlaylistPage, QuickplayHub, SearchHub,
  SettingsPage, SignedOutScreen, MUSIC_TAB, type PageContext, type RouteName,
} from './pages';
import { modeLabel, phoneDevices } from './phoneData';
import { usePrefs } from './usePrefs';
import { useSpotifyAccount } from '../spotify/useSpotifyAccount';
import { useSpotifyPlayer } from '../spotify/useSpotifyPlayer';
import { followedArtists, likedSongs as fetchLikedSongs, myPlaylists, recentlyPlayed as fetchHistory, savedAlbums as fetchSavedAlbums, type RealAlbum, type RealArtist, type RealPlaylist } from '../spotify/library';
import { RealAlbumPage, RealArtistPage, RealDevicesPage, RealPlaylistPage, RealSearchHub, type RealPin } from '../spotify/pages';
import { messageOf } from '../spotify/spotify';

const info = (song: MockSong): TrackInfo => ({
  title: song.title, artist: song.artist, album: song.album.title, art: song.album.art, durationMs: song.durationMs,
});

function toggleIn(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

const PINS_KEY = 'zplayer-android-mock-pins';
function loadPins(): PinRef[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) ?? 'null') ?? defaultPins; } catch { return defaultPins; }
}

type StackEntry = { key: number; route: RouteName };
const HOME: StackEntry[] = [{ key: 0, route: { kind: 'home' } }];

const routeFor: Partial<Record<Screen, RouteName>> = {
  quickplay: { kind: 'quickplay' },
  music: { kind: 'music', pivot: MUSIC_TAB.songs },
  'music-albums': { kind: 'music', pivot: MUSIC_TAB.albums },
  search: { kind: 'search' },
  artist: { kind: 'artist', artist: artists[0]! },
  album: { kind: 'album', album: albums[0]! },
  playlist: { kind: 'playlist', playlist: playlists[0]! },
  'playlist-not-yours': { kind: 'playlist', playlist: playlists[6]! },
  devices: { kind: 'devices' },
  settings: { kind: 'settings' },
  diagnostics: { kind: 'diagnostics' },
};

function describe(route: RouteName) {
  switch (route.kind) {
    case 'artist': return `artist · ${route.artist.name}`;
    case 'album': return `album · ${route.album.title}`;
    case 'playlist': return `playlist · ${route.playlist.title}`;
    case 'sp-album': return `album · ${route.title}`;
    case 'sp-playlist': return `playlist · ${route.title}`;
    case 'sp-artist': return `artist · ${route.name}`;
    default: return route.kind;
  }
}

export function App() {
  const fakePlayer = usePlayer();
  const prefs = usePrefs();
  const [nowOpen, setNowOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [stack, setStack] = useState<StackEntry[]>(HOME);
  const [savedAlbums, setSaved] = useState<Set<string>>(() => new Set(['al0', 'al4']));
  const [followed, setFollowed] = useState<Set<string>>(() => new Set(['ar0', 'ar2', 'ar5']));
  const [pins, setPins] = useState<PinRef[]>(loadPins);
  const [deviceId, setDeviceId] = useState('this-phone');
  // review-panel state
  const [dataState, setDataState] = useState<DataState>('normal');
  const [mockSignedIn, setSignedIn] = useState(true);
  // Inside the Android app the real Spotify sign-in decides; the browser mock keeps its fake one.
  const auth = useSpotifyAccount(inTauri);
  const signedIn = inTauri ? auth.status === 'signed-in' : mockSignedIn;
  const [spotifyInstalled, setSpotifyInstalled] = useState(true);
  const [longTitles, setLongTitles] = useState(false);
  // Inside the Android app, signed in: the Spotify app on this phone plays, through Spotify's Android
  // SDK (App Remote, useSpotifyPlayer.ts), and the library is real (Web API). The owner removed the
  // Web API playback fallback on 18 Nov 2026. Everywhere else: the fake player and library.
  const real = useSpotifyPlayer(inTauri && signedIn);
  const player = inTauri ? real.player : fakePlayer;
  const [realLiked, setRealLiked] = useState<MockSong[] | null>(null);
  const [realHistory, setRealHistory] = useState<MockSong[] | null>(null);
  const [realPlaylists, setRealPlaylists] = useState<RealPlaylist[] | null>(null);
  const [realAlbums, setRealAlbums] = useState<RealAlbum[] | null>(null);
  const [realArtists, setRealArtists] = useState<RealArtist[] | null>(null);
  const [realPins, setRealPins] = useState<RealPin[]>(() => { try { return JSON.parse(localStorage.getItem('zplayer-android-pins') ?? '[]'); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('zplayer-android-pins', JSON.stringify(realPins)); } catch { /* storage unavailable */ } }, [realPins]);
  const toggleRealPin = useCallback((pin: RealPin) => setRealPins(list => list.some(p => p.kind === pin.kind && p.id === pin.id)
    ? list.filter(p => !(p.kind === pin.kind && p.id === pin.id)) : [pin, ...list]), []);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const accountId = auth.account?.id;
  useEffect(() => {
    if (!inTauri || !accountId) return;
    setRealLiked(null); setRealHistory(null); setRealPlaylists(null); setLibraryError(null);
    const failed = (failure: unknown) => setLibraryError(messageOf(failure));
    fetchLikedSongs(accountId).then(setRealLiked, failed);
    fetchHistory().then(setRealHistory, () => setRealHistory([]));
    myPlaylists().then(setRealPlaylists, () => setRealPlaylists([]));
    fetchSavedAlbums().then(setRealAlbums, () => setRealAlbums([]));
    followedArtists().then(setRealArtists, () => setRealArtists([]));
  }, [accountId]);
  // the Spotify app's problems show for a few seconds at the bottom
  useEffect(() => {
    if (!real.error) return;
    const timer = window.setTimeout(real.clearError, 6000);
    return () => window.clearTimeout(timer);
  }, [real.error, real.clearError]);
  const nextKey = useRef(1);
  const track = player.current && info(player.current);
  const device = phoneDevices.find(d => d.id === deviceId)!;

  // Nothing plays at launch: the app opens on the desktop's charcoal glow (--bg-app), and the album
  // art takes over the background once a song plays (Shell background, below).
  useEffect(() => { try { localStorage.setItem(PINS_KEY, JSON.stringify(pins)); } catch { /* storage unavailable */ } }, [pins]);
  useEffect(() => { document.documentElement.classList.toggle('sim-bars', simulateBars); }, []);

  const open = useCallback((route: RouteName) => setStack(s => [...s, { key: nextKey.current++, route }]), []);
  /** Opens now playing; with nothing playing yet, opens your songs to pick one instead. */
  const openNow = (queue = false) => {
    if (!player.current) { open({ kind: 'music', pivot: MUSIC_TAB.songs }); return; }
    setQueueOpen(queue); setNowOpen(true);
  };

  /** Android back: closes now playing, then pops a page. On home it would leave the app; on the lock screen it does nothing. */
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
      if (event.key === ' ' && !typing && (nowOpen || locked)) { event.preventDefault(); player.toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, nowOpen, locked, player]);

  const controls: PlayerControls = {
    playing: player.playing,
    positionMs: player.positionMs,
    shuffle: player.shuffle,
    repeat: player.repeat,
    liked: player.liked,
    modeLabel: modeLabel(device),
    onToggle: player.toggle,
    onNext: player.next,
    onPrevious: player.previous,
    onSeek: player.seek,
    onShuffle: player.toggleShuffle,
    onRepeat: player.cycleRepeat,
    onLike: player.toggleLike,
    // no onVolume: the phone's volume keys do that
  };

  const signOut = () => {
    if (inTauri) void auth.signOut(); else setSignedIn(false);
    setNowOpen(false); setLocked(false); setStack(HOME);
  };

  // ---------- review page link ----------
  const topRoute = stack[stack.length - 1]!.route;
  const screen = !signedIn ? (spotifyInstalled ? 'signed out' : 'signed out · no spotify app')
    : locked ? 'lock screen' : nowOpen ? (queueOpen ? 'up next' : 'now playing') : describe(topRoute);
  useEffect(() => {
    report({ screen, dataState, longTitles, theme: prefs.theme, accent: prefs.accent, motion: prefs.motion });
  }, [screen, dataState, longTitles, prefs.theme, prefs.accent, prefs.motion]);

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
      // screens that need a song: start one if nothing is playing (other screens keep the glow)
      if ((target === 'now' || target === 'up-next' || target === 'lock') && !player.current) player.playList(likedSongs, 0);
      if (target === 'now') openNow();
      if (target === 'up-next') openNow(true);
      if (target === 'lock') setLocked(true);
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
  window.zpLock = () => { if (player.current) { setNowOpen(false); setLocked(true); } };
  useEffect(() => { window.ZpLock?.setPlaying(player.playing && !!player.current); }, [player.playing, player.current]);
  // once, after the first render: open whatever the URL asks for
  useEffect(() => { if (window.zpMock) applyUrl(window.zpMock); }, []);

  const bars = <>
    {simulateBars && <SystemBars locked={locked} />}
    {/* in the app, Android itself turns the edge swipe into a back press (see platform/android.ts) */}
    {!inTauri && <EdgeBack onBack={back} />}
  </>;

  // still reading the saved sign-in: just the background, so the signed-out screen doesn't flash
  if (inTauri && auth.status === 'checking') return <><Shell><Route visible><div /></Route></Shell>{bars}</>;

  if (!signedIn) {
    return <>
      <Shell><Route visible>
        <SignedOutScreen spotifyInstalled={spotifyInstalled} onConnect={() => setSignedIn(true)} onGetSpotify={() => setSpotifyInstalled(true)}
          auth={inTauri ? auth : undefined} />
      </Route></Shell>
      {bars}
    </>;
  }

  const page = (route: RouteName, ctx: PageContext) => {
    switch (route.kind) {
      case 'home': return <HomePage ctx={ctx} />;
      case 'quickplay': return <QuickplayHub ctx={ctx} pivot={route.pivot} />;
      case 'music': return <MusicHub ctx={ctx} pivot={route.pivot} />;
      case 'search': return inTauri ? <RealSearchHub ctx={ctx} /> : <SearchHub ctx={ctx} />;
      case 'devices': return inTauri ? <RealDevicesPage ctx={ctx} /> : <DevicesPage ctx={ctx} />;
      case 'sp-album': return <RealAlbumPage ctx={ctx} id={route.id} title={route.title} />;
      case 'sp-playlist': return <RealPlaylistPage ctx={ctx} id={route.id} title={route.title} />;
      case 'sp-artist': return <RealArtistPage ctx={ctx} id={route.id} name={route.name} />;
      case 'settings': return <SettingsPage ctx={ctx} />;
      case 'diagnostics': return <DiagnosticsPage ctx={ctx} />;
      case 'artist': return <ArtistPage ctx={ctx} artist={route.artist} />;
      case 'album': return <AlbumPage ctx={ctx} album={route.album} />;
      case 'playlist': return <PlaylistPage ctx={ctx} playlist={route.playlist} />;
    }
  };

  return <>
    <Shell background={track?.art}
      footer={track && <MiniPlayer track={track} controls={controls} onOpen={() => openNow()} />}>
      {stack.map((entry, i) => {
        const top = i === stack.length - 1;
        const ctx: PageContext = {
          player, open, back, openNow: () => openNow(), inputEnabled: top && !nowOpen && !locked, prefs,
          savedAlbums, toggleSaved: id => setSaved(s => toggleIn(s, id)),
          followed, toggleFollow: id => setFollowed(s => toggleIn(s, id)),
          pins, togglePin: pin => setPins(list => list.some(p => p.kind === pin.kind && p.id === pin.id)
            ? list.filter(p => !(p.kind === pin.kind && p.id === pin.id)) : [pin, ...list]),
          deviceId, selectDevice: setDeviceId, signOut, spotifyAccount: inTauri ? auth.account : undefined,
          library: inTauri ? { liked: realLiked, history: realHistory, playlists: realPlaylists, error: libraryError } : undefined,
          playContext: inTauri ? real.playContext : undefined,
          spotify: inTauri && accountId ? { userId: accountId, albums: realAlbums, artists: realArtists, pins: realPins, togglePin: toggleRealPin } : undefined,
          remote: inTauri ? { status: real.status, error: real.error } : undefined,
          dataState, retry: () => setDataState('normal'), longTitles,
        };
        return <Route key={entry.key} visible={top}>{page(entry.route, ctx)}</Route>;
      })}
    </Shell>
    {nowOpen && track && <PhoneNowPlaying track={track} controls={controls} queueOpen={queueOpen} onQueue={setQueueOpen}
      queue={player.queue.slice(player.index + 1, player.index + 21).map(song => ({ title: song.title, artist: song.artist, art: song.album.art }))}
      onClose={() => setNowOpen(false)} onPick={player.jumpTo}
      onDevices={() => { setNowOpen(false); open({ kind: 'devices' }); }}
      onArtist={() => {
        setNowOpen(false);
        // inside the Android app: the real artist (the playing song knows its first artist's id)
        const playing = player.current;
        if (inTauri && playing?.album.artist.id) { open({ kind: 'sp-artist', id: playing.album.artist.id, name: playing.album.artist.name }); return; }
        const artist = artistByName(track.artist);
        if (artist) open({ kind: 'artist', artist });
      }} />}
    {inTauri && real.error && !locked && <div className="zp-toast" role="status" onClick={real.clearError}>{real.error}</div>}
    {locked && track && <LockScreen track={track} covers={mosaicCovers} controls={controls} onUnlock={() => { setLocked(false); window.ZpLock?.unlock(); }} />}
    {bars}
  </>;
}
