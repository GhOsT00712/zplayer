import { useCallback, useEffect, useState } from 'react';
import type { Playlist } from '../music';

const KEY = 'zplayer-pins';

function load(): Playlist[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((p): p is Playlist => !!p && typeof p.id === 'string' && typeof p.title === 'string') : [];
  } catch {
    return [];
  }
}

/** Playlists pinned to home, newest first. Kept on this computer only (Spotify has no pins). */
export function usePins() {
  const [pins, setPins] = useState<Playlist[]>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(pins)); } catch { /* storage unavailable */ } }, [pins]);
  const isPinned = useCallback((id: string) => pins.some(p => p.id === id), [pins]);
  const togglePin = useCallback((playlist: Playlist) => setPins(list => list.some(p => p.id === playlist.id)
    ? list.filter(p => p.id !== playlist.id) : [playlist, ...list]), []);
  return { pins, isPinned, togglePin };
}
