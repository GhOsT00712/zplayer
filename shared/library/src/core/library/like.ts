import type { Song } from '../model';
import type { Transport } from '../transport';
import { likeInSpotify, unlikeInSpotify } from '../spotify/liked';
import { rebuildDerived } from '../store/albums';
import { getSong, mergeSongs, unlikeSong } from '../store/songs';

/**
 * Albums and artists only change when a song enters or leaves the library, not when a song that is
 * already in it (through a playlist) gains or loses its heart.
 */
async function settle(db: IDBDatabase, id: string, wasStored: boolean) {
  if (wasStored === !!(await getSong(db, id))) return;
  await rebuildDerived(db);
}

/**
 * Like in Spotify (`PUT /me/library`), so it shows in Liked Songs. The index updates first so the song
 * appears straight away; if Spotify refuses, the index is put back.
 */
export async function like(db: IDBDatabase, transport: Transport, song: Song): Promise<void> {
  const wasStored = !!(await getSong(db, song.id));
  await mergeSongs(db, [{ song, likedAt: Date.now() }]);
  await settle(db, song.id, wasStored);
  try {
    await likeInSpotify(transport, [song.id]);
  } catch (error) {
    await unlikeSong(db, song.id);
    await settle(db, song.id, true); // the optimistic like had put it in the index
    throw error;
  }
}

/** Unliking a song that is also in one of your playlists keeps it in songs. */
export async function unlike(db: IDBDatabase, transport: Transport, song: Song): Promise<void> {
  const before = await getSong(db, song.id);
  await unlikeSong(db, song.id);
  const stillStored = !!(await getSong(db, song.id));
  await settle(db, song.id, !!before);
  try {
    await unlikeInSpotify(transport, [song.id]);
  } catch (error) {
    if (before?.likedAt != null) {
      await mergeSongs(db, [{ song: before, likedAt: before.likedAt }]);
      await settle(db, song.id, stillStored);
    }
    throw error;
  }
}

export const isLiked = async (db: IDBDatabase, id: string) => (await getSong(db, id))?.likedAt != null;
