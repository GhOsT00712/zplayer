// Copied from design-mock/src/mock/usePlayer.ts by scripts/sync-theme.mjs. Do not edit here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MockSong } from './data';

export type Repeat = 'off' | 'all' | 'one';

/** In-memory fake player: no audio, position advances in real time while "playing". */
export function usePlayer() {
  const [queue, setQueue] = useState<MockSong[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPosition] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('off');
  const [volume, setVolume] = useState(.7);
  const [liked, setLiked] = useState<Set<string>>(() => new Set(['s1', 's4']));
  const state = useRef({ queue, index, repeat });
  state.current = { queue, index, repeat };

  const current = queue[index];

  const advance = useCallback((manual: boolean) => {
    const { queue: q, index: i, repeat: r } = state.current;
    if (!q.length) return;
    if (!manual && r === 'one') { setPosition(0); return; }
    if (i + 1 < q.length) { setIndex(i + 1); setPosition(0); return; }
    if (r === 'all' || manual) { setIndex(0); setPosition(0); return; }
    setPlaying(false);
    setPosition(0);
  }, []);

  useEffect(() => {
    if (!playing || !current) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setPosition(p => {
        if (p + delta >= current.durationMs) { queueMicrotask(() => advance(false)); return current.durationMs; }
        return p + delta;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [playing, current, advance]);

  const playList = useCallback((list: MockSong[], start: number) => {
    setQueue(list);
    setIndex(start);
    setPosition(0);
    setPlaying(true);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle(on => {
      if (!on) {
        // Shuffle everything after the current song; the current song keeps playing.
        setQueue(q => {
          const { index: i } = state.current;
          const rest = q.slice(i + 1);
          for (let j = rest.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [rest[j], rest[k]] = [rest[k]!, rest[j]!];
          }
          return [...q.slice(0, i + 1), ...rest];
        });
      }
      return !on;
    });
  }, []);

  return useMemo(() => ({
    current,
    queue,
    index,
    upNext: queue.slice(index + 1, index + 6),
    playing,
    positionMs,
    shuffle,
    repeat,
    volume,
    liked: current ? liked.has(current.id) : false,
    playList,
    toggle: () => current && setPlaying(p => !p),
    next: () => advance(true),
    previous: () => {
      if (positionMs > 3000 || index === 0) setPosition(0);
      else { setIndex(index - 1); setPosition(0); }
    },
    seek: (ms: number) => setPosition(Math.max(0, Math.min(ms, current?.durationMs ?? 0))),
    jumpTo: (offset: number) => { setIndex(index + 1 + offset); setPosition(0); setPlaying(true); },
    toggleShuffle,
    /** Shuffle-play a list: shuffle on, random order, start at the top. */
    playShuffled: (list: MockSong[]) => {
      const order = [...list];
      for (let j = order.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [order[j], order[k]] = [order[k]!, order[j]!];
      }
      setShuffle(true);
      playList(order, 0);
    },
    cycleRepeat: () => setRepeat(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'),
    setVolume,
    toggleLike: () => current && setLiked(set => {
      const next = new Set(set);
      if (next.has(current.id)) next.delete(current.id); else next.add(current.id);
      return next;
    }),
  }), [current, queue, index, playing, positionMs, shuffle, repeat, volume, liked, playList, advance, toggleShuffle]);
}

export type Player = ReturnType<typeof usePlayer>;
