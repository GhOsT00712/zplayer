import { useCallback } from 'react';
import type { Album, Artist, HistoryEntry, LibrarySong } from '../core/model';
import { useInfiniteList, type InfiniteList } from './useInfiniteList';
import { useLibraryContext } from './LibraryProvider';

export type SectionKind = 'songs' | 'history' | 'albums' | 'artists';
type SectionItem = { songs: LibrarySong; history: HistoryEntry; albums: Album; artists: Artist };

/** One library section as an infinite list that quietly refreshes while a sync adds pages. */
export function useSection<K extends SectionKind>(kind: K): InfiniteList<SectionItem[K]> {
  const { library } = useLibraryContext();
  const load = useCallback(
    async (offset: number) => {
      if (!library) return { items: [], next: null };
      return (await library[kind](offset)) as unknown as { items: SectionItem[K][]; next: number | null };
    },
    [library, kind],
  );
  const reloadOn = useCallback((listener: () => void) => library?.subscribe(listener) ?? (() => {}), [library]);
  return useInfiniteList(load, [library, kind], reloadOn, !!library);
}

export const useSongs = () => useSection('songs');
export const useHistory = () => useSection('history');
export const useAlbums = () => useSection('albums');
export const useArtists = () => useSection('artists');
