import type { Page, Song } from '../model';
import type { Transport } from '../transport';
import { isSong, mapSong, nextOffset, type RawPage, type RawTrack } from './mappers';

/** Development Mode allows 10 results per search request. */
export const SEARCH_PAGE = 10;

export async function searchSongs(transport: Transport, query: string, offset = 0): Promise<Page<Song>> {
  const text = query.trim();
  if (!text) return { items: [], next: null };
  const result = await transport.call<{ tracks: RawPage<RawTrack | null> }>(
    `/search?type=track&limit=${SEARCH_PAGE}&offset=${offset}&q=${encodeURIComponent(text)}`,
  );
  const page = result.tracks;
  return {
    items: page.items.filter(isSong).map((track) => mapSong(track)),
    next: nextOffset(page, offset),
  };
}
