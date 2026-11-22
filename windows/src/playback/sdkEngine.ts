import { invoke } from '@tauri-apps/api/core';
import {
  messageOf, setRepeatState, setShuffleState, setVolumeLevel, withBackoff,
  type Account, type Device, type PlaybackEngine, type PlaybackState, type RepeatMode, type Song, type Transport,
} from '@zplayer/library';
import { loadSdk, type SdkPlayer, type SdkState, type SpotifyTrack } from './sdk';

export type PlaybackMode = 'signed out' | 'starting' | 'in-app playback' | 'remote control';
export interface Playback { song?: Song; playing: boolean; positionMs: number }
export interface AppDevice extends Device { inApp: boolean }
export interface EngineSnapshot {
  signedIn: boolean;
  account?: Account;
  mode: PlaybackMode;
  targetName?: string;
  targetId?: string;
  sdkDeviceId?: string;
  sdkReady: boolean;
  playback?: Playback;
  reason?: string;
  log: readonly string[];
}
interface SpotifyDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}
type Start = { uris: string[] } | { context_uri: string; offset?: { uri: string } };

const PLAYER_NAME = 'ZPLAYER';

/** A playable song from the SDK or the player endpoint; episodes and local files give undefined. */
function songOf(track?: SpotifyTrack | null): Song | undefined {
  if (!track || track.type === 'episode' || track.is_local) return;
  const id = track.id || track.uri?.split(':').at(-1);
  if (!id || !track.uri?.startsWith('spotify:track:')) return;
  return {
    id,
    uri: track.uri,
    title: track.name,
    artists: (track.artists ?? []).map(artist => ({ id: artist.id || artist.uri?.split(':').at(-1) || artist.name, name: artist.name })),
    album: {
      id: track.album?.id || track.album?.uri?.split(':').at(-1) || track.album?.name || `unknown:${id}`,
      name: track.album?.name ?? '',
      artwork: track.album?.images?.[0]?.url,
    },
    durationMs: track.duration_ms ?? 0,
  };
}

function statusOf(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status : undefined;
}

/**
 * Sign-in session and playback for Windows: the Web Playback SDK, falling back to Spotify Connect
 * remote control. Library data (songs, albums, search...) lives in @zplayer/library.
 */
export class SdkEngine implements PlaybackEngine {
  readonly capabilities = { volume: true, devices: true, queue: false };
  private snapshot: EngineSnapshot = { signedIn: false, mode: 'signed out', sdkReady: false, log: [] };
  private listeners = new Set<() => void>();
  private session = 0;
  private sdkAttempt = 0;
  private sdk?: SdkPlayer;
  private readyTimer?: number;
  private pollTimer?: number;
  private audioTimer?: number;
  private playbackRevision = 0;
  private sdkIds = new Set<string>();
  private selectedRemote?: string;
  private pollInFlight = false;
  private rateLimitedUntil = 0;
  private shuffle = false;
  private repeat: RepeatMode = 'off';
  private volume = 0.65;
  private cachedState?: { playback?: Playback; key: string; value: PlaybackState };

  /** The library's transport: Tauri's spotify_api, waiting out rate limits, with failures in the log. */
  readonly transport: Transport = withBackoff({ call: (path, method, body) => this.api(path, method, body) });

  constructor() {
    window.addEventListener('securitypolicyviolation', event => {
      let destination = event.blockedURI;
      try { destination = new URL(destination).origin; } catch { /* Keyword or scheme. */ }
      this.log(`Content policy · ${event.effectiveDirective} · ${destination}`);
    });
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<EngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private log(message: string) {
    const prefix = new Date().toLocaleTimeString();
    this.update({ log: [...this.snapshot.log.slice(-79), `${prefix}  ${message}`] });
  }

  private logFailure(error: unknown, fallbackEndpoint: string) {
    const endpoint = error && typeof error === 'object' && 'endpoint' in error && error.endpoint
      ? String(error.endpoint) : fallbackEndpoint;
    this.log(`${endpoint} · ${statusOf(error) ?? 'local error'} · ${messageOf(error)}`);
    if (this.snapshot.signedIn && error && typeof error === 'object' &&
      'reauthenticate' in error && error.reauthenticate === true) {
      this.endSession(messageOf(error));
    }
  }

  private async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (Date.now() < this.rateLimitedUntil) throw new Error('Spotify rate limit reached. Try again shortly.');
    try {
      return await invoke<T>('spotify_api', { path, method, body: body ?? null });
    } catch (error) {
      if (statusOf(error) === 429) {
        const seconds = /retry after (\d+)s/.exec(messageOf(error))?.[1];
        this.rateLimitedUntil = Date.now() + 1000 * (seconds ? Math.max(1, Number(seconds)) : 30);
      }
      this.logFailure(error, `${method} ${path.split('?')[0]}`);
      throw error;
    }
  }

  openSource(url: string): Promise<void> {
    return invoke('spotify_open_source', { url });
  }

  settings(): Promise<{ clientId: string; redirectUri: string }> {
    return invoke('auth_settings');
  }

  scopes(): Promise<string[]> {
    return invoke('auth_scopes');
  }

  async restore() {
    try {
      const signedIn = await invoke<boolean>('auth_restore');
      if (signedIn) this.startSession();
      return signedIn;
    } catch (error) {
      this.logFailure(error, 'restore sign-in');
      throw error;
    }
  }

  async signIn(clientId: string) {
    try {
      await invoke('auth_login', { clientId });
      this.startSession();
    } catch (error) {
      this.logFailure(error, 'browser sign-in');
      throw error;
    }
  }

  async signOut() {
    await invoke('auth_logout');
    this.endSession();
  }

  private endSession(reason?: string) {
    this.session++;
    this.stopSdk();
    window.clearInterval(this.pollTimer);
    this.selectedRemote = undefined;
    this.update({
      mode: 'signed out', signedIn: false, sdkReady: false, reason,
      account: undefined, targetName: undefined, targetId: undefined,
      sdkDeviceId: undefined, playback: undefined, log: reason ? this.snapshot.log : [],
    });
  }

  private startSession() {
    const session = ++this.session;
    this.stopSdk();
    window.clearInterval(this.pollTimer);
    this.update({ signedIn: true, mode: 'starting', sdkReady: false, reason: undefined });
    void this.api<{ id?: string; account_id?: string; display_name?: string }>('/me').then(account => {
      if (session !== this.session) return;
      const id = account.account_id || account.id || 'Unknown account';
      this.update({ account: { id, name: account.display_name || id } });
    }).catch(() => { /* API failure is already logged. */ });
    this.pollTimer = window.setInterval(() => void this.poll(), 4_000);
    void this.trySdk();
  }

  private async trySdk() {
    const attempt = ++this.sdkAttempt;
    const current = () => this.sdkAttempt === attempt && this.snapshot.signedIn;
    const fail = (reason: string) => { if (current()) this.fallBack(reason); };
    this.log('SDK initialization started');
    this.readyTimer = window.setTimeout(() => fail('SDK ready timed out after 12 seconds.'), 12_000);

    try {
      const Player = await loadSdk();
      if (!current()) return;
      const player = new Player({
        name: PLAYER_NAME,
        volume: 0.65,
        getOAuthToken: callback => {
          void invoke<string>('spotify_sdk_token').then(token => {
            if (current()) callback(token);
          }).catch(error => {
            if (current()) this.logFailure(error, 'SDK access token');
            fail('Could not get an access token for the SDK.');
          });
        },
      });
      this.sdk = player;
      player.addListener('ready', ({ device_id }) => {
        this.sdkIds.add(device_id);
        if (!current()) return;
        window.clearTimeout(this.readyTimer);
        this.update({ mode: 'in-app playback', sdkReady: true, sdkDeviceId: device_id, targetId: device_id, targetName: PLAYER_NAME });
        this.log(`SDK ready · ${device_id}`);
      });
      player.addListener('not_ready', ({ device_id }) => {
        if (current()) this.log(`SDK not_ready · ${device_id}`);
        fail('The in-app device went offline.');
      });
      player.addListener('player_state_changed', state => {
        if (current() && this.snapshot.mode === 'in-app playback') this.applySdkState(state, true);
      });
      const errors = ['initialization_error', 'account_error', 'authentication_error', 'playback_error', 'autoplay_failed'] as const;
      for (const event of errors) {
        player.addListener(event, error => {
          if (!current()) return;
          const reason = `${event}${error?.message ? ` · ${error.message}` : ''}`;
          this.log(`SDK ${reason}`);
          fail(reason);
        });
      }
      const connected = await player.connect();
      if (current()) this.log(`SDK connect() returned ${connected}`);
      if (!connected) fail('SDK connect() returned false.');
    } catch (error) {
      fail(messageOf(error));
    }
  }

  private stopSdk() {
    this.sdkAttempt++;
    window.clearTimeout(this.readyTimer);
    window.clearTimeout(this.audioTimer);
    const player = this.sdk;
    this.sdk = undefined;
    try { player?.disconnect(); } catch (error) { this.log(`SDK disconnect · ${messageOf(error)}`); }
  }

  private fallBack(reason: string) {
    this.stopSdk();
    this.playbackRevision++;
    this.update({ mode: 'remote control', reason, playback: undefined, targetId: undefined, targetName: undefined });
    this.log(`Remote control · ${reason}`);
    void this.poll();
    const session = this.session;
    void this.remoteTarget().then(device => {
      if (this.session === session && this.snapshot.mode === 'remote control' && !this.selectedRemote) {
        this.update({ targetId: device.id!, targetName: device.name });
      }
    }).catch(() => { /* The Devices screen and playback actions can retry discovery. */ });
  }

  async devices(): Promise<AppDevice[]> {
    const result = await this.api<{ devices: SpotifyDevice[] }>('/me/player/devices');
    return result.devices.map((device): AppDevice => ({
      id: device.id, name: device.name, type: device.type, active: device.is_active,
      inApp: !!device.id && this.sdkIds.has(device.id),
      restricted: device.is_restricted,
    }));
  }

  async selectDevice(id: string) {
    // Activate synchronously while the device selection still has a user gesture.
    if (id === this.snapshot.sdkDeviceId && this.sdk) {
      await this.sdk.activateElement();
      await this.api('/me/player', 'PUT', { device_ids: [id], play: false });
      return;
    }
    const devices = await this.devices();
    const device = devices.find(candidate => candidate.id === id && !candidate.restricted && !candidate.inApp);
    if (!device) throw new Error('That playback device is no longer available.');
    await this.api('/me/player', 'PUT', { device_ids: [id], play: false });
    this.selectedRemote = id;
    this.fallBack(`Selected ${device.name} in Devices.`);
    this.update({ targetId: id, targetName: device.name });
    this.schedulePoll();
  }

  private async remoteTarget(): Promise<AppDevice> {
    const devices = (await this.devices()).filter(device => device.id && !device.inApp && !device.restricted);
    const target = devices.find(device => device.id === this.selectedRemote) ?? devices.find(device => device.active) ?? devices[0];
    if (!target) throw new Error('Open Spotify on a phone or computer on this account, then select it in Devices.');
    if (this.selectedRemote && this.selectedRemote !== target.id) this.selectedRemote = undefined;
    return target;
  }

  async playSongs(uris: string[], index: number) {
    // Spotify documents offset for album and playlist contexts only, so queue from the tapped song.
    const queue = uris.slice(index, index + 50);
    if (!queue.length) throw new Error('This song cannot be played through Spotify Connect.');
    await this.play({ uris: queue });
  }

  playContext(contextUri: string, offsetUri?: string) {
    return this.play({ context_uri: contextUri, ...(offsetUri ? { offset: { uri: offsetUri } } : {}) });
  }

  toggle() { return this.control('toggle'); }
  next() { return this.control('next'); }
  previous() { return this.control('previous'); }

  /** Shuffle, repeat and volume go to whichever device is playing, over Spotify Connect. */
  async setShuffle(on: boolean) {
    await setShuffleState(this.transport, on, this.snapshot.targetId);
    this.shuffle = on;
    this.update({});
  }

  async setRepeat(mode: RepeatMode) {
    await setRepeatState(this.transport, mode, this.snapshot.targetId);
    this.repeat = mode;
    this.update({});
  }

  async setVolume(level: number) {
    if (this.snapshot.mode === 'in-app playback' && this.sdk) await this.sdk.setVolume(level);
    else await setVolumeLevel(this.transport, level * 100, this.snapshot.targetId);
    this.volume = level;
    this.update({});
  }

  getState(): PlaybackState {
    const playback = this.snapshot.playback;
    const key = `${this.shuffle}|${this.repeat}|${this.volume}`;
    const cached = this.cachedState;
    if (cached && cached.playback === playback && cached.key === key) return cached.value;
    const value: PlaybackState = {
      song: playback?.song, playing: !!playback?.playing, positionMs: playback?.positionMs ?? 0,
      shuffle: this.shuffle, repeat: this.repeat, volume: this.volume,
    };
    this.cachedState = { playback, key, value };
    return value;
  }

  private async play(body: Start) {
    const revision = ++this.playbackRevision;
    const player = this.sdk;
    const sdkId = this.snapshot.mode === 'in-app playback' ? this.snapshot.sdkDeviceId : undefined;
    if (player && sdkId) {
      await player.activateElement().catch(error => {
        this.log(`SDK activation · ${messageOf(error)}`);
        if (this.sdk === player) this.fallBack('The webview could not activate SDK audio.');
      });
      if (this.sdk === player) {
        try {
          await this.playerRequest('play', 'PUT', sdkId, body);
          if (this.sdk === player && revision === this.playbackRevision) this.watchAudio(player, revision);
          return;
        } catch (error) {
          if (statusOf(error) !== 404 || this.sdk !== player) throw error;
          this.fallBack('Spotify could not target the registered SDK device.');
        }
      }
    }
    if (this.snapshot.mode !== 'remote control') throw new Error('Playback is still starting. Try again when the mode is ready.');
    const device = await this.remoteTarget();
    await this.playerRequest('play', 'PUT', device.id!, body);
    this.update({ targetId: device.id!, targetName: device.name });
    this.schedulePoll();
  }

  private watchAudio(player: SdkPlayer, revision: number) {
    window.clearTimeout(this.audioTimer);
    let early: SdkState | null = null;
    const current = () => this.sdk === player && this.playbackRevision === revision;
    this.audioTimer = window.setTimeout(() => {
      void player.getCurrentState().then(state => { early = state; }).catch(() => {});
      this.audioTimer = window.setTimeout(async () => {
        const state = await player.getCurrentState().catch(() => null);
        if (!current()) return;
        const sameTrack = early?.track_window.current_track.uri === state?.track_window.current_track.uri;
        const baseline = early && sameTrack ? early.position : 0;
        if (!state || state.paused || state.position - baseline < 750) {
          this.fallBack('SDK registered, but playback did not report advancing audio within 10 seconds. Select a track again for remote playback.');
        } else {
          this.log(`SDK reports track at ${Math.round(state.position / 1000)}s after play`);
        }
      }, 7_000);
    }, 3_000);
  }

  private playerRequest(action: string, method: string, deviceId: string, body?: Start) {
    return this.api<null>(`/me/player/${action}?device_id=${encodeURIComponent(deviceId)}`, method, body);
  }

  async control(action: 'previous' | 'toggle' | 'next') {
    this.playbackRevision++;
    window.clearTimeout(this.audioTimer);
    if (this.snapshot.mode === 'in-app playback' && this.sdk) {
      const player = this.sdk;
      try {
        await player.activateElement();
        if (action === 'previous') await player.previousTrack();
        else if (action === 'next') await player.nextTrack();
        else await player.togglePlay();
      } catch (error) {
        this.log(`SDK ${action} · ${messageOf(error)}`);
        throw error;
      }
      return;
    }
    if (this.snapshot.mode !== 'remote control') return;
    const device = await this.remoteTarget();
    const state = action === 'toggle' && device.active
      ? await this.api<{ device: SpotifyDevice; is_playing: boolean } | null>('/me/player')
      : null;
    const command = action === 'toggle'
      ? state?.device.id === device.id && state?.is_playing ? 'pause' : 'play'
      : action;
    await this.playerRequest(command, action === 'toggle' ? 'PUT' : 'POST', device.id!);
    this.update({ targetId: device.id!, targetName: device.name });
    this.schedulePoll();
  }

  async seek(positionMs: number) {
    const ms = Math.max(0, Math.round(positionMs));
    const playback = this.snapshot.playback;
    if (this.snapshot.mode === 'in-app playback' && this.sdk) {
      try {
        await this.sdk.seek(ms);
      } catch (error) {
        this.log(`SDK seek · ${messageOf(error)}`);
        throw error;
      }
    } else if (this.snapshot.mode === 'remote control') {
      const device = await this.remoteTarget();
      await this.api<null>(`/me/player/seek?position_ms=${ms}&device_id=${encodeURIComponent(device.id!)}`, 'PUT');
      this.schedulePoll();
    } else {
      return;
    }
    // Show the new position straight away; the next SDK event or poll confirms it.
    if (playback) this.update({ playback: { ...playback, positionMs: ms } });
  }

  private schedulePoll() {
    window.setTimeout(() => void this.poll(), 650);
  }

  private applySdkState(state: SdkState | null, event: boolean) {
    const track = songOf(state?.track_window.current_track);
    const previous = this.snapshot.playback;
    if (state?.shuffle !== undefined) this.shuffle = state.shuffle;
    if (state?.repeat_mode !== undefined) this.repeat = (['off', 'all', 'one'] as const)[state.repeat_mode] ?? 'off';
    if (event && (track?.id !== previous?.song?.id || (state && !state.paused) !== previous?.playing)) {
      this.log(state ? `SDK player_state_changed · ${state.paused ? 'paused' : 'playing'} · ${track?.title ?? 'unknown track'}` : 'SDK player_state_changed · no state');
    }
    const song = track && state && !track.durationMs ? { ...track, durationMs: state.duration } : track;
    this.update({ playback: state ? { song, playing: !state.paused, positionMs: state.position } : undefined });
  }

  private async poll() {
    const { mode } = this.snapshot;
    if (this.pollInFlight || (mode !== 'in-app playback' && mode !== 'remote control')) return;
    const revision = this.playbackRevision;
    const session = this.session;
    const current = () => this.snapshot.mode === mode && this.session === session && this.playbackRevision === revision;
    this.pollInFlight = true;
    try {
      if (mode === 'in-app playback' && this.sdk) {
        const state = await this.sdk.getCurrentState();
        if (current()) this.applySdkState(state, false);
        return;
      }
      const state = await this.api<{
        device: SpotifyDevice & { volume_percent?: number | null }; item?: SpotifyTrack; is_playing: boolean; progress_ms?: number;
        shuffle_state?: boolean; repeat_state?: 'off' | 'track' | 'context';
      } | null>('/me/player');
      if (!current()) return;
      if (state?.device.id && !state.device.is_restricted && !this.sdkIds.has(state.device.id) &&
        (!this.selectedRemote || state.device.id === this.selectedRemote)) {
        if (state.shuffle_state !== undefined) this.shuffle = state.shuffle_state;
        if (state.repeat_state) this.repeat = state.repeat_state === 'track' ? 'one' : state.repeat_state === 'context' ? 'all' : 'off';
        if (state.device.volume_percent != null) this.volume = state.device.volume_percent / 100;
        this.update({
          targetId: state.device.id, targetName: state.device.name,
          playback: { song: songOf(state.item), playing: state.is_playing, positionMs: state.progress_ms ?? 0 },
        });
      } else {
        this.update({ playback: undefined });
      }
    } catch (error) {
      if (mode === 'in-app playback') this.log(`SDK getCurrentState · ${messageOf(error)}`);
    } finally {
      this.pollInFlight = false;
    }
  }
}
