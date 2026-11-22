import type { Album, AlbumRef, Artist, ArtistRef, Song, StoredSong } from '../model';
import { STORES, done, finished } from './db';
import { pageByIndex } from './page';
import { allSongs } from './songs';

export const sortName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

type AlbumRow = Album & { sortName: string };
type ArtistRow = Artist & { sortName: string };

/**
 * Albums and artists are built from the stored songs, never from Spotify's saved albums or followed
 * artists. Rebuilt after a sync or a like; fine up to tens of thousands of songs.
 */
export async function rebuildDerived(db: IDBDatabase): Promise<void> {
  const songs = await allSongs(db);
  const albums = new Map<string, AlbumRow>();
  const artists = new Map<string, ArtistRow>();
  for (const song of songs) {
    // a song Spotify gives no album for stays in songs but gets no album tile of its own
    if (!song.album.id.startsWith('unknown:') && song.album.name.trim()) {
      const album = albums.get(song.album.id);
      if (album) album.songCount += 1;
      else
        albums.set(song.album.id, {
          id: song.album.id,
          name: song.album.name,
          artwork: song.album.artwork,
          artists: song.artists,
          songCount: 1,
          sortName: sortName(song.album.name),
        });
    }
    for (const artist of song.artists) {
      const row = artists.get(artist.id);
      if (row) row.songCount += 1;
      else artists.set(artist.id, { id: artist.id, name: artist.name, songCount: 1, sortName: sortName(artist.name) });
    }
  }
  const tx = db.transaction([STORES.albums, STORES.artists], 'readwrite');
  tx.objectStore(STORES.albums).clear();
  tx.objectStore(STORES.artists).clear();
  for (const row of albums.values()) tx.objectStore(STORES.albums).put(row);
  for (const row of artists.values()) tx.objectStore(STORES.artists).put(row);
  await finished(tx);
}

const strip = <T extends { sortName: string }>({ sortName: _ignored, ...rest }: T): Omit<T, 'sortName'> => rest;

/** A to Z. */
export async function pageAlbums(db: IDBDatabase, offset: number, limit: number): Promise<Album[]> {
  return (await pageByIndex<AlbumRow>(db, STORES.albums, 'name', 'next', offset, limit)).map(strip);
}

export async function pageArtists(db: IDBDatabase, offset: number, limit: number): Promise<Artist[]> {
  return (await pageByIndex<ArtistRow>(db, STORES.artists, 'name', 'next', offset, limit)).map(strip);
}

export async function getAlbum(db: IDBDatabase, id: string): Promise<Album | undefined> {
  const row = await done<AlbumRow | undefined>(db.transaction(STORES.albums).objectStore(STORES.albums).get(id));
  return row && strip(row);
}

export async function getArtist(db: IDBDatabase, id: string): Promise<Artist | undefined> {
  const row = await done<ArtistRow | undefined>(db.transaction(STORES.artists).objectStore(STORES.artists).get(id));
  return row && strip(row);
}

/** Each album is fetched from Spotify once, when first opened, then kept here. */
export interface CachedAlbum { albumId: string; album: { id: string; name: string; artwork?: string; artists: ArtistRef[] }; songs: Song[] }

export const getCachedAlbum = (db: IDBDatabase, id: string) =>
  done<CachedAlbum | undefined>(db.transaction(STORES.albumTracks).objectStore(STORES.albumTracks).get(id));

export async function cacheAlbum(db: IDBDatabase, cached: CachedAlbum): Promise<void> {
  const tx = db.transaction(STORES.albumTracks, 'readwrite');
  tx.objectStore(STORES.albumTracks).put(cached);
  await finished(tx);
}

export type { AlbumRef, StoredSong };
