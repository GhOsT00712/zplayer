import type { Album, AlbumSong, Artist, HistoryEntry, LibrarySong, Page, StoredSong, Song } from '../model';
import type { Transport } from '../transport';
import { fetchFullAlbum } from '../spotify/albums';
import { cacheAlbum, getAlbum, getArtist, getCachedAlbum, pageAlbums, pageArtists } from '../store/albums';
import { pageHistory } from '../store/history';
import { allSongs, getSong, pageSongs } from '../store/songs';

export const PAGE_SIZE = 50;

function paged<T>(rows: T[], offset: number, limit: number): Page<T> {
  // one extra row was requested to tell whether more follow
  return { items: rows.slice(0, limit), next: rows.length > limit ? offset + limit : null };
}

const toLibrarySong = (stored: StoredSong): LibrarySong => {
  const { likedAt, playlistIds: _p, sortKey: _s, ...song } = stored;
  return { ...song, liked: likedAt !== null };
};

/** Every song in the library, newest first. */
export async function songsPage(db: IDBDatabase, offset = 0, limit = PAGE_SIZE): Promise<Page<LibrarySong>> {
  const rows = await pageSongs(db, offset, limit + 1);
  return paged(rows.map(toLibrarySong), offset, limit);
}

/** What was played, newest first. */
export async function historyPage(db: IDBDatabase, offset = 0, limit = PAGE_SIZE): Promise<Page<HistoryEntry>> {
  return paged(await pageHistory(db, offset, limit + 1), offset, limit);
}

/** Albums that have at least one of your songs, A to Z. */
export async function albumsPage(db: IDBDatabase, offset = 0, limit = PAGE_SIZE): Promise<Page<Album>> {
  return paged(await pageAlbums(db, offset, limit + 1), offset, limit);
}

/** Artists on at least one of your songs (featured artists included), A to Z. */
export async function artistsPage(db: IDBDatabase, offset = 0, limit = PAGE_SIZE): Promise<Page<Artist>> {
  return paged(await pageArtists(db, offset, limit + 1), offset, limit);
}

export interface AlbumPage { album: Omit<Album, 'songCount'> & { songCount?: number }; songs: AlbumSong[] }

/** The full album in track order, with your songs marked. Fetched once, then kept in the index. */
export async function albumPage(db: IDBDatabase, transport: Transport, id: string): Promise<AlbumPage> {
  let cached = await getCachedAlbum(db, id);
  if (!cached) {
    const full = await fetchFullAlbum(transport, id);
    cached = { albumId: id, album: full.album, songs: full.songs };
    await cacheAlbum(db, cached);
  }
  const songs: AlbumSong[] = [];
  for (const song of cached.songs) {
    const stored = await getSong(db, song.id);
    songs.push({ ...song, liked: stored?.likedAt != null, inLibrary: !!stored });
  }
  songs.sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  const known = await getAlbum(db, id);
  return { album: { ...cached.album, songCount: known?.songCount }, songs };
}

export interface ArtistPage { artist: Artist; albums: { album: Song['album']; songs: LibrarySong[] }[] }

/** Your songs by one artist, grouped by album. */
export async function artistPage(db: IDBDatabase, id: string): Promise<ArtistPage | undefined> {
  const artist = await getArtist(db, id);
  if (!artist) return undefined;
  const groups = new Map<string, { album: Song['album']; songs: LibrarySong[] }>();
  for (const stored of await allSongs(db)) {
    if (!stored.artists.some((a) => a.id === id)) continue;
    const group = groups.get(stored.album.id) ?? { album: stored.album, songs: [] };
    group.songs.push(toLibrarySong(stored));
    groups.set(stored.album.id, group);
  }
  const albums = [...groups.values()].sort((a, b) => a.album.name.localeCompare(b.album.name));
  for (const group of albums) group.songs.sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  return { artist, albums };
}
