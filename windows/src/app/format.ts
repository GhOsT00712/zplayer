import type { Song } from '@zplayer/library';
import type { TrackInfo } from '@zplayer/theme';

export const artistNames = (song: Pick<Song, 'artists'>) => song.artists.map(artist => artist.name).join(', ');

/** Flat grey square with a note, for anything Spotify returns without artwork. */
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2a2a2a"/>'
  + '<path d="M44 30v32a9 9 0 1 1-5-8V30l26-6v8z" fill="#6b6b6b"/></svg>',
)}`;
export const artOf = (url?: string) => url || PLACEHOLDER;

export function trackInfo(song: Song): TrackInfo {
  return {
    title: song.title,
    artist: artistNames(song) || 'unknown artist',
    album: song.album.name,
    art: artOf(song.album.artwork),
    durationMs: song.durationMs,
  };
}

/** HTTP status carried by a Spotify API error, if any. */
export function statusOf(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}
