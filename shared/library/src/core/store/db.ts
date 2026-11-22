/** The local index: IndexedDB schema, versions and small helpers. */

export const DB_VERSION = 1;

export const STORES = {
  songs: 'songs',
  albums: 'albums',
  artists: 'artists',
  playlists: 'playlists',
  history: 'history',
  albumTracks: 'albumTracks',
  meta: 'meta',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

/** One entry per schema version; entry N upgrades version N to N+1. */
const migrations: Migration[] = [
  (db) => {
    const songs = db.createObjectStore(STORES.songs, { keyPath: 'id' });
    songs.createIndex('sortKey', 'sortKey');
    songs.createIndex('likedAt', 'likedAt');
    db.createObjectStore(STORES.albums, { keyPath: 'id' }).createIndex('name', 'sortName');
    db.createObjectStore(STORES.artists, { keyPath: 'id' }).createIndex('name', 'sortName');
    db.createObjectStore(STORES.playlists, { keyPath: 'id' });
    db.createObjectStore(STORES.history, { keyPath: 'seq', autoIncrement: true }).createIndex('playedAt', 'playedAt');
    db.createObjectStore(STORES.albumTracks, { keyPath: 'albumId' });
    db.createObjectStore(STORES.meta, { keyPath: 'key' });
  },
];

export function openLibraryDb(name = 'zplayer-library'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const tx = request.transaction!;
      for (let version = event.oldVersion; version < DB_VERSION; version += 1) {
        migrations[version]!(request.result, tx);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The library database is open in another window.'));
  });
}

export function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getMeta<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  const row = await done<{ key: string; value: T } | undefined>(
    db.transaction(STORES.meta).objectStore(STORES.meta).get(key),
  );
  return row?.value;
}

export async function setMeta<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  const tx = db.transaction(STORES.meta, 'readwrite');
  tx.objectStore(STORES.meta).put({ key, value });
  await finished(tx);
}

/** Wipe everything, e.g. on sign-out or when another account signs in. */
export async function clearLibrary(db: IDBDatabase): Promise<void> {
  const names = Object.values(STORES);
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await finished(tx);
}
