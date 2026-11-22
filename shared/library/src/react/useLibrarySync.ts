import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from '../core/model';
import { shouldSyncOnForeground } from '../core/sync/syncLibrary';
import { useLibraryContext } from './LibraryProvider';

/**
 * Syncs when signed in, at app start, when the app returns to the foreground (at most every 10
 * minutes) and on `refresh` (the settings button). Sections fill in as pages arrive.
 */
export function useLibrarySync(signedIn: boolean) {
  const { library } = useLibraryContext();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string>();
  const lastRef = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!library) return;
    setSyncing(true);
    setError(undefined);
    try {
      await library.sync();
      await library.mergeRecentPlays();
      lastRef.current = Date.now();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setSyncing(false);
    }
  }, [library]);

  useEffect(() => {
    if (signedIn && library) void refresh();
  }, [signedIn, library, refresh]);

  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && shouldSyncOnForeground(lastRef.current)) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [signedIn, refresh]);

  return { syncing, error, refresh };
}
