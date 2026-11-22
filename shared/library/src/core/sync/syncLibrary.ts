import type { Account } from '../model';
import type { Transport } from '../transport';
import { fetchAccount } from '../spotify/me';
import { clearLibrary, getMeta, setMeta } from '../store/db';
import { rebuildDerived } from '../store/albums';
import { syncLiked } from './syncLiked';
import { syncPlaylists } from './syncPlaylists';

export type SyncState = { running: false; lastSyncedAt?: number; error?: unknown } | { running: true; lastSyncedAt?: number };

export interface SyncDeps {
  transport: Transport;
  db: IDBDatabase;
  /** Called as pages arrive so open sections can refresh. */
  onProgress?: () => void;
}

let inFlight: Promise<void> | null = null;

/**
 * First run and later runs, one at a time (all Development Mode apps share one request quota).
 * A different account signing in wipes the index first.
 */
export function syncLibrary({ transport, db, onProgress }: SyncDeps): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const account: Account = await fetchAccount(transport);
    if ((await getMeta<string>(db, 'accountId')) !== account.id) {
      await clearLibrary(db);
      await setMeta(db, 'accountId', account.id);
    }
    await syncLiked(transport, db, onProgress);
    await syncPlaylists(transport, db, account.id, onProgress);
    await rebuildDerived(db);
    await setMeta(db, 'lastSyncedAt', Date.now());
    onProgress?.();
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export const lastSyncedAt = (db: IDBDatabase) => getMeta<number>(db, 'lastSyncedAt');

/** Sync at sign-in, app start, and on return to the foreground at most every 10 minutes. */
export const FOREGROUND_SYNC_INTERVAL_MS = 10 * 60 * 1000;
export function shouldSyncOnForeground(last: number | undefined, now = Date.now()): boolean {
  return last === undefined || now - last >= FOREGROUND_SYNC_INTERVAL_MS;
}
