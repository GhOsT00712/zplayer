import type { Page, Playlist, Song } from '../model';
import type { Transport } from '../transport';
import { isSong, mapPlaylist, mapSong, nextOffset, type RawPage, type RawPlaylist, type RawTrack } from './mappers';

export const PLAYLIST_PAGE = 50;

/** A song in a playlist and when it was added there. */
export interface PlaylistSong { song: Song; addedAt?: number }

export async function fetchPlaylists(transport: Transport, accountId: string, offset = 0): Promise<Page<Playlist>> {
  const page = await transport.call<RawPage<RawPlaylist | null>>(`/me/playlists?limit=${PLAYLIST_PAGE}&offset=${offset}`);
  return {
    items: page.items.filter((raw): raw is RawPlaylist => !!raw).map((raw) => mapPlaylist(raw, accountId)),
    next: nextOffset(page, offset),
  };
}

/** Songs of one playlist. Spotify only allows this for playlists you own or collaborate on. */
export async function fetchPlaylistSongs(transport: Transport, id: string, offset = 0): Promise<Page<PlaylistSong>> {
  const page = await transport.call<RawPage<{ added_at?: string | null; item?: RawTrack | null; track?: RawTrack | null }>>(
    `/playlists/${encodeURIComponent(id)}/items?limit=${PLAYLIST_PAGE}&offset=${offset}`,
  );
  const items: PlaylistSong[] = [];
  for (const entry of page.items) {
    const track = entry.item ?? entry.track; // Spotify renamed `track` to `item`
    if (isSong(track)) items.push({ song: mapSong(track), addedAt: entry.added_at ? Date.parse(entry.added_at) : undefined });
  }
  return { items, next: nextOffset(page, offset) };
}
