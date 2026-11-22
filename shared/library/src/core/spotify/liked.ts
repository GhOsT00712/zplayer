import type { Page, Song } from '../model';
import type { Transport } from '../transport';
import { isSong, mapSong, nextOffset, type RawPage, type RawTrack } from './mappers';

export const LIKED_PAGE = 50;

export interface LikedEntry { song: Song; likedAt: number }
export interface LikedPage extends Page<LikedEntry> { total: number }

/** Liked songs, newest first. */
export async function fetchLiked(transport: Transport, offset = 0): Promise<LikedPage> {
  const page = await transport.call<RawPage<{ added_at?: string; track: RawTrack | null }>>(
    `/me/tracks?limit=${LIKED_PAGE}&offset=${offset}`,
  );
  const items: LikedEntry[] = [];
  for (const entry of page.items) {
    if (!isSong(entry.track)) continue;
    items.push({ song: mapSong(entry.track), likedAt: entry.added_at ? Date.parse(entry.added_at) : Date.now() });
  }
  return { items, next: nextOffset(page, offset), total: page.total ?? offset + page.items.length };
}

const idsToUris = (ids: string[]) => ids.map((id) => `spotify:track:${id}`).join(',');

/** Like songs in Spotify: they show in Liked Songs. Needs the user-library-modify scope. */
export function likeInSpotify(transport: Transport, ids: string[]): Promise<void> {
  return transport.call<void>(`/me/library?uris=${encodeURIComponent(idsToUris(ids))}`, 'PUT');
}

export function unlikeInSpotify(transport: Transport, ids: string[]): Promise<void> {
  return transport.call<void>(`/me/library?uris=${encodeURIComponent(idsToUris(ids))}`, 'DELETE');
}
