import type { Song } from '../model';
import type { Transport } from '../transport';
import { searchSongs } from '../spotify/search';
import { fetchPlaylistSongs } from '../spotify/playlists';
import { likedIds } from '../store/songs';
import { allPlaylists } from '../store/playlists';
import { openLibraryDb } from '../store/db';
import { syncLibrary, lastSyncedAt } from '../sync/syncLibrary';
import { like, unlike } from './like';
import { mergeRecentPlays, recordPlay } from './history';
import { albumPage, albumsPage, artistPage, artistsPage, historyPage, songsPage } from './queries';

export interface LibraryOptions {
  transport: Transport;
  /** Open database; defaults to the shared IndexedDB one. */
  db?: IDBDatabase;
}

/** One library per signed-in app: sections, sync, like, history and search over one transport. */
export async function createLibrary({ transport, db }: LibraryOptions) {
  const database = db ?? (await openLibraryDb());
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());
  /** One merge at a time: two at once would both add the same plays. */
  let merging: Promise<void> | null = null;

  return {
    /** Called when the index changes (sync progress, like, history), so open sections can reload. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    sync: () => syncLibrary({ transport, db: database, onProgress: changed }),
    lastSyncedAt: () => lastSyncedAt(database),
    songs: (offset?: number) => songsPage(database, offset),
    history: (offset?: number) => historyPage(database, offset),
    albums: (offset?: number) => albumsPage(database, offset),
    artists: (offset?: number) => artistsPage(database, offset),
    /** Playlists whose songs Spotify lets us read (yours and collaborative). Ones you only saved are left out. */
    playlists: async () => (await allPlaylists(database)).filter((playlist) => playlist.readable),
    likedIds: () => likedIds(database),
    album: (id: string) => albumPage(database, transport, id),
    artist: (id: string) => artistPage(database, id),
    playlistSongs: async (id: string, offset?: number) => {
      const page = await fetchPlaylistSongs(transport, id, offset);
      return { items: page.items.map((entry) => entry.song), next: page.next };
    },
    search: (query: string, offset?: number) => searchSongs(transport, query, offset),
    async like(song: Song) {
      await like(database, transport, song);
      changed();
    },
    async unlike(song: Song) {
      await unlike(database, transport, song);
      changed();
    },
    async recordPlay(song: Song) {
      await recordPlay(database, song);
      changed();
    },
    mergeRecentPlays() {
      merging ??= mergeRecentPlays(database, transport)
        .then((added) => { if (added) changed(); })
        .finally(() => { merging = null; });
      return merging;
    },
    close: () => database.close(),
  };
}

export type Library = Awaited<ReturnType<typeof createLibrary>>;
