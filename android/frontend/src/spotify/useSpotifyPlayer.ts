import { useEffect, useMemo, useRef, useState } from 'react';
import { coverArt, type MockSong } from '../shared/data';
import type { Player, Repeat } from '../shared/usePlayer';
import { imageUrl, queue as fetchQueue, type SpotifySong } from './library';
import { spotify } from './spotify';

/** What SpotifyRemote.kt sends (window.zpRemoteEvent). */
interface RemoteTrack { uri: string; name: string; artist: string; artists: string; album: string; albumUri: string; durationMs: number; image: string; isEpisode: boolean }
interface RemoteState { paused: boolean; positionMs: number; at: number; shuffle: boolean; repeat: number; canSeek: boolean; track?: RemoteTrack }
type RemoteEvent =
  | ({ type: 'state' } & RemoteState)
  | { type: 'connected' }
  | { type: 'authorizing' }
  | { type: 'disconnected' | 'error'; code: string; message: string; call?: string }
  | { type: 'library'; uri: string; added: boolean; canAdd: boolean };

declare global {
  interface Window {
    /** Set by MainActivity.kt / SpotifyRemote.kt: the Spotify app's player. */
    ZpRemote?: {
      installed(): boolean; connect(clientId: string): void; disconnect(): void; refreshState(): void;
      play(uri: string): void; playAt(contextUri: string, index: number): void;
      playTracks(tracksJson: string, fromQueue: boolean, source: string): void;
      pause(): void; resume(): void; next(): void; previous(): void; seek(positionMs: number): void;
      setShuffle(on: boolean): void; setRepeat(mode: number): void;
      like(uri: string, on: boolean): void; libraryState(uri: string): void;
    };
    zpRemoteEvent?: (event: RemoteEvent) => void;
  }
}

export type RemoteStatus = 'off' | 'connecting' | 'connected' | 'failed';

/** Plain-language versions of App Remote's errors. */
export function remoteMessage(code: string, message: string) {
  switch (code) {
    case 'CouldNotFindSpotifyApp': return 'The Spotify app isn\'t on this phone. Install it and sign in.';
    case 'NotLoggedInException': return 'Sign in to the Spotify app first, then come back.';
    case 'UserNotAuthorizedException': return 'ZPLAYER isn\'t allowed to control the Spotify app yet. Play a song to be asked again.';
    case 'AuthorizationCancelled': return 'You didn\'t allow ZPLAYER in Spotify. Play a song to be asked again.';
    case 'AuthorizationFailed': return message === 'INVALID_APP_ID' || /package|fingerprint|sha/i.test(message)
      ? 'Spotify doesn\'t recognise this app. Check the Android package io.zplayer.android and its SHA-1 in the Spotify dashboard.'
      : `Spotify couldn't allow ZPLAYER (${message || 'unknown error'}).`;
    case 'OfflineModeException': return 'The Spotify app is in offline mode.';
    case 'NotConnected': return 'Not connected to the Spotify app yet.';
    default: return message || 'The Spotify app didn\'t respond.';
  }
}

// Spotify's repeat modes: 0 off, 1 one song, 2 all. ZPLAYER cycles off → all → one.
const toRepeat = (mode: number): Repeat => mode === 1 ? 'one' : mode === 2 ? 'all' : 'off';
const nextRepeat: Record<Repeat, number> = { off: 2, all: 1, one: 0 };

function songFrom(track: RemoteTrack): MockSong {
  const id = track.uri.startsWith('spotify:track:') ? track.uri.slice(14) : track.uri;
  const art = track.image ? imageUrl(track.image) : coverArt(id.length);
  return {
    id, title: track.name, artist: track.artists || track.artist, number: 0, durationMs: track.durationMs,
    album: { id: track.albumUri, title: track.album, artist: { id: track.artist, name: track.artist, genres: [] }, kind: 'album', year: 0, art, tracks: [] },
  };
}

/**
 * The real player inside the Android app: the Spotify app, through App Remote. Returns the same
 * shape as the fake player (../shared/usePlayer.ts), so every screen works with it unchanged.
 */
export function useSpotifyPlayer(enabled: boolean) {
  const [status, setStatus] = useState<RemoteStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<RemoteState | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [upcoming, setUpcoming] = useState<SpotifySong[]>([]);
  const [now, setNow] = useState(() => Date.now());
  /** A play asked for before the connection was ready: done once connected. */
  const waiting = useRef<(() => void) | null>(null);
  const reconnect = useRef<(() => void) | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const remote = window.ZpRemote;

  // connect once signed in; the first time, the Spotify app asks to allow ZPLAYER
  useEffect(() => {
    if (!enabled || !remote) return;
    window.zpRemoteEvent = event => {
      switch (event.type) {
        case 'connected':
          setStatus('connected'); setError(null); remote.refreshState();
          waiting.current?.(); waiting.current = null;
          break;
        case 'state': setState(event); break;
        case 'authorizing': setStatus('connecting'); break;
        case 'library': setLiked(l => ({ ...l, [event.uri]: event.added })); break;
        default:
          if (event.type === 'disconnected' || event.call === undefined) setStatus('failed');
          setError(remoteMessage(event.code, event.message));
      }
    };
    const connect = () => {
      setStatus('connecting');
      void spotify.clientId().then(id => { if (id) remote.connect(id); else setStatus('failed'); });
    };
    connect();
    reconnect.current = connect;
    // Try again whenever ZPLAYER comes back on screen: the first connection needs the phone
    // unlocked, so the Spotify app can ask to allow ZPLAYER.
    const onVisible = () => { if (document.visibilityState === 'visible' && statusRef.current === 'failed') connect(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.zpRemoteEvent = undefined;
      document.removeEventListener('visibilitychange', onVisible);
      reconnect.current = null;
    };
  }, [enabled, remote]);

  const trackUri = state?.track?.uri;
  // on a new song: is it liked, and what comes after it
  useEffect(() => {
    if (!enabled || !trackUri || !remote) return;
    remote.libraryState(trackUri);
    let active = true;
    const timer = window.setTimeout(() => {
      fetchQueue().then(songs => { if (active) setUpcoming(songs); }, () => { if (active) setUpcoming([]); });
    }, 600);
    return () => { active = false; window.clearTimeout(timer); };
  }, [enabled, trackUri, remote]);

  // the position moves on between player-state events
  const playing = !!state && !state.paused && !!state.track;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [playing]);

  const current = useMemo(() => state?.track && !state.track.isEpisode ? songFrom(state.track) : undefined, [state?.track]);
  const positionMs = state ? Math.min(state.positionMs + (playing ? Math.max(0, now - state.at) : 0), current?.durationMs ?? Infinity) : 0;

  const playList = (list: MockSong[], start: number, fromQueue = false) => {
    const song = list[start] as SpotifySong | undefined;
    if (!song?.uri || !remote) { setError('This song can\'t be played from here.'); return; }
    const play = () => {
      if (song.context && song.contextIndex !== undefined) {
        remote.playAt(song.context, song.contextIndex);
      } else {
        const tracks = (list.slice(start) as SpotifySong[]).map(item => item.uri);
        remote.playTracks(JSON.stringify(tracks), fromQueue, song.context ?? '');
      }
    };
    // Keep the selected song even if the queue changes while reconnecting.
    if (statusRef.current !== 'connected') {
      waiting.current = play;
      if (statusRef.current === 'failed') reconnect.current?.();
      return;
    }
    play();
  };

  const player = {
    current,
    queue: current ? [current, ...upcoming] : upcoming,
    index: 0,
    upNext: upcoming.slice(0, 5),
    playing,
    positionMs,
    shuffle: state?.shuffle ?? false,
    repeat: toRepeat(state?.repeat ?? 0),
    volume: 1,
    liked: trackUri ? liked[trackUri] ?? false : false,
    playList,
    toggle: () => { if (!remote || !state) return; if (state.paused) remote.resume(); else remote.pause(); },
    next: () => remote?.next(),
    previous: () => remote?.previous(),
    seek: (ms: number) => { remote?.seek(ms); if (state) setState({ ...state, positionMs: ms, at: Date.now() }); },
    jumpTo: (offset: number) => playList(upcoming, offset, true),
    toggleShuffle: () => remote?.setShuffle(!(state?.shuffle ?? false)),
    playShuffled: (list: MockSong[]) => { remote?.setShuffle(true); playList(list, Math.floor(Math.random() * list.length)); },
    cycleRepeat: () => remote?.setRepeat(nextRepeat[toRepeat(state?.repeat ?? 0)]),
    setVolume: () => { /* the phone's volume keys */ },
    toggleLike: () => { if (trackUri && remote) { remote.like(trackUri, !(liked[trackUri] ?? false)); window.setTimeout(() => remote.libraryState(trackUri), 400); } },
  } satisfies Player;

  /** Plays an album or playlist by its URI from the start. */
  const playContext = (uri: string) => {
    if (!remote) return;
    if (statusRef.current !== 'connected') { waiting.current = () => remote.play(uri); if (statusRef.current === 'failed') reconnect.current?.(); return; }
    remote.play(uri);
  };

  return { player, playContext, status, error, clearError: () => setError(null) };
}
