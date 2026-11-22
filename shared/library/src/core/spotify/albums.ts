import type { Album, Song } from '../model';
import type { Transport } from '../transport';
import { isSong, mapSong, pickImage, type RawAlbum, type RawPage, type RawTrack } from './mappers';

interface RawFullAlbum extends RawAlbum {
  tracks: RawPage<RawTrack> & { next?: string | null };
}

export interface FullAlbum {
  album: Omit<Album, 'songCount'>;
  songs: Song[];
}

/** The whole album in track order: `GET /albums/{id}`, then more pages for albums over 50 songs. */
export async function fetchFullAlbum(transport: Transport, id: string): Promise<FullAlbum> {
  const raw = await transport.call<RawFullAlbum>(`/albums/${encodeURIComponent(id)}`);
  const tracks = [...raw.tracks.items];
  let next = raw.tracks.next ?? null;
  while (next) {
    const url = new URL(next);
    const page: RawPage<RawTrack> = await transport.call(`${url.pathname.replace(/^\/v1/, '')}${url.search}`);
    tracks.push(...page.items);
    next = page.next ?? null;
  }
  const songs = tracks.filter(isSong).map((track) => mapSong(track, raw));
  return {
    album: {
      id,
      name: raw.name,
      artwork: pickImage(raw.images),
      artists: (raw.artists ?? []).filter((a) => a.id).map((a) => ({ id: a.id!, name: a.name })),
    },
    songs,
  };
}
