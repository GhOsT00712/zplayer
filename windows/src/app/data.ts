import { useCallback, useEffect, useRef, useState } from 'react';
import type { Playback, Page, Track } from '../music';
import type { DataState, TrackInfo } from '@zplayer/theme';

/** HTTP status carried by a Spotify API error, if any. */
export function statusOf(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

export const artistNames = (track: Track) => track.artists.map(artist => artist.name).join(', ');

/** Flat grey square with a note, for anything Spotify returns without artwork. */
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2a2a2a"/>'
  + '<path d="M44 30v32a9 9 0 1 1-5-8V30l26-6v8z" fill="#6b6b6b"/></svg>',
)}`;
export const artOf = (url?: string) => url || PLACEHOLDER;

export function trackInfo(track: Track): TrackInfo {
  return {
    title: track.title,
    artist: artistNames(track) || 'unknown artist',
    album: track.album?.name ?? '',
    art: artOf(track.album?.artwork),
    durationMs: track.durationMs,
  };
}

/**
 * Loads a Spotify list page by page. `key` identifies the list: change it to start over.
 * Gives the theme's DataView state (loading, empty, error, rate-limited) plus "more".
 */
export function usePaged<T>(fetchPage: (offset: number) => Promise<Page<T>>, key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [state, setState] = useState<DataState>('loading');
  const [status, setStatus] = useState<number>();
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const session = useRef(0);

  const load = useCallback(async (offset: number) => {
    const mine = session.current;
    if (offset === 0) setState('loading'); else setLoadingMore(true);
    try {
      const page = await fetchRef.current(offset);
      if (mine !== session.current) return;
      setItems(previous => {
        const all = offset === 0 ? page.items : [...previous, ...page.items];
        setState(all.length ? 'normal' : 'empty');
        return all;
      });
      setNext(page.nextOffset);
    } catch (error) {
      if (mine !== session.current) return;
      setStatus(statusOf(error));
      if (offset === 0) setState(statusOf(error) === 429 ? 'rate-limited' : 'error');
    } finally {
      if (mine === session.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    session.current++;
    setItems([]);
    setNext(null);
    setStatus(undefined);
    void load(0);
  }, [key, load]);

  return {
    items, state, status, loadingMore,
    hasMore: next !== null,
    more: () => { if (next !== null && !loadingMore) void load(next); },
    retry: () => { session.current++; void load(0); },
  };
}

/** Playback position that keeps moving between Spotify's state updates (every few seconds). */
export function useLivePosition(playback?: Playback) {
  const [now, setNow] = useState(() => performance.now());
  const base = useRef({ position: 0, at: performance.now() });
  const position = playback?.positionMs ?? 0;
  const trackId = playback?.track?.id;
  useEffect(() => { base.current = { position, at: performance.now() }; }, [position, trackId, playback?.playing]);
  useEffect(() => {
    if (!playback?.playing) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [playback?.playing]);
  if (!playback) return 0;
  const live = playback.playing ? base.current.position + (now - base.current.at) : base.current.position;
  return Math.max(0, Math.min(live, playback.track?.durationMs ?? live));
}
