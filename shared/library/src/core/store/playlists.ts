import type { Playlist } from '../model';
import { STORES, finished } from './db';
import { allRows } from './page';

export const allPlaylists = (db: IDBDatabase) => allRows<Playlist>(db, STORES.playlists);

export async function putPlaylists(db: IDBDatabase, playlists: Playlist[]): Promise<void> {
  const tx = db.transaction(STORES.playlists, 'readwrite');
  for (const playlist of playlists) tx.objectStore(STORES.playlists).put(playlist);
  await finished(tx);
}

export async function deletePlaylist(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(STORES.playlists, 'readwrite');
  tx.objectStore(STORES.playlists).delete(id);
  await finished(tx);
}
