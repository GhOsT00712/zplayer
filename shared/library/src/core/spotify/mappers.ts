import type { Playlist, Song } from '../model';

/* Loose shapes of what Spotify returns. Only the fields we read. */
export interface RawImage { url: string; width?: number | null }
export interface RawArtist { id?: string | null; name: string }
export interface RawAlbum { id?: string | null; name: string; images?: RawImage[]; artists?: RawArtist[] }
export interface RawTrack {
  id?: string | null;
  uri?: string;
  name: string;
  type?: string;
  is_local?: boolean;
  duration_ms: number;
  track_number?: number;
  disc_number?: number;
  artists?: RawArtist[];
  album?: RawAlbum;
}
export interface RawPlaylist {
  id: string;
  uri?: string;
  name: string;
  owner?: { id: string; display_name?: string | null };
  collaborative?: boolean;
  snapshot_id?: string;
  // Spotify renamed `tracks` to `items`; accept either.
  items?: { total?: number };
  tracks?: { total?: number };
  images?: RawImage[] | null;
}
export interface RawPage<T> { items: T[]; total?: number; next?: string | null; offset?: number }

/** The medium-size image when there is one: good for rows and tiles. */
export function pickImage(images: RawImage[] | null | undefined): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return (sorted.find((image) => (image.width ?? 0) <= 400) ?? sorted[sorted.length - 1])?.url;
}

/** A real song: not an episode, not a local file, and with an id. */
export function isSong(track: RawTrack | null | undefined): track is RawTrack & { id: string } {
  return !!track && !!track.id && !track.is_local && (track.type === undefined || track.type === 'track');
}

export function mapSong(track: RawTrack & { id: string }, fallbackAlbum?: RawAlbum): Song {
  const album = track.album ?? fallbackAlbum;
  return {
    id: track.id,
    uri: track.uri ?? `spotify:track:${track.id}`,
    title: track.name,
    artists: (track.artists ?? [])
      .filter((artist): artist is RawArtist & { id: string } => !!artist.id)
      .map((artist) => ({ id: artist.id, name: artist.name })),
    album: {
      id: album?.id ?? `unknown:${track.id}`,
      name: album?.name ?? 'Unknown album',
      artwork: pickImage(album?.images),
    },
    durationMs: track.duration_ms,
    trackNumber: track.track_number,
    discNumber: track.disc_number,
  };
}

export function mapPlaylist(raw: RawPlaylist, accountId: string): Playlist {
  return {
    id: raw.id,
    uri: raw.uri ?? `spotify:playlist:${raw.id}`,
    title: raw.name,
    owner: raw.owner?.display_name ?? raw.owner?.id,
    readable: raw.owner?.id === accountId || raw.collaborative === true,
    snapshotId: raw.snapshot_id,
    total: raw.items?.total ?? raw.tracks?.total ?? 0,
    artwork: pickImage(raw.images),
  };
}

/** Offset of the next page from a Spotify page, or null at the end. */
export function nextOffset(page: RawPage<unknown>, requestedOffset: number): number | null {
  return page.next ? requestedOffset + page.items.length : null;
}
