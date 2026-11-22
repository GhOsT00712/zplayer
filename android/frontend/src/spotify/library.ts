// Spotify Web API items turned into the shapes the screens already use (../shared/data.ts), so the
// signed-off screens work unchanged with real music. Step 3 of A4 extends this to every screen.
import { coverArt, type MockAlbum, type MockSong } from '../shared/data';
import { spotify } from './spotify';

interface ApiImage { url: string; width?: number | null }
interface ApiArtist { id: string; name: string }
interface ApiAlbum { id: string; name: string; album_type?: string; release_date?: string; images?: ApiImage[]; artists?: ApiArtist[] }
export interface ApiTrack {
  id: string | null; uri: string; name: string; duration_ms: number; track_number?: number;
  artists: ApiArtist[]; album: ApiAlbum; is_playable?: boolean; type?: string;
}

/** A real song: the screens' song shape plus what playback needs. */
export interface SpotifySong extends MockSong {
  uri: string;
  /** The album or playlist it was picked from, and its place there. */
  context?: string;
  contextIndex?: number;
}

const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Spotify's app reports art as spotify:image:<id>; the web address of the same image. */
export const imageUrl = (raw: string) => raw.startsWith('spotify:image:') ? `https://i.scdn.co/image/${raw.slice(14)}` : raw;

export function toSong(track: ApiTrack, context?: { uri: string; index: number }): SpotifySong {
  const id = track.id ?? track.uri;
  const art = track.album?.images?.[0]?.url ?? coverArt(hash(track.album?.id ?? id));
  const firstArtist = track.artists[0] ?? { id: 'unknown', name: 'Unknown artist' };
  const album: MockAlbum = {
    id: track.album?.id ?? id,
    title: track.album?.name ?? '',
    artist: { id: firstArtist.id, name: firstArtist.name, genres: [] },
    kind: track.album?.album_type === 'single' ? 'single' : 'album',
    year: Number.parseInt(track.album?.release_date ?? '', 10) || 0,
    art,
    tracks: [],
  };
  return {
    id, uri: track.uri, title: track.name, artist: track.artists.map(a => a.name).join(', '),
    album, number: track.track_number ?? 0, durationMs: track.duration_ms,
    context: context?.uri, contextIndex: context?.index,
  };
}

/** Your liked songs, newest first (one page of 50 for now). */
export async function likedSongs(userId: string): Promise<SpotifySong[]> {
  const page = await spotify.api<{ items: { track: ApiTrack | null }[] }>('/me/tracks?limit=50');
  return page.items.flatMap(item => item.track && item.track.type !== 'episode'
    ? [{ ...toSong(item.track), context: `spotify:user:${userId}:collection` }] : []);
}

/** Recently played songs, newest first, without repeats. */
export async function recentlyPlayed(): Promise<SpotifySong[]> {
  const page = await spotify.api<{ items: { track: ApiTrack | null }[] }>('/me/player/recently-played?limit=30');
  const seen = new Set<string>();
  return page.items.flatMap(item => {
    if (!item.track || item.track.type === 'episode' || seen.has(item.track.uri)) return [];
    seen.add(item.track.uri);
    return [toSong(item.track)];
  });
}

/** One of your playlists. Spotify lists the songs only for playlists you own or collaborate on. */
export interface RealPlaylist {
  id: string; uri: string; title: string; art: string; owner: string; ownerId: string;
  collaborative: boolean; count: number;
}
interface ApiPlaylist {
  id: string; uri: string; name: string; images?: ApiImage[] | null; collaborative?: boolean;
  owner?: { id?: string; display_name?: string }; tracks?: { total?: number }; items?: { total?: number };
}
const toPlaylist = (p: ApiPlaylist): RealPlaylist => ({
  id: p.id, uri: p.uri, title: p.name, owner: p.owner?.display_name ?? '', ownerId: p.owner?.id ?? '',
  collaborative: !!p.collaborative, count: p.items?.total ?? p.tracks?.total ?? 0,
  art: p.images?.[0]?.url ?? coverArt(hash(p.id)),
});

export async function myPlaylists(): Promise<RealPlaylist[]> {
  const page = await spotify.api<{ items: (ApiPlaylist | null)[] }>('/me/playlists?limit=50');
  return page.items.flatMap(p => p ? [toPlaylist(p)] : []);
}

/** A playlist and, when Spotify allows it (yours or collaborative), its songs. */
export async function playlist(id: string, userId: string): Promise<{ playlist: RealPlaylist; songs: SpotifySong[] | null }> {
  const p = toPlaylist(await spotify.api<ApiPlaylist>(`/playlists/${encodeURIComponent(id)}`));
  if (p.ownerId !== userId && !p.collaborative) return { playlist: p, songs: null };
  const page = await spotify.api<{ items: ({ item?: ApiTrack | null; track?: ApiTrack | null } | null)[] }>(
    `/playlists/${encodeURIComponent(id)}/items?limit=100`);
  const songs = page.items.flatMap((row, index) => {
    const track = row?.item ?? row?.track;
    return track && track.type !== 'episode' && track.uri ? [toSong(track, { uri: p.uri, index })] : [];
  });
  return { playlist: p, songs };
}

/** An album you saved, or one shown on an artist's page. */
export interface RealAlbum { id: string; uri: string; title: string; artist: string; artistId: string; art: string; year: number; kind: 'album' | 'single'; count: number }
interface ApiFullAlbum extends ApiAlbum { uri: string; total_tracks?: number; tracks?: { items: Omit<ApiTrack, 'album'>[] } }
const toAlbum = (a: ApiFullAlbum): RealAlbum => ({
  id: a.id, uri: a.uri, title: a.name, artist: a.artists?.map(x => x.name).join(', ') ?? '', artistId: a.artists?.[0]?.id ?? '',
  art: a.images?.[0]?.url ?? coverArt(hash(a.id)), year: Number.parseInt(a.release_date ?? '', 10) || 0,
  kind: a.album_type === 'single' ? 'single' : 'album', count: a.total_tracks ?? 0,
});

export async function savedAlbums(): Promise<RealAlbum[]> {
  const page = await spotify.api<{ items: { album: ApiFullAlbum }[] }>('/me/albums?limit=50');
  return page.items.map(item => toAlbum(item.album));
}

/** An album and its songs, numbered, each knowing its place on the album. */
export async function album(id: string): Promise<{ album: RealAlbum; songs: SpotifySong[] }> {
  const a = await spotify.api<ApiFullAlbum>(`/albums/${encodeURIComponent(id)}`);
  const info = toAlbum(a);
  const songs = (a.tracks?.items ?? []).map((t, index) => toSong({ ...t, album: a }, { uri: a.uri, index }));
  return { album: info, songs };
}

/** An artist you follow, or one found in search. */
export interface RealArtist { id: string; uri: string; name: string; art: string; genres: string[] }
interface ApiFullArtist { id: string; uri: string; name: string; images?: ApiImage[]; genres?: string[] }
const toArtist = (a: ApiFullArtist): RealArtist => ({
  id: a.id, uri: a.uri, name: a.name, genres: a.genres ?? [], art: a.images?.[0]?.url ?? coverArt(hash(a.id)),
});

export async function followedArtists(): Promise<RealArtist[]> {
  const page = await spotify.api<{ artists: { items: ApiFullArtist[] } }>('/me/following?type=artist&limit=50');
  return page.artists.items.map(toArtist);
}

/** An artist, their albums and their singles (no top songs or related artists in Development Mode). */
export async function artist(id: string): Promise<{ artist: RealArtist; albums: RealAlbum[]; singles: RealAlbum[] }> {
  const [a, releases] = await Promise.all([
    spotify.api<ApiFullArtist>(`/artists/${encodeURIComponent(id)}`),
    spotify.api<{ items: ApiFullAlbum[] }>(`/artists/${encodeURIComponent(id)}/albums?include_groups=album,single&limit=40`),
  ]);
  const all = releases.items.map(toAlbum);
  return { artist: toArtist(a), albums: all.filter(r => r.kind === 'album'), singles: all.filter(r => r.kind === 'single') };
}

/** Search: 10 of each kind per page (Spotify's Development Mode limit). */
export async function search(query: string) {
  const params = new URLSearchParams({ q: query, type: 'track,album,artist,playlist', limit: '10' });
  const r = await spotify.api<{
    tracks?: { items: (ApiTrack | null)[] }; albums?: { items: (ApiFullAlbum | null)[] };
    artists?: { items: (ApiFullArtist | null)[] }; playlists?: { items: (ApiPlaylist | null)[] };
  }>(`/search?${params}`);
  return {
    songs: (r.tracks?.items ?? []).flatMap(t => t ? [toSong(t)] : []),
    albums: (r.albums?.items ?? []).flatMap(a => a ? [toAlbum(a)] : []),
    artists: (r.artists?.items ?? []).flatMap(a => a ? [toArtist(a)] : []),
    playlists: (r.playlists?.items ?? []).flatMap(p => p ? [toPlaylist(p)] : []),
  };
}

/** Spotify Connect devices: this phone's Spotify app, speakers, computers… */
export interface RealDevice { id: string; name: string; type: string; active: boolean; restricted: boolean }
export async function devices(): Promise<RealDevice[]> {
  const r = await spotify.api<{ devices: { id: string | null; name: string; type: string; is_active: boolean; is_restricted: boolean }[] }>('/me/player/devices');
  return r.devices.flatMap(d => d.id ? [{ id: d.id, name: d.name, type: d.type.toLowerCase(), active: d.is_active, restricted: d.is_restricted }] : []);
}
export const transferTo = (id: string) => spotify.api('/me/player', 'PUT', { device_ids: [id], play: true });

/** Saved, liked or followed: albums, songs and artists all live in /me/library. */
export async function inLibrary(uri: string): Promise<boolean> {
  const r = await spotify.api<boolean[]>(`/me/library/contains?uris=${encodeURIComponent(uri)}`);
  return !!r?.[0];
}
export const setInLibrary = (uri: string, on: boolean) =>
  spotify.api(`/me/library?uris=${encodeURIComponent(uri)}`, on ? 'PUT' : 'DELETE');

/** The songs Spotify will play next (the Spotify app must be the active player). */
export async function queue(): Promise<SpotifySong[]> {
  const result = await spotify.api<{ queue?: ApiTrack[] } | null>('/me/player/queue');
  return (result?.queue ?? []).filter(t => t.type !== 'episode').slice(0, 20).map(t => toSong(t));
}
