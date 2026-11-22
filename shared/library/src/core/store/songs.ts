import type { Song, StoredSong } from '../model';
import { STORES, done, finished } from './db';
import { allRows, countRows, pageByIndex } from './page';

export interface SongWrite {
  song: Song;
  /** Set when the song is liked. */
  likedAt?: number;
  /** Set when the song is in this playlist. */
  playlistId?: string;
  /** When it was added to that playlist; orders songs that are not liked. */
  addedAt?: number;
}

function merge(existing: StoredSong | undefined, write: SongWrite, now: number): StoredSong {
  const likedAt = write.likedAt ?? existing?.likedAt ?? null;
  const playlistIds = existing?.playlistIds ?? [];
  return {
    ...write.song,
    likedAt,
    playlistIds: write.playlistId && !playlistIds.includes(write.playlistId) ? [...playlistIds, write.playlistId] : playlistIds,
    // liked time orders the list; a song only in playlists keeps the time it was first indexed
    sortKey: write.likedAt ?? existing?.sortKey ?? write.addedAt ?? now,
  };
}

/** Add or update songs. A song in several places is stored once. */
export async function mergeSongs(db: IDBDatabase, writes: SongWrite[], now = Date.now()): Promise<void> {
  if (!writes.length) return;
  const tx = db.transaction(STORES.songs, 'readwrite');
  const store = tx.objectStore(STORES.songs);
  for (const write of writes) {
    const existing = await done<StoredSong | undefined>(store.get(write.song.id));
    store.put(merge(existing, write, now));
  }
  await finished(tx);
}

/** Remove the like. The song stays when it is still in a readable playlist. */
export async function unlikeSong(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(STORES.songs, 'readwrite');
  const store = tx.objectStore(STORES.songs);
  const existing = await done<StoredSong | undefined>(store.get(id));
  if (existing) {
    if (existing.playlistIds.length) store.put({ ...existing, likedAt: null });
    else store.delete(id);
  }
  await finished(tx);
}

/** Set which songs a playlist holds, dropping it from songs that left. */
export async function setPlaylistSongs(db: IDBDatabase, playlistId: string, songs: { song: Song; addedAt?: number }[], now = Date.now()): Promise<void> {
  const keep = new Set(songs.map((entry) => entry.song.id));
  const tx = db.transaction(STORES.songs, 'readwrite');
  const store = tx.objectStore(STORES.songs);
  const all = await done<StoredSong[]>(store.getAll());
  for (const stored of all) {
    if (keep.has(stored.id) || !stored.playlistIds.includes(playlistId)) continue;
    const playlistIds = stored.playlistIds.filter((id) => id !== playlistId);
    if (playlistIds.length || stored.likedAt !== null) store.put({ ...stored, playlistIds });
    else store.delete(stored.id);
  }
  const byId = new Map(all.map((stored) => [stored.id, stored]));
  for (const entry of songs) store.put(merge(byId.get(entry.song.id), { song: entry.song, playlistId, addedAt: entry.addedAt }, now));
  await finished(tx);
}

export const getSong = (db: IDBDatabase, id: string) =>
  done<StoredSong | undefined>(db.transaction(STORES.songs).objectStore(STORES.songs).get(id));

/** Newest first. */
export const pageSongs = (db: IDBDatabase, offset: number, limit: number) =>
  pageByIndex<StoredSong>(db, STORES.songs, 'sortKey', 'prev', offset, limit);

export const allSongs = (db: IDBDatabase) => allRows<StoredSong>(db, STORES.songs);
export const countSongs = (db: IDBDatabase) => countRows(db, STORES.songs);
export const likedIds = async (db: IDBDatabase) =>
  new Set((await allSongs(db)).filter((song) => song.likedAt !== null).map((song) => song.id));
