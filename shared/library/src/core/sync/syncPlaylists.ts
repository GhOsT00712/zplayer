import type { Playlist } from '../model';
import type { Transport } from '../transport';
import { fetchPlaylistSongs, fetchPlaylists, type PlaylistSong } from '../spotify/playlists';
import { allPlaylists, deletePlaylist, putPlaylists } from '../store/playlists';
import { setPlaylistSongs } from '../store/songs';

export interface PlaylistSyncResult { playlists: number; reread: number; removed: number }

async function readAllSongs(transport: Transport, id: string) {
  const songs: PlaylistSong[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await fetchPlaylistSongs(transport, id, offset);
    songs.push(...page.items);
    offset = page.next;
  }
  return songs;
}

/** Playlists are re-read only when their snapshot_id changed. Unreadable ones are listed but not read. */
export async function syncPlaylists(
  transport: Transport,
  db: IDBDatabase,
  accountId: string,
  onProgress?: () => void,
): Promise<PlaylistSyncResult> {
  const remote: Playlist[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await fetchPlaylists(transport, accountId, offset);
    remote.push(...page.items);
    offset = page.next;
  }
  const local = new Map((await allPlaylists(db)).map((playlist) => [playlist.id, playlist]));

  let removed = 0;
  const remoteIds = new Set(remote.map((playlist) => playlist.id));
  for (const [id] of local) {
    if (remoteIds.has(id)) continue;
    await setPlaylistSongs(db, id, []);
    await deletePlaylist(db, id);
    removed += 1;
  }

  let reread = 0;
  for (const playlist of remote) {
    const before = local.get(playlist.id);
    const changed = !before || before.snapshotId !== playlist.snapshotId || !before.readable;
    if (playlist.readable && changed) {
      await setPlaylistSongs(db, playlist.id, await readAllSongs(transport, playlist.id));
      reread += 1;
      onProgress?.();
    }
    // Saved after its songs, so an interrupted sync reads the playlist again next time.
    await putPlaylists(db, [playlist]);
  }
  return { playlists: remote.length, reread, removed };
}
