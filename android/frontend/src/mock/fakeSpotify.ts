// The browser preview's Spotify: the library's transport answering from the design mock's invented
// library (../shared/data.ts), so the real screens and hooks run in a plain browser.
import type { Method, Transport } from '@zplayer/library';
import { albums, allSongs, devices as mockDevices, likedSongs, playlists, recentlyPlayed, type MockSong } from '../shared/data';

export const MOCK_ACCOUNT = { id: 'mock-user-01', display_name: 'Alex Rivera', product: 'premium' };

const raw = (song: MockSong, withAlbum = true) => ({
  id: song.id, uri: `spotify:track:${song.id}`, name: song.title, type: 'track', duration_ms: song.durationMs,
  track_number: song.number, disc_number: 1,
  artists: [{ id: song.album.artist.id, name: song.artist }],
  ...(withAlbum ? { album: { id: song.album.id, name: song.album.title, images: [{ url: song.album.art, width: 300 }] } } : {}),
});

const byId = new Map(allSongs.map(song => [song.id, song]));

export class FakeSpotify implements Transport {
  /** Liked songs, newest first; likes in the preview change this. */
  liked: MockSong[] = [...likedSongs];
  /** Review panel: make every call fail, or wait forever, to see the error and loading states. */
  mode: 'ok' | 'error' | 'loading' = 'ok';

  async call<T>(path: string, method: Method = 'GET'): Promise<T> {
    if (this.mode === 'loading') return new Promise<T>(() => {});
    if (this.mode === 'error') throw { status: 500, message: 'The preview is set to fail.' };
    const url = new URL(path, 'https://x');
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const page = <R>(rows: R[]) => ({
      items: rows.slice(offset, offset + limit), total: rows.length,
      next: offset + limit < rows.length ? `https://api.spotify.com/v1${url.pathname}?offset=${offset + limit}` : null,
    });

    if (url.pathname === '/me') return MOCK_ACCOUNT as T;
    if (url.pathname === '/me/tracks') {
      const now = Date.parse('2026-11-01T00:00:00Z');
      return page(this.liked.map((song, i) => ({ added_at: new Date(now - i * 86_400_000).toISOString(), track: raw(song) }))) as T;
    }
    if (url.pathname === '/me/library') {
      const ids = (url.searchParams.get('uris') ?? '').split(',').map(uri => uri.replace('spotify:track:', ''));
      if (method === 'PUT') for (const id of ids) { const song = byId.get(id); if (song && !this.liked.includes(song)) this.liked.unshift(song); }
      if (method === 'DELETE') this.liked = this.liked.filter(song => !ids.includes(song.id));
      return undefined as T;
    }
    if (url.pathname === '/me/playlists') {
      return page(playlists.map(p => ({
        id: p.id, uri: `spotify:playlist:${p.id}`, name: p.title, snapshot_id: 'v1', collaborative: false,
        owner: { id: p.owned ? MOCK_ACCOUNT.id : 'someone-else', display_name: p.owner }, items: { total: p.count },
        images: [{ url: p.art, width: 300 }],
      }))) as T;
    }
    const items = /^\/playlists\/([^/]+)\/items$/.exec(url.pathname);
    if (items) {
      const playlist = playlists.find(p => p.id === items[1]);
      if (!playlist?.owned) throw { status: 403, message: 'Forbidden' };
      return page(playlist.tracks.map(song => ({ added_at: '2026-06-01T00:00:00Z', item: raw(song) }))) as T;
    }
    const album = /^\/albums\/([^/]+)$/.exec(url.pathname);
    if (album) {
      const found = albums.find(a => a.id === album[1])!;
      return {
        id: found.id, name: found.title, images: [{ url: found.art, width: 300 }], artists: [{ id: found.artist.id, name: found.artist.name }],
        tracks: { items: found.tracks.map(song => raw(song, false)), next: null },
      } as T;
    }
    const track = /^\/tracks\/([^/]+)$/.exec(url.pathname);
    if (track) return raw(byId.get(track[1]!) ?? allSongs[0]!) as T;
    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      return { tracks: page(allSongs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)).map(s => raw(s))) } as T;
    }
    if (url.pathname === '/me/player/recently-played') {
      const now = Date.parse('2026-11-22T12:00:00Z');
      return { items: recentlyPlayed.map((song, i) => ({ track: raw(song), played_at: new Date(now - i * 600_000).toISOString() })) } as T;
    }
    if (url.pathname === '/me/player/queue') return { queue: allSongs.slice(20, 30).map(s => raw(s)) } as T;
    if (url.pathname === '/me/player/devices') {
      return { devices: mockDevices.map((d, i) => ({ id: d.id, name: d.name, type: d.type, is_active: i === 0, is_restricted: d.restricted })) } as T;
    }
    if (url.pathname === '/me/player') return undefined as T;
    throw { status: 404, message: `The preview has no ${path}` };
  }
}
