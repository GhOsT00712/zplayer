// Copied from design-mock/src/mock/data.ts by scripts/sync-theme.mjs. Do not edit here.
// Invented library for the design mock. All names are made up; artwork is generated flat SVG.
// Deterministic (seeded), so screenshots stay comparable between runs.

export interface MockArtist { id: string; name: string; image?: string; genres: string[] }
export interface MockAlbum {
  id: string; title: string; artist: MockArtist; kind: 'album' | 'single'; year: number; art: string; tracks: MockSong[];
}
export interface MockSong { id: string; title: string; artist: string; album: MockAlbum; number: number; durationMs: number }
export interface MockPlaylist {
  id: string; title: string; owner: string; owned: boolean; count: number; art: string; tracks: MockSong[];
}

const palettes: [string, string, string][] = [
  ['#e4003a', '#ffd23f', '#1a1a1a'], ['#0f4c81', '#f2a900', '#f4f1ea'], ['#1b998b', '#f7f7f2', '#2d3047'],
  ['#2d1e2f', '#e94f37', '#f6f7eb'], ['#f4d35e', '#0d3b66', '#ee964b'], ['#6a0572', '#ff9a00', '#fbeaff'],
  ['#00a6a6', '#efca08', '#08415c'], ['#f15bb5', '#00bbf9', '#fee440'], ['#3a3335', '#d81e5b', '#fdf0d5'],
  ['#9bc53d', '#2b2d42', '#e8e9ed'], ['#ff6b35', '#004e89', '#efefd0'], ['#f0ece2', '#111111', '#e63946'],
];

/** Flat, seeded cover art: one background, one bold shape, one accent mark. No gradients. */
export function coverArt(seed: number): string {
  const [bg, fg, mark] = palettes[seed % palettes.length]!;
  const shapes = [
    `<circle cx="62" cy="40" r="34" fill="${fg}"/><rect x="10" y="78" width="46" height="6" fill="${mark}"/>`,
    `<rect x="0" y="18" width="100" height="14" fill="${fg}"/><rect x="0" y="44" width="100" height="14" fill="${fg}"/><rect x="0" y="70" width="100" height="14" fill="${mark}"/>`,
    `<polygon points="0,100 56,22 100,100" fill="${fg}"/><circle cx="78" cy="24" r="9" fill="${mark}"/>`,
    `<circle cx="0" cy="0" r="58" fill="${fg}"/><circle cx="100" cy="100" r="44" fill="${mark}"/>`,
    `<rect x="18" y="18" width="64" height="64" fill="none" stroke="${fg}" stroke-width="10"/><rect x="40" y="40" width="20" height="20" fill="${mark}"/>`,
    `<path d="M0 64 Q25 40 50 64 T100 64 V100 H0Z" fill="${fg}"/><circle cx="30" cy="28" r="12" fill="${mark}"/>`,
  ];
  // palette, shape and a quarter-turn vary independently, so every album in the mock looks different
  const shape = shapes[(seed + Math.floor(seed / palettes.length) * 5 + 3) % shapes.length];
  const turn = Math.floor(seed / 6) % 4 * 90;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect width="100" height="100" fill="${bg}"/><g transform="rotate(${turn} 50 50)">${shape}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Wide abstract "artist photo" stand-in: large overlapping flat shapes. */
function artistImage(seed: number): string {
  const [bg, fg, mark] = palettes[(seed * 5 + 2) % palettes.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice"><rect width="160" height="100" fill="${bg}"/>`
    + `<circle cx="${40 + (seed * 13) % 80}" cy="62" r="52" fill="${fg}"/><circle cx="${120 - (seed * 7) % 60}" cy="30" r="22" fill="${mark}"/>`
    + `<rect x="0" y="86" width="160" height="14" fill="${mark}" opacity=".85"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = seeded(2026);
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const first = ['Harbour', 'Signal', 'Slow', 'Kite', 'Glass', 'Static', 'Paper', 'Salt', 'Yellow', 'Wolf', 'Lantern',
  'Night', 'Polaroid', 'Cinder', 'Copper', 'Weather', 'Open', 'Northern', 'Blue', 'Silver', 'Quiet', 'Hollow',
  'Golden', 'Velvet', 'Electric', 'Winter', 'Summer', 'Midnight', 'Distant', 'Low'];
const second = ['Lights', 'Fire', 'Orbit', 'Season', 'Rain', 'Bloom', 'Hour', 'Moon', 'Walk', 'Drive', 'Wire', 'Vane',
  'Water', 'Crown', 'Lines', 'Hearts', 'Rooms', 'Roads', 'Tides', 'Echoes', 'Fields', 'Ghosts', 'Letters', 'Shapes',
  'Waves', 'Stars', 'Gardens', 'Signals', 'Weather', 'Static'];
const songTitle = () => rand() < .18 ? pick(second) : `${pick(first)} ${pick(second)}`;

const genrePool = ['indie pop', 'dream pop', 'synthwave', 'folk', 'electronic', 'alt rock', 'ambient', 'chillwave', 'singer-songwriter'];
export const artists: MockArtist[] = ['Amber Coast', 'Low Meridian', 'Northbound Kites', 'Ottoline', 'Paper Satellites',
  'Quiet Harbour', 'Rhea Vance', 'Saltwater Hymns', 'The Glass Orchard', 'Velvet Static', 'Wren & Wolfe', 'Yellow Hours']
  .map((name, i) => ({
    id: `ar${i}`,
    name,
    image: i === 6 ? undefined : artistImage(i), // one artist without an image (edge case)
    genres: [genrePool[i % genrePool.length]!, genrePool[(i + 4) % genrePool.length]!],
  }));

const albumNames = ['Tidal Lines', 'Neon Parish', 'Small Hours', 'Afterglow Radio', 'Cold Weather Songs', 'Lanterns',
  'Field Notes', 'Satellite Hearts', 'Undertow', 'Glasshouse', 'Paper Moons', 'Driftwood', 'Second Light',
  'Harbour Sessions', 'North of Here', 'Signal Lost', 'Weather Report', 'Quiet Machines'];

export const albums: MockAlbum[] = [];
let albumSeed = 0;
let songSeed = 0;
artists.forEach((artist, i) => {
  const albumCount = i % 3 === 0 ? 2 : 1;
  const plan: MockAlbum['kind'][] = [...Array(albumCount).fill('album'), 'single'];
  plan.forEach(kind => {
    const title = kind === 'album' ? albumNames[albumSeed % albumNames.length]! : songTitle();
    const album: MockAlbum = {
      id: `al${albumSeed}`, title, artist, kind, year: 2012 + (albumSeed * 5) % 14, art: coverArt(albumSeed), tracks: [],
    };
    albumSeed++;
    const count = kind === 'album' ? between(7, 12) : between(1, 2);
    for (let n = 1; n <= count; n++) {
      album.tracks.push({
        id: `s${songSeed++}`,
        title: kind === 'single' && n === 1 ? title : songTitle(),
        artist: artist.name,
        album,
        number: n,
        durationMs: between(128, 330) * 1000,
      });
    }
    albums.push(album);
  });
});
// Edge case: one very long title.
albums[3]!.tracks[2]!.title = 'A Very Long Song Title That Keeps Going Past The Edge Of The Row And Then Some';

export const allSongs: MockSong[] = albums.flatMap(album => album.tracks);

/** Liked songs, newest first (every third track). */
export const likedSongs: MockSong[] = allSongs.filter((_, i) => i % 3 === 1).reverse();

const sample = (n: number) => {
  const pool = [...allSongs];
  const out: MockSong[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  return out;
};

export const playlists: MockPlaylist[] = [
  { title: 'late night', owned: true, size: 24 },
  { title: 'focus', owned: true, size: 32 },
  { title: 'road trip 2026', owned: true, size: 18 },
  { title: 'gym', owned: true, size: 15 },
  { title: 'quiet mornings', owned: true, size: 0 }, // empty playlist (edge case)
  { title: 'liked from radio', owned: true, size: 27 },
  { title: 'friday finds', owned: false, size: 30, owner: 'Mira K.' }, // not yours: Spotify hides its items
  { title: 'deep focus beats', owned: false, size: 50, owner: 'Spotify' },
].map((p, i) => {
  const tracks = p.owned ? sample(p.size) : [];
  return {
    id: `pl${i}`, title: p.title, owned: p.owned, owner: p.owned ? 'you' : p.owner!, count: p.size,
    art: tracks[0]?.album.art ?? coverArt(i + 40), tracks,
  };
});

/**
 * Covers for the full-screen mosaic: the albums of your liked songs and of the songs in your playlists,
 * plus each playlist's own art. Each cover appears once; the mosaic spreads them over the wall.
 */
export const mosaicCovers: string[] = [...new Set([
  ...likedSongs.map(song => song.album.art),
  ...playlists.flatMap(p => [p.art, ...p.tracks.map(song => song.album.art)]),
])];

export const findArtist = (id: string) => artists.find(a => a.id === id);
export const artistByName = (name: string) => artists.find(a => a.name === name);
export const findAlbum = (id: string) => albums.find(a => a.id === id);
export const findPlaylist = (id: string) => playlists.find(p => p.id === id);
export const totalMinutes = (songs: MockSong[]) => Math.round(songs.reduce((sum, s) => sum + s.durationMs, 0) / 60000);

// ---------- quickplay, search and devices ----------

/** Recently played, newest first (Spotify returns up to 50; the mock keeps 30). */
export const recentlyPlayed: MockSong[] = Array.from({ length: 30 }, (_, i) => allSongs[(i * 7 + 3) % allSongs.length]!);

/** Top tracks and artists (short term). */
export const topTracks: MockSong[] = Array.from({ length: 20 }, (_, i) => allSongs[(i * 11 + 5) % allSongs.length]!);
export const topArtists: MockArtist[] = [4, 0, 9, 2, 7, 11, 5, 1].map(i => artists[i]!);

/** "New" means new in your library: newest liked songs and saved albums, not new releases. */
export const newInLibrary = { songs: likedSongs.slice(0, 12), albums: [...albums].reverse().filter(a => a.kind === 'album').slice(0, 6) };

export type PinRef = { kind: 'album' | 'playlist' | 'artist'; id: string };
export const defaultPins: PinRef[] = [
  { kind: 'album', id: 'al0' }, { kind: 'playlist', id: 'pl0' }, { kind: 'artist', id: 'ar2' },
  { kind: 'album', id: 'al7' }, { kind: 'playlist', id: 'pl1' },
];

export interface MockDevice { id: string; name: string; type: string; inApp: boolean; restricted: boolean }
export const devices: MockDevice[] = [
  { id: 'dev-app', name: 'ZPLAYER', type: 'this app', inApp: true, restricted: false },
  { id: 'dev-speaker', name: 'Living room speaker', type: 'speaker', inApp: false, restricted: false },
  { id: 'dev-phone', name: 'Pixel phone', type: 'smartphone', inApp: false, restricted: false },
  { id: 'dev-tv', name: 'Bedroom TV', type: 'tv', inApp: false, restricted: true },
];

export const account = { name: 'Alex Rivera', id: 'mock-user-01' };

const contains = (text: string, query: string) => text.toLowerCase().includes(query.toLowerCase());
export function searchLibrary(query: string) {
  const q = query.trim();
  if (!q) return { songs: [], albums: [], artists: [], playlists: [] };
  return {
    songs: allSongs.filter(s => contains(s.title, q) || contains(s.artist, q)),
    albums: albums.filter(a => contains(a.title, q) || contains(a.artist.name, q)),
    artists: artists.filter(a => contains(a.name, q)),
    playlists: playlists.filter(p => contains(p.title, q)),
  };
}
