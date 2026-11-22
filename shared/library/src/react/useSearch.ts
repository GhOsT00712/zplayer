import { useCallback, useEffect, useState } from 'react';
import type { Song } from '../core/model';
import { useInfiniteList, type InfiniteList } from './useInfiniteList';
import { useLibraryContext } from './LibraryProvider';

export const SEARCH_DEBOUNCE_MS = 450;

/** Spotify song search, 10 per request, next page on scroll. Typing waits 450 ms before searching. */
export function useSearch(query: string): InfiniteList<Song> & { searching: boolean } {
  const { library } = useLibraryContext();
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (offset: number) => (library ? library.search(settled, offset) : { items: [], next: null }),
    [library, settled],
  );
  const list = useInfiniteList(load, [library, settled], undefined, !!library && settled.length > 0);
  return { ...list, searching: query.trim() !== settled };
}
