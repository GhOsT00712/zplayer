import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BackButton, RoundButton } from './Controls';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from './Icons';
import type { PlayerControls, TrackInfo } from './Player';
import './mosaic.css';

/**
 * Full-screen mode: a wall of album covers in mixed sizes, greyscale and tinted with the accent
 * (dark or light with the theme), with the current song in the bottom-left corner. Covers keep flipping to new ones at random. The current album
 * fills the largest tiles.
 * Controls, the back button and the pointer hide after a few idle seconds.
 */

interface Tile { x: number; y: number; span: number; cover: number }
const NOW = -1; // tile shows the current album

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Tiles that touch tile `t` (sides or corners). */
const touching = (tiles: Tile[], t: Tile) => tiles.filter(o => o !== t
  && o.x < t.x + t.span + 1 && t.x < o.x + o.span + 1 && o.y < t.y + t.span + 1 && t.y < o.y + o.span + 1);

/**
 * The cover to show next: never the same as a touching tile, and the one least seen on the wall
 * so far, so every liked or playlisted album gets its turn before any repeats.
 */
function pickCover(tiles: Tile[], t: Tile, coverCount: number, rand: () => number, current = -2, avoid = -2) {
  // `avoid`: the playing album, which already fills the big tiles
  const near = new Set([...touching(tiles, t).map(o => o.cover), avoid]);
  const seen = new Array<number>(coverCount).fill(0);
  tiles.forEach(o => { if (o.cover >= 0 && o !== t) seen[o.cover]!++; });
  let best: number[] = []; let min = Infinity;
  for (let c = 0; c < coverCount; c++) {
    if (near.has(c) || c === current) continue;
    if (seen[c]! < min) { min = seen[c]!; best = [c]; } else if (seen[c] === min) best.push(c);
  }
  return best.length ? best[Math.floor(rand() * best.length)]! : Math.floor(rand() * coverCount);
}

/** Any cover except the tile's own, its neighbours' and the playing album's, chosen at random. */
function randomCover(tiles: Tile[], t: Tile, coverCount: number, avoid: number) {
  const skip = new Set([...touching(tiles, t).map(o => o.cover), t.cover, avoid]);
  const allowed = Array.from({ length: coverCount }, (_, c) => c).filter(c => !skip.has(c));
  return allowed.length ? allowed[Math.floor(Math.random() * allowed.length)]! : t.cover;
}

/** Packs squares of 1–4 cells into the grid with no holes. Deterministic for a given size. */
function packWall(cols: number, rows: number, coverCount: number, avoid: number): Tile[] {
  const rand = seeded(cols * 131 + rows);
  const used = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const fits = (x: number, y: number, s: number) => {
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      if (y + dy >= rows || x + dx >= cols || used[y + dy]![x + dx]) return false;
    }
    return true;
  };
  const tiles: Tile[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (used[y]![x]) continue;
    const roll = rand();
    let span = roll < .03 ? 4 : roll < .1 ? 3 : roll < .34 ? 2 : 1;
    while (span > 1 && !fits(x, y, span)) span--;
    for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) used[y + dy]![x + dx] = true;
    const tile: Tile = { x, y, span, cover: -2 };
    tiles.push(tile);
  }
  // The current album takes the two biggest tiles away from the bottom-left card.
  const big = tiles.map((t, i) => ({ t, i }))
    .filter(({ t }) => t.span >= 2 && !(t.x < cols * .4 && t.y > rows * .55))
    .sort((a, b) => b.t.span - a.t.span || a.i - b.i);
  big.slice(0, 2).forEach(({ i }) => { tiles[i]!.cover = NOW; });
  // Big tiles first, so the largest squares get the widest choice.
  [...tiles].sort((a, b) => b.span - a.span).forEach(t => { if (t.cover !== NOW) t.cover = pickCover(tiles, t, coverCount, rand, -2, avoid); });
  return tiles;
}

/** data-motion on <html>: "reduced" stops motion, "full" keeps it whatever the system says, unset follows the system. */
const reducedMotion = () => {
  const motion = document.documentElement.dataset.motion;
  return motion === 'reduced' || (motion !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** How to make the window full screen. The default uses the browser's Fullscreen API. */
export interface FullscreenAdapter {
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  /** Called when the platform leaves full screen by itself (Esc in a browser). Returns an unsubscribe. */
  onExternalExit?: (exit: () => void) => () => void;
}

const documentFullscreen: FullscreenAdapter = {
  enter: async () => { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); },
  exit: async () => { if (document.fullscreenElement) await document.exitFullscreen(); },
  onExternalExit: exit => {
    let entered = false;
    const onChange = () => { if (document.fullscreenElement) entered = true; else if (entered) exit(); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  },
};

export function Mosaic({ track, covers: source, controls, onClose, fullscreen = documentFullscreen }: {
  track: TrackInfo;
  /** Cover art to build the wall from (your liked songs' and playlists' albums). */
  covers: string[];
  controls: PlayerControls;
  onClose: () => void;
  fullscreen?: FullscreenAdapter;
}) {
  const covers = source.length ? source : [track.art];
  const { w, h } = useViewport();
  const cell = Math.round(Math.max(44, Math.min(96, w / 22)));
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  // The playing album stays out of the small tiles. Read through a ref so a song change
  // doesn't repack the wall; flips keep it out from then on.
  const playingRef = useRef(-2);
  playingRef.current = covers.indexOf(track.art);
  const initial = useMemo(() => packWall(cols, rows, covers.length, playingRef.current), [cols, rows, covers.length]);
  const [tiles, setTiles] = useState(initial);
  const [flipping, setFlipping] = useState<Set<number>>(() => new Set());
  const [idle, setIdle] = useState(false);
  useEffect(() => { setTiles(initial); }, [initial]);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  // Covers flip at random: a random tile, after a random pause (0.35–1.2 s), to a random cover that
  // differs from its neighbours and from the playing album. Several tiles can be mid-flip at once.
  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => { const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
    const flipOne = () => {
      const current = tilesRef.current;
      if (!reducedMotion() && current.length) {
        const i = Math.floor(Math.random() * current.length);
        if (current[i]!.cover !== NOW) {
          setFlipping(f => new Set(f).add(i));
          // swap the cover at the half-way point, when the tile is edge-on
          later(() => setTiles(now => {
            const next = now.slice();
            next[i] = { ...now[i]!, cover: randomCover(now, now[i]!, covers.length, playingRef.current) };
            return next;
          }), 350);
          later(() => setFlipping(f => { const n = new Set(f); n.delete(i); return n; }), 720);
        }
      }
      later(flipOne, 350 + Math.random() * 850);
    };
    later(flipOne, 900);
    return () => timers.forEach(window.clearTimeout);
  }, [covers.length]);

  // Hide the controls and pointer after 3 s without input.
  const idleTimer = useRef(0);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 3000);
  }, []);
  useEffect(() => {
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => { window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); window.clearTimeout(idleTimer.current); };
  }, [wake]);

  // Real full screen where the platform allows it; leaving it from outside closes the mode.
  useEffect(() => {
    const unsubscribe = fullscreen.onExternalExit?.(onClose);
    fullscreen.enter().catch(() => { /* not allowed here: stay in-window */ });
    return () => {
      unsubscribe?.();
      fullscreen.exit().catch(() => {});
    };
  }, [fullscreen, onClose]);

  const progress = track.durationMs ? controls.positionMs / track.durationMs : 0;

  return <div className={`mosaic${idle ? ' is-idle' : ''}`} role="dialog" aria-label="Full screen" style={{ '--cell': `${cell}px` } as CSSProperties}>
    <div className="mosaic-wall" aria-hidden="true">
      {tiles.map((tile, i) => {
        const now = tile.cover === NOW;
        const cls = `mosaic-tile${now ? ' is-now' : ''}${flipping.has(i) ? ' is-flip' : ''}`;
        return <div key={now ? `${i}-${track.art}` : i} className={cls}
          style={{ '--x': tile.x, '--y': tile.y, '--s': tile.span } as CSSProperties}>
          <img src={now ? track.art : covers[tile.cover]} alt="" draggable={false} />
        </div>;
      })}
    </div>
    <div className="mosaic-tint" />
    <div className="mosaic-shade" />

    <BackButton onClick={onClose} label="Exit full screen" />
    <span className="t-meta mosaic-hint">full screen · esc to exit</span>

    <section className="mosaic-card" key={track.title} aria-live="polite">
      <img className="mosaic-art" src={track.art} alt={`${track.album} cover`} />
      <div className="mosaic-copy">
        <span className="mosaic-artist truncate">{track.artist}</span>
        <span className="mosaic-album truncate">{track.album}</span>
        <span className="mosaic-title">{track.title}</span>
        <span className="mosaic-progress" style={{ '--p': progress } as CSSProperties} />
        <div className="mosaic-controls">
          <RoundButton label="previous" onClick={controls.onPrevious} size="sm"><PreviousIcon /></RoundButton>
          <RoundButton label={controls.playing ? 'pause' : 'play'} onClick={controls.onToggle} size="sm">
            {controls.playing ? <PauseIcon /> : <PlayIcon />}
          </RoundButton>
          <RoundButton label="next" onClick={controls.onNext} size="sm"><NextIcon /></RoundButton>
        </div>
      </div>
    </section>
  </div>;
}
