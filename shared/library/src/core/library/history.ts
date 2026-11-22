import type { Song } from '../model';
import type { Transport } from '../transport';
import { fetchRecentlyPlayed } from '../spotify/recent';
import { addHistory, allHistory, newPlays, pageHistory } from '../store/history';

/** Called each time the current song changes. */
export async function recordPlay(db: IDBDatabase, song: Song, now = Date.now()): Promise<void> {
  // always later than the newest entry, so a song played again lands on top
  const [latest] = await pageHistory(db, 0, 1);
  await addHistory(db, [{ playedAt: Math.max(now, (latest?.playedAt ?? 0) + 1), song }]);
}

/** Pick up plays from other devices: add what Spotify lists that our own log lacks. */
export async function mergeRecentPlays(db: IDBDatabase, transport: Transport): Promise<number> {
  const fresh = newPlays(await allHistory(db), await fetchRecentlyPlayed(transport));
  await addHistory(db, fresh);
  return fresh.length;
}
