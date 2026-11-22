import { useCallback, useEffect, useState } from 'react';
import type { Song } from '../core/model';
import { useLibraryContext } from './LibraryProvider';

/**
 * Heart state for any song row. `isLiked` reflects the local index; `toggle` likes or unlikes in
 * Spotify and the index, and flips the heart at once (put back if Spotify refuses).
 */
export function useLiked() {
  const { library } = useLibraryContext();
  const [liked, setLiked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<unknown>();

  const reload = useCallback(async () => {
    if (library) setLiked(await library.likedIds());
  }, [library]);

  useEffect(() => {
    void reload();
    return library?.subscribe(() => void reload());
  }, [library, reload]);

  const toggle = useCallback(
    async (song: Song) => {
      if (!library) return;
      const wasLiked = liked.has(song.id);
      setLiked((current) => {
        const next = new Set(current);
        if (wasLiked) next.delete(song.id);
        else next.add(song.id);
        return next;
      });
      try {
        setError(undefined);
        await (wasLiked ? library.unlike(song) : library.like(song));
      } catch (failure) {
        setError(failure);
        await reload();
      }
    },
    [library, liked, reload],
  );

  return { isLiked: useCallback((id: string) => liked.has(id), [liked]), toggle, error };
}
