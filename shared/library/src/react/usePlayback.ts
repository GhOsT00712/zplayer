import { useEffect, useRef, useState } from 'react';
import { mapSong, type RawTrack } from '../core/spotify/mappers';
import type { Song } from '../core/model';
import type { PlaybackState } from '../core/playback/engine';
import { useLibraryContext } from './LibraryProvider';

/**
 * The current playback state, with a position that keeps moving between engine updates. It also
 * watches the current song and records each change in history, so neither app writes history itself.
 */
export function usePlayback(tickMs = 250) {
  const { engine, library, transport } = useLibraryContext();
  const [state, setState] = useState<PlaybackState>(() => engine.getState());
  const [now, setNow] = useState(() => performance.now());
  const base = useRef({ position: state.positionMs, at: performance.now() });
  const lastSong = useRef<string | undefined>(undefined);

  useEffect(() => {
    const read = () => {
      const next = engine.getState();
      base.current = { position: next.positionMs, at: performance.now() };
      setState(next);
    };
    read();
    return engine.subscribe(read);
  }, [engine]);

  useEffect(() => {
    if (!state.playing) return;
    const timer = setInterval(() => setNow(performance.now()), tickMs);
    return () => clearInterval(timer);
  }, [state.playing, tickMs]);

  // A song another device is playing can arrive without its cover (or with one that never loads):
  // look it up once, so the art fills in live instead of after a restart.
  const [looked, setLooked] = useState<Song>();
  useEffect(() => {
    const current = state.song;
    if (!current || current.album.artwork || looked?.id === current.id) return;
    let live = true;
    void transport.call<RawTrack>(`/tracks/${encodeURIComponent(current.id)}`).then(
      track => { if (live && track?.id) setLooked(mapSong({ ...track, id: track.id })); }, () => {});
    return () => { live = false; };
  }, [state.song?.id, state.song?.album.artwork, transport, looked?.id]);

  const song = state.song && !state.song.album.artwork && looked?.id === state.song.id
    ? { ...state.song, album: { ...state.song.album, artwork: looked.album.artwork }, artists: state.song.artists.some(a => a.id.startsWith('name:')) ? looked.artists : state.song.artists }
    : state.song;
  useEffect(() => {
    if (!song || song.id === lastSong.current) return;
    lastSong.current = song.id;
    void library?.recordPlay(song);
  }, [song, library]);

  const live = state.playing ? base.current.position + (now - base.current.at) : base.current.position;
  const positionMs = Math.max(0, Math.min(live, song?.durationMs || live));
  return { state: { ...state, song, positionMs }, engine };
}
