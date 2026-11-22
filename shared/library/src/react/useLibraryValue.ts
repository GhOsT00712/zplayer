import { useCallback, useEffect, useState } from 'react';
import type { Playlist } from '../core/model';
import type { Library } from '../core/library';
import type { AlbumPage, ArtistPage } from '../core/library/queries';
import { useLibraryContext } from './LibraryProvider';

export interface Value<T> { data?: T; loading: boolean; error?: unknown; retry: () => void }

/** Loads one value from the library; `quiet` reloads (sync progress, likes) keep the current data. */
export function useLibraryValue<T>(read: (library: Library) => Promise<T>, deps: readonly unknown[], watch = false): Value<T> {
  const { library } = useLibraryContext();
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: unknown }>({ loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!library) return;
    let live = true;
    const load = (quiet: boolean) => {
      if (!quiet) setState((s) => ({ data: undefined, loading: true, error: undefined, ...(s.error ? {} : {}) }));
      read(library).then(
        (data) => live && setState({ data, loading: false }),
        (error) => live && setState({ loading: false, error }),
      );
    };
    load(false);
    const stop = watch ? library.subscribe(() => load(true)) : undefined;
    return () => {
      live = false;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, attempt, watch, ...deps]);

  return { ...state, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

/** Your playlists, updating as syncs add them. */
export const usePlaylists = (): Value<Playlist[]> => useLibraryValue((library) => library.playlists(), [], true);

/** The full album page (fetched once from Spotify, then kept locally). */
export const useAlbum = (id: string): Value<AlbumPage> => useLibraryValue((library) => library.album(id), [id], true);

/** Your songs by one artist, grouped by album. */
export const useArtist = (id: string): Value<ArtistPage | undefined> => useLibraryValue((library) => library.artist(id), [id], true);
