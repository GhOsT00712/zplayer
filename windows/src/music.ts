export interface Artist { id: string; name: string }
export interface Album { id: string; name: string; artwork?: string }
export interface Track {
  id: string;
  title: string;
  artists: Artist[];
  album?: Album;
  durationMs: number;
  playable: boolean;
  sourceUrl?: string;
}
export interface Playlist {
  id: string;
  title: string;
  owner?: string;
  sourceUrl?: string;
  artwork?: string;
}
export interface Device {
  id: string | null;
  name: string;
  type: string;
  active: boolean;
  inApp: boolean;
  restricted: boolean;
}
export interface Page<T> {
  items: T[];
  nextOffset: number | null;
}
export type TrackShelf = 'liked songs' | 'recently played' | 'top tracks';
export type PlaybackMode = 'signed out' | 'starting' | 'in-app playback' | 'remote control';
export interface Playback {
  track?: Track;
  playing: boolean;
  positionMs: number;
}
export interface Account { id: string; name: string }
export interface ProviderSnapshot {
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
export interface MusicProvider {
  name: string;
  attributionImage?: string;
  openSource(url: string): Promise<void>;
  capabilities: {
    inAppPlayback: boolean;
    remoteControl: boolean;
    search: boolean;
    library: boolean;
  };
  settings(): Promise<{ clientId: string; redirectUri: string }>;
  restore(): Promise<boolean>;
  signIn(clientId: string): Promise<void>;
  signOut(): Promise<void>;
  getSnapshot(): ProviderSnapshot;
  subscribe(listener: () => void): () => void;
  playlists(offset?: number): Promise<Page<Playlist>>;
  playlistTracks(id: string, offset?: number): Promise<Page<Track>>;
  tracks(shelf: TrackShelf, offset?: number): Promise<Page<Track>>;
  search(query: string, offset?: number): Promise<Page<Track>>;
  devices(): Promise<Device[]>;
  selectDevice(id: string): Promise<void>;
  playTracks(tracks: Track[], index: number): Promise<void>;
  playPlaylist(id: string): Promise<void>;
  control(action: 'previous' | 'toggle' | 'next'): Promise<void>;
  /** Jump to a position in the current track, in milliseconds. */
  seek(positionMs: number): Promise<void>;
}

export function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Unexpected error';
}
