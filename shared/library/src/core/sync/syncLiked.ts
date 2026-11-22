import type { Transport } from '../transport';
import { fetchLiked } from '../spotify/liked';
import { allSongs, mergeSongs, unlikeSong } from '../store/songs';

export interface LikedSyncResult { added: number; removed: number; total: number }

/**
 * Newest first, stopping at the first song already stored as liked. If Spotify's total still differs
 * from what we hold afterwards (songs were unliked elsewhere), do a full pass to catch the unlikes.
 */
export async function syncLiked(transport: Transport, db: IDBDatabase, onProgress?: () => void): Promise<LikedSyncResult> {
  const known = new Set((await allSongs(db)).filter((song) => song.likedAt !== null).map((song) => song.id));
  let added = 0;
  let offset: number | null = 0;
  let total = 0;
  let reachedKnown = false;
  while (offset !== null && !reachedKnown) {
    const page = await fetchLiked(transport, offset);
    total = page.total;
    const fresh = [];
    for (const entry of page.items) {
      if (known.has(entry.song.id)) {
        reachedKnown = true;
        break;
      }
      fresh.push({ song: entry.song, likedAt: entry.likedAt });
    }
    await mergeSongs(db, fresh);
    added += fresh.length;
    if (fresh.length) onProgress?.();
    offset = page.next;
  }

  const heldAfter = known.size + added;
  if (heldAfter === total) return { added, removed: 0, total };
  return fullLikedPass(transport, db, total, added, onProgress);
}

/** Read every liked song and drop likes that no longer exist in Spotify. */
export async function fullLikedPass(
  transport: Transport,
  db: IDBDatabase,
  total: number,
  added: number,
  onProgress?: () => void,
): Promise<LikedSyncResult> {
  const seen = new Set<string>();
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await fetchLiked(transport, offset);
    await mergeSongs(db, page.items.map((entry) => ({ song: entry.song, likedAt: entry.likedAt })));
    for (const entry of page.items) seen.add(entry.song.id);
    onProgress?.();
    offset = page.next;
  }
  let removed = 0;
  for (const stored of await allSongs(db)) {
    if (stored.likedAt !== null && !seen.has(stored.id)) {
      await unlikeSong(db, stored.id);
      removed += 1;
    }
  }
  return { added, removed, total };
}
