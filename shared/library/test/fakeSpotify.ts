import type { Method, Transport } from '../src/core';

export interface FakeTrack { id: string; name: string; album: string; artists: string[]; n?: number }

const track = (t: FakeTrack) => ({
  id: t.id,
  uri: `spotify:track:${t.id}`,
  name: t.name,
  type: 'track',
  duration_ms: 180_000,
  track_number: t.n ?? 1,
  disc_number: 1,
  artists: t.artists.map((a) => ({ id: `ar-${a}`, name: a })),
  album: { id: `al-${t.album}`, name: t.album, images: [{ url: `img-${t.album}`, width: 300 }] },
});

/** Just enough of Spotify's Web API for the library, with call logging and failure injection. */
export class FakeSpotify implements Transport {
  /** Liked songs, newest first. */
  liked: FakeTrack[] = [];
  playlists: { id: string; name: string; owner: string; collaborative?: boolean; snapshot: string; songs: FakeTrack[] }[] = [];
  albums = new Map<string, FakeTrack[]>();
  recent: { track: FakeTrack; at: string }[] = [];
  me = 'me';
  calls: string[] = [];
  failOn?: (path: string, method: Method) => unknown;

  async call<T>(path: string, method: Method = 'GET'): Promise<T> {
    this.calls.push(`${method} ${path}`);
    const failure = this.failOn?.(path, method);
    if (failure) throw failure;
    const url = new URL(path, 'https://x');
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const page = <R>(rows: R[], base: string) => ({
      items: rows.slice(offset, offset + limit),
      total: rows.length,
      next: offset + limit < rows.length ? `https://api.spotify.com/v1${base}?offset=${offset + limit}&limit=${limit}` : null,
    });

    if (url.pathname === '/me') return { id: this.me, display_name: 'Me' } as T;
    if (url.pathname === '/me/tracks') {
      const rows = this.liked.map((t, i) => ({ added_at: new Date(2026, 0, 1, 0, 0, this.liked.length - i).toISOString(), track: track(t) }));
      return page(rows, '/me/tracks') as T;
    }
    if (url.pathname === '/me/library') {
      const ids = (url.searchParams.get('uris') ?? '').split(',').map((u) => u.replace('spotify:track:', ''));
      if (method === 'PUT') for (const id of ids) if (!this.liked.some((t) => t.id === id)) this.liked.unshift({ id, name: id, album: 'x', artists: ['x'] });
      if (method === 'DELETE') this.liked = this.liked.filter((t) => !ids.includes(t.id));
      return undefined as T;
    }
    if (url.pathname === '/me/playlists') {
      const rows = this.playlists.map((p) => ({
        id: p.id,
        name: p.name,
        owner: { id: p.owner },
        collaborative: p.collaborative ?? false,
        snapshot_id: p.snapshot,
        items: { total: p.songs.length },
      }));
      return page(rows, '/me/playlists') as T;
    }
    const items = /^\/playlists\/([^/]+)\/items$/.exec(url.pathname);
    if (items) {
      const playlist = this.playlists.find((p) => p.id === items[1])!;
      if (playlist.owner !== this.me && !playlist.collaborative) throw { status: 403, message: 'Forbidden' };
      const rows = [...playlist.songs.map((t) => ({ added_at: '2025-06-01T00:00:00Z', item: track(t) })), { item: { id: 'ep', name: 'Episode', type: 'episode', duration_ms: 1 } }, { item: null }];
      return page(rows, url.pathname) as T;
    }
    const album = /^\/albums\/([^/]+)$/.exec(url.pathname);
    if (album) {
      const songs = this.albums.get(album[1]!)!;
      const first = songs.slice(0, 50).map((t) => ({ ...track(t), album: undefined }));
      return {
        id: album[1],
        name: songs[0]!.album,
        images: [{ url: `img-${songs[0]!.album}`, width: 300 }],
        artists: [{ id: `ar-${songs[0]!.artists[0]}`, name: songs[0]!.artists[0] }],
        tracks: {
          items: first,
          next: songs.length > 50 ? `https://api.spotify.com/v1/albums/${album[1]}/tracks?offset=50&limit=50` : null,
        },
      } as T;
    }
    const albumTracks = /^\/albums\/([^/]+)\/tracks$/.exec(url.pathname);
    if (albumTracks) {
      const songs = this.albums.get(albumTracks[1]!)!;
      return { items: songs.slice(offset, offset + 50).map((t) => ({ ...track(t), album: undefined })), next: null } as T;
    }
    if (url.pathname === '/search') {
      const q = url.searchParams.get('q')!.toLowerCase();
      const all = [...this.liked, ...this.playlists.flatMap((p) => p.songs)].filter((t) => t.name.toLowerCase().includes(q));
      return { tracks: page(all.map(track), '/search') } as T;
    }
    if (url.pathname === '/me/player/recently-played') {
      return { items: this.recent.map((r) => ({ track: track(r.track), played_at: r.at })) } as T;
    }
    throw { status: 404, message: `Unhandled ${path}` };
  }
}

export const song = (id: string, album = 'Album A', artists = ['Artist A'], n = 1): FakeTrack => ({ id, name: id, album, artists, n });
