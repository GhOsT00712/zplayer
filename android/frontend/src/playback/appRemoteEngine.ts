// Playback through the Spotify app on this phone, using Spotify's Android SDK (App Remote).
// SpotifyRemote.kt (see ../../../app/src-tauri/gen/android/...) exposes window.ZpRemote and calls
// window.zpRemoteEvent; this wraps both as a PlaybackEngine. Likes do not go through here: they use
// the Web API (core like.ts), the same path as Windows.
import { mapSong, type PlaybackEngine, type PlaybackState, type RepeatMode, type Song, type Transport } from '@zplayer/library';

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
export interface RemoteSnapshot { status: RemoteStatus; error: string | null; upcoming: Song[] }

/** Plain-language versions of App Remote's errors. */
export function remoteMessage(code: string, message: string) {
  switch (code) {
    case 'CouldNotFindSpotifyApp': return "The Spotify app isn't on this phone. Install it and sign in.";
    case 'NotLoggedInException': return 'Sign in to the Spotify app first, then come back.';
    case 'UserNotAuthorizedException': return "ZPLAYER isn't allowed to control the Spotify app yet. Play a song to be asked again.";
    case 'AuthorizationCancelled': return "You didn't allow ZPLAYER in Spotify. Play a song to be asked again.";
    case 'AuthorizationFailed': return message === 'INVALID_APP_ID' || /package|fingerprint|sha/i.test(message)
      ? "Spotify doesn't recognise this app. Check the Android package io.zplayer.android and its SHA-1 in the Spotify dashboard."
      : `Spotify couldn't allow ZPLAYER (${message || 'unknown error'}).`;
    case 'OfflineModeException': return 'The Spotify app is in offline mode.';
    case 'NotConnected': return 'Not connected to the Spotify app yet.';
    default: return message || "The Spotify app didn't respond.";
  }
}

// Spotify's repeat modes: 0 off, 1 one song, 2 all. ZPLAYER cycles off, all, one.
const toRepeat = (mode: number): RepeatMode => mode === 1 ? 'one' : mode === 2 ? 'all' : 'off';
const fromRepeat: Record<RepeatMode, number> = { off: 0, all: 2, one: 1 };

/** Spotify's app reports art as spotify:image:<id>; the web address of the same image. */
const imageUrl = (raw: string) => raw.startsWith('spotify:image:') ? `https://i.scdn.co/image/${raw.slice(14)}` : raw;

/** A first version of the song from App Remote: no artist ids yet; `enrich` fills them in. */
function songFrom(track: RemoteTrack): Song {
  const id = track.uri.startsWith('spotify:track:') ? track.uri.slice(14) : track.uri;
  const names = (track.artists || track.artist).split(',').map(name => name.trim()).filter(Boolean);
  return {
    id, uri: track.uri, title: track.name, durationMs: track.durationMs,
    artists: names.map(name => ({ id: `name:${name}`, name })),
    album: { id: track.albumUri.startsWith('spotify:album:') ? track.albumUri.slice(14) : track.albumUri, name: track.album, artwork: track.image ? imageUrl(track.image) : undefined },
  };
}

export class AppRemoteEngine implements PlaybackEngine {
  readonly capabilities = { volume: false, devices: true, queue: true }; // the phone's volume keys do volume
  private snap: RemoteSnapshot = { status: 'off', error: null, upcoming: [] };
  private state: RemoteState | null = null;
  private enriched = new Map<string, Song>();
  private listeners = new Set<() => void>();
  private cached?: { state: RemoteState | null; enriched: Song | undefined; value: PlaybackState };
  /** A play asked for before the connection was ready: done once connected. */
  private waiting: (() => void) | null = null;
  private enabled = false;
  private timer = 0;
  private lastTrack?: string;

  constructor(private transport: Transport, private clientId: () => Promise<string | null>, private remote = window.ZpRemote) {}

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  readonly getSnapshot = () => this.snap;

  private emit() { this.listeners.forEach(listener => listener()); }
  private set(patch: Partial<RemoteSnapshot>) { this.snap = { ...this.snap, ...patch }; this.emit(); }
  clearError = () => this.set({ error: null });

  /** Connect once signed in; the first time, the Spotify app asks to allow ZPLAYER. */
  start() {
    const remote = this.remote;
    if (!remote || this.enabled) return;
    this.enabled = true;
    window.zpRemoteEvent = event => this.onEvent(event);
    this.connect();
    // Try again whenever ZPLAYER comes back on screen: the first connection needs the phone
    // unlocked, so the Spotify app can ask to allow ZPLAYER.
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop() {
    this.enabled = false;
    window.zpRemoteEvent = undefined;
    document.removeEventListener('visibilitychange', this.onVisible);
    window.clearTimeout(this.timer);
    this.remote?.disconnect();
    this.state = null;
    this.set({ status: 'off', upcoming: [] });
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible' && this.snap.status === 'failed') this.connect();
  };

  private connect() {
    this.set({ status: 'connecting' });
    void this.clientId().then(id => { if (id) this.remote?.connect(id); else this.set({ status: 'failed' }); });
  }

  private onEvent(event: RemoteEvent) {
    switch (event.type) {
      case 'connected':
        this.set({ status: 'connected', error: null });
        this.remote?.refreshState();
        this.waiting?.();
        this.waiting = null;
        break;
      case 'state':
        this.state = event;
        this.onTrack(event.track?.uri);
        this.emit();
        break;
      case 'authorizing': this.set({ status: 'connecting' }); break;
      case 'library': break; // likes use the Web API
      default:
        this.set({
          status: event.type === 'disconnected' || event.call === undefined ? 'failed' : this.snap.status,
          error: remoteMessage(event.code, event.message),
        });
    }
  }

  /** On a new song: look up its artist ids, and what comes after it. */
  private onTrack(uri: string | undefined) {
    if (!uri || uri === this.lastTrack) return;
    this.lastTrack = uri;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.lastTrack !== uri) return;
      const id = uri.startsWith('spotify:track:') ? uri.slice(14) : undefined;
      if (id) {
        void this.transport.call<Parameters<typeof mapSong>[0]>(`/tracks/${encodeURIComponent(id)}`).then(track => {
          if (track?.id && this.lastTrack === uri) { this.enriched.set(uri, mapSong({ ...track, id: track.id })); this.emit(); }
        }, () => {});
      }
      void this.transport.call<{ queue?: (Parameters<typeof mapSong>[0] & { id: string })[] } | null>('/me/player/queue').then(result => {
        if (this.lastTrack !== uri) return;
        this.set({ upcoming: (result?.queue ?? []).filter(t => t.type !== 'episode' && t.id).slice(0, 20).map(t => mapSong(t)) });
      }, () => { if (this.lastTrack === uri) this.set({ upcoming: [] }); });
    }, 600);
  }

  getState(): PlaybackState {
    const state = this.state;
    const uri = state?.track?.uri;
    const enriched = uri ? this.enriched.get(uri) : undefined;
    if (this.cached && this.cached.state === state && this.cached.enriched === enriched) return this.cached.value;
    const track = state?.track;
    const playing = !!state && !state.paused && !!track;
    const value: PlaybackState = {
      song: track && !track.isEpisode ? enriched ?? songFrom(track) : undefined,
      playing,
      // the position moves on between App Remote's player-state events
      positionMs: state ? state.positionMs + (playing ? Math.max(0, Date.now() - state.at) : 0) : 0,
      shuffle: state?.shuffle ?? false,
      repeat: toRepeat(state?.repeat ?? 0),
    };
    this.cached = { state, enriched, value };
    return value;
  }

  /** Runs a command now, or once the connection is ready (reconnecting if it dropped). */
  private whenConnected(task: () => void, quiet = false) {
    if (!this.remote) { if (!quiet) this.set({ error: "This song can't be played from here." }); return; }
    if (this.snap.status === 'connected') return task();
    this.waiting = task;
    if (this.snap.status === 'failed') this.connect();
  }

  async playSongs(uris: string[], index: number) {
    const queue = uris.slice(index);
    if (!queue.length) { this.set({ error: "This song can't be played from here." }); return; }
    this.whenConnected(() => this.remote!.playTracks(JSON.stringify(queue), false, ''));
  }

  /** The songs after the current one (the Spotify app must be the active player). */
  async playUpcoming(offset: number) {
    const queue = this.snap.upcoming.slice(offset).map(song => song.uri);
    if (queue.length) this.whenConnected(() => this.remote!.playTracks(JSON.stringify(queue), true, ''));
  }

  async playContext(contextUri: string, offsetUri?: string, index?: number) {
    this.whenConnected(() => {
      if (offsetUri && index !== undefined) this.remote!.playAt(contextUri, index);
      else this.remote!.play(contextUri);
    });
  }

  async toggle() { const s = this.state; if (!this.remote || !s) return; if (s.paused) this.remote.resume(); else this.remote.pause(); }
  async next() { this.remote?.next(); }
  async previous() { this.remote?.previous(); }
  async seek(ms: number) { this.remote?.seek(ms); if (this.state) { this.state = { ...this.state, positionMs: ms, at: Date.now() }; this.emit(); } }
  async setShuffle(on: boolean) { this.remote?.setShuffle(on); }
  async setRepeat(mode: RepeatMode) { this.remote?.setRepeat(fromRepeat[mode]); }
}
