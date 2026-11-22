import type { HistoryEntry, Song } from '../model';
import { STORES, done, finished } from './db';
import { allRows, pageByIndex } from './page';

export const HISTORY_LIMIT = 2000;

/** Newest first. */
export const pageHistory = (db: IDBDatabase, offset: number, limit: number) =>
  pageByIndex<HistoryEntry>(db, STORES.history, 'playedAt', 'prev', offset, limit);

/**
 * Add plays. Each song appears once, at the time it was last played: playing a song again moves it
 * to the top instead of adding a second row. Keeps the newest HISTORY_LIMIT songs.
 */
export async function addHistory(db: IDBDatabase, entries: HistoryEntry[]): Promise<void> {
  if (!entries.length) return;
  const tx = db.transaction(STORES.history, 'readwrite');
  const store = tx.objectStore(STORES.history);
  const existing = await done<HistoryEntry[]>(store.getAll());

  // the newest play of each song, among what is stored and what is arriving
  const newest = new Map<string, number>();
  for (const entry of [...existing, ...entries]) {
    newest.set(entry.song.id, Math.max(newest.get(entry.song.id) ?? 0, entry.playedAt));
  }
  const kept = new Set<string>();
  for (const entry of existing) {
    // drop older rows of the same song (this also cleans up duplicates saved by earlier versions)
    if (entry.playedAt !== newest.get(entry.song.id) || kept.has(entry.song.id)) store.delete(entry.seq!);
    else kept.add(entry.song.id);
  }
  for (const entry of [...entries].sort((a, b) => a.playedAt - b.playedAt)) {
    if (entry.playedAt !== newest.get(entry.song.id) || kept.has(entry.song.id)) continue;
    kept.add(entry.song.id);
    store.add({ playedAt: entry.playedAt, song: entry.song });
  }

  let excess = kept.size - HISTORY_LIMIT;
  if (excess > 0) {
    // oldest first
    await new Promise<void>((resolve, reject) => {
      const request = store.index('playedAt').openCursor(null, 'next');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || excess <= 0) return resolve();
        cursor.delete();
        excess -= 1;
        cursor.continue();
      };
    });
  }
  await finished(tx);
}

export const allHistory = (db: IDBDatabase) => allRows<HistoryEntry>(db, STORES.history);

/**
 * Plays from Spotify's recently-played list that the local log does not already have. The local log
 * records when a song started; Spotify records when it ended, so a play counts as known when the same
 * song is logged within its length plus a minute.
 */
export function newPlays(known: HistoryEntry[], recent: HistoryEntry[]): HistoryEntry[] {
  const bySong = new Map<string, number[]>();
  for (const entry of known) bySong.set(entry.song.id, [...(bySong.get(entry.song.id) ?? []), entry.playedAt]);
  return recent.filter((entry) => {
    const window = entry.song.durationMs + 60_000;
    return !(bySong.get(entry.song.id) ?? []).some((at) => Math.abs(at - entry.playedAt) <= window);
  });
}

export type { Song };
