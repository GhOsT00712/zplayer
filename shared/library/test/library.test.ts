import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLibrary, missingScopes, openLibraryDb, type Library } from '../src/core';
import { FakeSpotify, song } from './fakeSpotify';

let n = 0;
let spotify: FakeSpotify;
let library: Library;
const ids = (page: { items: { id: string }[] }) => page.items.map((i) => i.id);

async function fresh() {
  spotify = new FakeSpotify();
  library = await createLibrary({ transport: spotify, db: await openLibraryDb(`lib-${(n += 1)}`) });
}

describe('sync and sections', () => {
  beforeEach(fresh);

  it('songs = liked + readable playlist songs, once each, newest first; unreadable playlists are listed only', async () => {
    spotify.liked = [song('l2'), song('l1', 'Album B', ['Artist B'])];
    spotify.playlists = [
      { id: 'mine', name: 'Mine', owner: 'me', snapshot: 's1', songs: [song('l1', 'Album B', ['Artist B']), song('p1')] },
      { id: 'collab', name: 'Collab', owner: 'x', collaborative: true, snapshot: 's1', songs: [song('c1')] },
      { id: 'saved', name: 'Saved', owner: 'other', snapshot: 's1', songs: [song('hidden')] },
    ];
    await library.sync();
    const songs = await library.songs();
    expect(new Set(ids(songs))).toEqual(new Set(['l2', 'l1', 'p1', 'c1']));
    expect(songs.items.filter((s) => s.id === 'l1')).toHaveLength(1);
    expect(ids(songs).slice(0, 2)).toEqual(['l2', 'l1']); // liked first, newest liked first
    expect(songs.items.find((s) => s.id === 'p1')!.liked).toBe(false);
    expect((await library.playlists()).map((p) => [p.id, p.readable])).toEqual(
      expect.arrayContaining([['mine', true], ['collab', true]]),
    );
    expect((await library.playlists()).map((p) => p.id)).not.toContain('saved'); // saved from someone else: not listed
    expect(spotify.calls.some((c) => c.includes('/playlists/saved/items'))).toBe(false); // never tried
  });

  it('skips episodes and null entries in playlists', async () => {
    spotify.playlists = [{ id: 'mine', name: 'Mine', owner: 'me', snapshot: 's1', songs: [song('p1')] }];
    await library.sync();
    expect(ids(await library.songs())).toEqual(['p1']);
  });

  it('albums and artists come from your songs, A to Z, including featured artists', async () => {
    spotify.liked = [song('a', 'Zed', ['Zoe', 'Amy']), song('b', 'Alpha', ['Bob']), song('c', 'Alpha', ['Bob'], 2)];
    await library.sync();
    const albums = await library.albums();
    expect(albums.items.map((a) => [a.name, a.songCount])).toEqual([['Alpha', 2], ['Zed', 1]]);
    expect((await library.artists()).items.map((a) => a.name)).toEqual(['Amy', 'Bob', 'Zoe']);
    const amy = await library.artist('ar-Amy');
    expect(amy!.albums.map((g) => g.album.name)).toEqual(['Zed']);
  });

  it('a song with no album stays in songs but makes no album tile', async () => {
    spotify.liked = [song('a', 'Real Album')];
    const original = spotify.call.bind(spotify);
    spotify.call = async <T,>(path: string, method?: never) => {
      const result = await original<T>(path, method);
      const page = result as { items?: { track?: { album?: unknown } }[] };
      if (path.startsWith('/me/tracks')) page.items?.push({ track: { id: 'noalbum', name: 'Loose', type: 'track', duration_ms: 1, artists: [] } as never });
      return result;
    };
    await library.sync();
    expect(ids(await library.songs())).toContain('noalbum');
    expect((await library.albums()).items.map((a) => a.name)).toEqual(['Real Album']);
  });

  it('pages with next offsets', async () => {
    spotify.liked = Array.from({ length: 120 }, (_, i) => song(`s${i}`, `Album ${i}`));
    await library.sync();
    const first = await library.songs();
    expect(first.items).toHaveLength(50);
    expect(first.next).toBe(50);
    const third = await library.songs(100);
    expect(third.items).toHaveLength(20);
    expect(third.next).toBeNull();
    expect(new Set([...ids(first), ...ids(await library.songs(50)), ...ids(third)]).size).toBe(120);
  });

  it('later runs stop at the first known liked song and only re-read changed playlists', async () => {
    spotify.liked = [song('l1'), song('l0')];
    spotify.playlists = [{ id: 'mine', name: 'Mine', owner: 'me', snapshot: 's1', songs: [song('p1')] }];
    await library.sync();
    spotify.liked.unshift(song('l2'));
    spotify.calls = [];
    await library.sync();
    expect(spotify.calls.filter((c) => c.includes('/me/tracks'))).toHaveLength(1);
    expect(spotify.calls.some((c) => c.includes('/playlists/mine/items'))).toBe(false);
    expect(ids(await library.songs())[0]).toBe('l2');

    spotify.playlists[0]!.snapshot = 's2';
    spotify.playlists[0]!.songs = [song('p2')];
    await library.sync();
    expect(new Set(ids(await library.songs()))).toEqual(new Set(['l2', 'l1', 'l0', 'p2']));
  });

  it('a full liked pass catches unlikes done elsewhere', async () => {
    spotify.liked = [song('l2'), song('l1')];
    await library.sync();
    spotify.liked = spotify.liked.filter((t) => t.id !== 'l1');
    await library.sync();
    expect(ids(await library.songs())).toEqual(['l2']);
  });

  it('removes a deleted playlist and its songs', async () => {
    spotify.playlists = [{ id: 'mine', name: 'Mine', owner: 'me', snapshot: 's1', songs: [song('p1')] }];
    await library.sync();
    spotify.playlists = [];
    await library.sync();
    expect(ids(await library.songs())).toEqual([]);
    expect(await library.playlists()).toEqual([]);
  });

  it('runs one sync at a time', async () => {
    spotify.liked = [song('a')];
    const [x, y] = [library.sync(), library.sync()];
    await Promise.all([x, y]);
    expect(spotify.calls.filter((c) => c === 'GET /me')).toHaveLength(1);
  });
});

describe('album page', () => {
  beforeEach(fresh);

  it('shows the full album in track order with your songs marked, and fetches it once', async () => {
    const album = [song('t2', 'Alpha', ['Bob'], 2), song('t1', 'Alpha', ['Bob'], 1), song('t3', 'Alpha', ['Bob'], 3)];
    spotify.albums.set('al-Alpha', album);
    spotify.liked = [album[1]!];
    spotify.playlists = [{ id: 'mine', name: 'Mine', owner: 'me', snapshot: 's', songs: [album[0]!] }];
    await library.sync();
    const page = await library.album('al-Alpha');
    expect(page.songs.map((s) => [s.id, s.liked, s.inLibrary])).toEqual([
      ['t1', true, true],
      ['t2', false, true],
      ['t3', false, false],
    ]);
    await library.album('al-Alpha');
    expect(spotify.calls.filter((c) => c === 'GET /albums/al-Alpha')).toHaveLength(1);
  });

  it('follows the tracks link for albums over 50 songs', async () => {
    spotify.albums.set('al-Big', Array.from({ length: 60 }, (_, i) => song(`b${i}`, 'Big', ['Bob'], i + 1)));
    const page = await library.album('al-Big');
    expect(page.songs).toHaveLength(60);
    expect(page.songs[59]!.id).toBe('b59');
  });
});

describe('like', () => {
  beforeEach(fresh);

  it('likes in Spotify and the index; unliking keeps a song that is in a playlist', async () => {
    const p1 = song('p1');
    spotify.playlists = [{ id: 'mine', name: 'Mine', owner: 'me', snapshot: 's', songs: [p1] }];
    await library.sync();
    const stored = (await library.songs()).items[0]!;
    await library.like(stored);
    expect(spotify.calls).toContain('PUT /me/library?uris=spotify%3Atrack%3Ap1');
    expect(spotify.liked.map((t) => t.id)).toContain('p1');
    expect((await library.songs()).items[0]!.liked).toBe(true);

    await library.unlike(stored);
    expect(spotify.calls).toContain('DELETE /me/library?uris=spotify%3Atrack%3Ap1');
    const after = (await library.songs()).items;
    expect(after.map((s) => [s.id, s.liked])).toEqual([['p1', false]]);
  });

  it('a liked song leaves songs when unliked and not in a playlist, and a new like shows at once', async () => {
    const extra = (song('new'));
    await library.sync();
    await library.like({ ...extra, uri: 'spotify:track:new', title: 'new', artists: [], album: { id: 'a', name: 'a' }, durationMs: 1 });
    expect(ids(await library.songs())).toEqual(['new']);
    await library.unlike({ id: 'new' } as never);
    expect(ids(await library.songs())).toEqual([]);
  });

  it('puts the index back when Spotify refuses (missing scope)', async () => {
    await library.sync();
    spotify.failOn = (p, m) => (m === 'PUT' && p.startsWith('/me/library') ? { status: 403, message: 'Insufficient client scope' } : undefined);
    await expect(
      library.like({ id: 'z', uri: 'spotify:track:z', title: 'z', artists: [], album: { id: 'a', name: 'a' }, durationMs: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    expect(ids(await library.songs())).toEqual([]);
  });
});

describe('history', () => {
  beforeEach(fresh);
  const play = (id: string) => ({ id, uri: `spotify:track:${id}`, title: id, artists: [], album: { id: 'a', name: 'a' }, durationMs: 180_000 });

  it('records plays newest first and merges Spotify recently-played without duplicates', async () => {
    await library.recordPlay(play('a'));
    const startedAt = Date.now();
    await library.recordPlay(play('b'));
    spotify.recent = [
      { track: song('b'), at: new Date(startedAt + 180_000).toISOString() }, // our own play of b, logged at its end
      { track: song('z'), at: new Date(startedAt - 3_600_000).toISOString() }, // played on another device
    ];
    await library.mergeRecentPlays();
    const history = await library.history();
    expect(history.items.map((h) => h.song.id)).toEqual(['b', 'a', 'z']);
    await library.mergeRecentPlays();
    expect((await library.history()).items).toHaveLength(3);
  });

  it('playing a song again moves it to the top instead of adding a second row', async () => {
    await library.recordPlay(play('a'));
    await library.recordPlay(play('b'));
    await library.recordPlay(play('a'));
    expect((await library.history()).items.map((h) => h.song.id)).toEqual(['a', 'b']);
  });

  it('two merges at once do not add the same plays twice', async () => {
    spotify.recent = [{ track: song('z'), at: new Date(Date.now() - 3_600_000).toISOString() }];
    await Promise.all([library.mergeRecentPlays(), library.mergeRecentPlays()]);
    expect((await library.history()).items).toHaveLength(1);
  });

  it('keeps only the newest 2,000 entries', async () => {
    const { addHistory } = await import('../src/core/store/history');
    const db = await openLibraryDb(`lib-trim-${n}`);
    await addHistory(db, Array.from({ length: 2005 }, (_, i) => ({ playedAt: i, song: play(`s${i}`) })));
    const lib = await createLibrary({ transport: spotify, db });
    let count = 0;
    for (let next: number | null = 0; next !== null; ) {
      const page = await lib.history(next);
      count += page.items.length;
      next = page.next;
    }
    expect(count).toBe(2000);
    expect((await lib.history()).items[0]!.song.id).toBe('s2004');
  });
});

describe('search and scopes', () => {
  beforeEach(fresh);

  it('searches 10 per request with a next offset', async () => {
    spotify.liked = Array.from({ length: 25 }, (_, i) => song(`hit${i}`));
    const first = await library.search('hit');
    expect(first.items).toHaveLength(10);
    expect(first.next).toBe(10);
    expect(spotify.calls.at(-1)).toContain('limit=10');
    expect((await library.search('hit', 20)).next).toBeNull();
    expect((await library.search('  ')).items).toEqual([]);
  });

  it('detects missing scopes', () => {
    expect(missingScopes(['user-library-read'])).toContain('user-library-modify');
    expect(missingScopes(['user-library-modify', 'user-library-read', 'playlist-read-private', 'playlist-read-collaborative', 'user-read-recently-played', 'user-read-playback-state', 'user-modify-playback-state'])).toEqual([]);
  });
});
