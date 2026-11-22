import type { CSSProperties, ReactNode } from 'react';
import { HeartIcon } from './Icons';
import './lists.css';

const stagger = (index: number) => ({ '--i': Math.min(index, 12) }) as CSSProperties;

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return <ul className="list stagger" aria-label={label}>{children}</ul>;
}

/**
 * One list row. Variants by content: big text only (artists), art + two lines (songs, playlists),
 * or a track number instead of art (album track lists).
 */
export function Row({ index, title, meta, art, number, trailing, large, active, disabled, liked, onLike, onClick }: {
  index: number;
  title: string;
  meta?: ReactNode;
  art?: string;
  number?: number;
  trailing?: ReactNode;
  large?: boolean;
  active?: boolean;
  /** Greyed out and not clickable (for example a song Spotify can't play in your region). */
  disabled?: boolean;
  /** Heart state. With `onLike` the row shows a heart button; with only `liked` it shows a small mark. */
  liked?: boolean;
  onLike?: () => void;
  onClick: () => void;
}) {
  return <li style={stagger(index)} className={onLike ? 'has-heart' : undefined}>
    <button type="button" className={`row${active ? ' is-active' : ''}`} onClick={onClick} disabled={disabled}
      aria-current={active ? 'true' : undefined}>
      {number !== undefined && <span className="row-num">{number}</span>}
      {art && <img className="row-art" src={art} alt="" />}
      <span className="row-copy">
        <span className={`${large ? 't-row-lg' : 't-row'} row-title truncate`}>{title}</span>
        {meta && <span className="t-meta truncate">{meta}</span>}
      </span>
      {liked && !onLike && <span className="row-liked" aria-label="liked"><HeartIcon filled /></span>}
      {trailing && <span className="t-meta row-trailing">{trailing}</span>}
    </button>
    {onLike && <button type="button" className={`row-heart${liked ? ' is-liked' : ''}`} onClick={onLike}
      aria-label={liked ? 'unlike' : 'like'} aria-pressed={!!liked} data-no-swipe><HeartIcon filled={liked} /></button>}
  </li>;
}

/** The last row of an infinite list: shows while the next page loads, or a retry when it failed. */
export function LoadingRow({ failed, onRetry, sentinelRef }: { failed?: boolean; onRetry?: () => void; sentinelRef?: (node: HTMLLIElement | null) => void }) {
  return failed
    ? <li className="loading-row" ref={sentinelRef}><button type="button" className="text-link" onClick={onRetry}>couldn't load more. try again</button></li>
    : <li className="loading-row" aria-live="polite" ref={sentinelRef}><span className="t-meta">loading…</span></li>;
}

export function TileGrid({ children, label }: { children: ReactNode; label?: string }) {
  return <ul className="tile-grid stagger" aria-label={label}>{children}</ul>;
}

/** Square art with title and caps meta underneath. */
export function Tile({ index, art, title, meta, onClick }: {
  index: number; art: string; title: string; meta?: string; onClick: () => void;
}) {
  return <li style={stagger(index)}>
    <button type="button" className="tile" onClick={onClick}>
      <img className="tile-art" src={art} alt="" />
      <span className="t-row tile-title truncate">{title}</span>
      {meta && <span className="t-meta truncate">{meta}</span>}
    </button>
  </li>;
}

/** One lowercase sentence for empty lists. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** A short explanation block, for example a playlist whose songs Spotify won't list. */
export function Notice({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <div className="notice">
    <p className="notice-title">{title}</p>
    <p className="notice-body">{children}</p>
    {actions && <div className="actions">{actions}</div>}
  </div>;
}
