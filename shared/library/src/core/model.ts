/** The data model shared by both apps. Plain data only: no wording shown to users. */

export interface ArtistRef { id: string; name: string }
export interface AlbumRef { id: string; name: string; artwork?: string }

export interface Song {
  id: string;
  uri: string;
  title: string;
  artists: ArtistRef[];
  album: AlbumRef;
  durationMs: number;
  /** Position on the album, used to order an album page. */
  trackNumber?: number;
  discNumber?: number;
}

/** A song as stored in the local index. */
export interface StoredSong extends Song {
  /** When it was liked, in ms since epoch; null when it is only in a playlist. */
  likedAt: number | null;
  /** Playlists (that we could read) that contain it. */
  playlistIds: string[];
  /** Newest-first ordering key: liked time, else the time it was first indexed. */
  sortKey: number;
}

/** A song as listed in the app, with the heart state. */
export interface LibrarySong extends Song { liked: boolean }

/** A song on an album page: the full album, with the user's own songs marked. */
export interface AlbumSong extends LibrarySong { inLibrary: boolean }

export interface Album {
  id: string;
  name: string;
  artwork?: string;
  artists: ArtistRef[];
  /** Number of the user's songs on it. */
  songCount: number;
}

export interface Artist {
  id: string;
  name: string;
  songCount: number;
}

export interface Playlist {
  id: string;
  title: string;
  owner?: string;
  /** Created by the user or collaborative: its songs can be read. */
  readable: boolean;
  snapshotId?: string;
  total: number;
  artwork?: string;
  uri: string;
}

export interface HistoryEntry {
  /** Auto-increment key, higher is newer. */
  seq?: number;
  playedAt: number;
  song: Song;
}

export interface Device {
  id: string | null;
  name: string;
  type: string;
  active: boolean;
  restricted: boolean;
}

export interface Page<T> {
  items: T[];
  /** Offset or cursor for the next page; null at the end. */
  next: number | null;
}

export interface Account { id: string; name: string }

/** Error shape from the Rust side (`Failure`). */
export interface Failure {
  status?: number | null;
  message: string;
  endpoint?: string | null;
  reauthenticate?: boolean;
}

export function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'Unexpected error';
}
