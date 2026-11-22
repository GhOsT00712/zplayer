export interface SpotifyTrack {
  id?: string | null;
  uri?: string;
  name: string;
  type?: string;
  is_local?: boolean;
  is_playable?: boolean;
  duration_ms?: number;
  artists?: { id?: string; uri?: string; name: string }[];
  album?: { id?: string; uri?: string; name: string; images?: { url: string }[] };
}
export interface SdkState {
  paused: boolean;
  position: number;
  duration: number;
  shuffle?: boolean;
  /** 0 off, 1 context, 2 track */
  repeat_mode?: 0 | 1 | 2;
  track_window: { current_track: SpotifyTrack };
}
export interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  getCurrentState(): Promise<SdkState | null>;
  togglePlay(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  /** 0 to 1 */
  setVolume(level: number): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  addListener(event: 'ready' | 'not_ready', fn: (data: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', fn: (data: SdkState | null) => void): boolean;
  addListener(event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error' | 'autoplay_failed', fn: (data?: { message?: string }) => void): boolean;
}
type PlayerConstructor = new(options: {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume: number;
}) => SdkPlayer;

declare global {
  interface Window {
    Spotify?: { Player: PlayerConstructor };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let requested: Promise<PlayerConstructor> | undefined;

export function loadSdk(): Promise<PlayerConstructor> {
  if (window.Spotify?.Player) return Promise.resolve(window.Spotify.Player);
  if (requested) return requested;
  requested = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => fail('The SDK script did not initialize.'), 12_000);
    function fail(message: string) {
      window.clearTimeout(timer);
      delete window.onSpotifyWebPlaybackSDKReady;
      script.remove();
      reject(new Error(message));
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      const Player = window.Spotify?.Player;
      if (!Player) {
        fail('The SDK did not expose a player.');
        return;
      }
      window.clearTimeout(timer);
      delete window.onSpotifyWebPlaybackSDKReady;
      resolve(Player);
    };
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => fail('Could not load sdk.scdn.co.');
    document.head.append(script);
  });
  requested.catch(() => { requested = undefined; });
  return requested;
}
