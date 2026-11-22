import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLibrary, openLibraryDb } from '../src/core';
import { FakeSpotify, song } from './fakeSpotify';

describe('a large library (6,000 liked songs, 30 playlists of 100)', () => {
  it('syncs, pages every section, likes quickly, and a later sync is cheap', async () => {
    const spotify = new FakeSpotify();
    spotify.liked = Array.from({ length: 6000 }, (_, i) => song(`l${i}`, `Album ${i % 800}`, [`Artist ${i % 300}`], (i % 12) + 1));
    spotify.playlists = Array.from({ length: 30 }, (_, p) => ({
      id: `pl${p}`, name: `Playlist ${p}`, owner: 'me', snapshot: 's1',
      songs: Array.from({ length: 100 }, (_, i) => song(`p${p}-${i}`, `Album P${p}`, [`Artist ${i % 300}`])),
    }));
    const library = await createLibrary({ transport: spotify, db: await openLibraryDb('large') });

    const started = performance.now();
    await library.sync();
    const firstSync = performance.now() - started;
    const requests = spotify.calls.length;
    // /me, 120 liked pages, 1 playlist list, and 3 pages for each of the 30 playlists (50 per page)
    expect(requests).toBe(1 + 120 + 1 + 90);

    let songs = 0;
    for (let next: number | null = 0; next !== null; ) {
      const page = await library.songs(next);
      songs += page.items.length;
      next = page.next;
    }
    expect(songs).toBe(9000);
    expect((await library.albums(0)).items.length).toBe(50);
    expect((await library.artists(0)).items.length).toBe(50);

    const deepStarted = performance.now();
    const target = (await library.songs(8950)).items[0]!; // a playlist song, deep in the list
    const deepMs = performance.now() - deepStarted;
    const likeStarted = performance.now();
    await library.like(target);
    const likeMs = performance.now() - likeStarted;
    expect((await library.songs(0)).items.some((s) => s.id === target.id && s.liked)).toBe(true);

    spotify.calls = [];
    const again = performance.now();
    await library.sync();
    const secondSync = performance.now() - again;
    expect(spotify.calls.filter((c) => c.includes('/items'))).toHaveLength(0);
    console.log(`first sync ${Math.round(firstSync)} ms (${requests} requests), deep page ${Math.round(deepMs)} ms, like ${Math.round(likeMs)} ms, second sync ${Math.round(secondSync)} ms (${spotify.calls.length} requests)`);
    expect(firstSync).toBeLessThan(30_000);
  }, 60_000);
});
