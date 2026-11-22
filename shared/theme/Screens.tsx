import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { BackButton } from './Controls';
import { BackIcon, SearchIcon } from './Icons';
import './screens.css';

const stagger = (index: number) => ({ '--i': Math.min(index, 12) }) as CSSProperties;

/* ---------- home: quickplay panorama ---------- */

export interface MenuEntry { label: string; onClick: () => void }

/** The app wordmark: a heavy accent Z, then PLAYER in the light display weight. (Not on home any more.) */
export function Wordmark({ name = 'ZPLAYER', className = '' }: { name?: string; className?: string }) {
  return <span className={`wordmark ${className}`} role="img" aria-label={name}>
    <span className="wordmark-z" aria-hidden="true">{name.slice(0, 1)}</span>
    <span aria-hidden="true">{name.slice(1)}</span>
  </span>;
}

/** One tile on home. `art` missing shows the label on a dark square; `icon` draws an accent tile (liked songs). */
export interface HomeTile { key: string; label: string; art?: string; icon?: ReactNode; big?: boolean; onClick: () => void }

/** A labelled cluster of tiles on home (pins, playlists, history). */
export interface HomeSection {
  title: string;
  tiles: HomeTile[];
  /** Heading in the accent colour (the first section). */
  accent?: boolean;
  /** Heading aligned to the right edge of its tiles, as for pins. */
  alignEnd?: boolean;
  /** Empty outlined squares to show after the tiles, so the cluster keeps its shape. */
  placeholders?: number;
  /** Short hint shown in an outlined box inside the cluster (for example how to pin). */
  hint?: string;
  /** Shown instead of tiles when there's nothing to show. */
  empty?: string;
}

function HomeTileButton({ tile, index }: { tile: HomeTile; index: number }) {
  const kind = tile.icon ? ' is-icon' : tile.art ? '' : ' is-text';
  return <button type="button" className={`qp-tile${tile.big ? ' is-big' : ''}${kind}`} style={stagger(index)}
    onClick={tile.onClick} title={tile.label} aria-label={tile.label}>
    {tile.icon ? <>{tile.icon}<span className="qp-tile-label">{tile.label}</span></>
      : tile.art ? <img src={tile.art} alt="" draggable={false} />
      : <span className="qp-tile-label">{tile.label}</span>}
  </button>;
}

/**
 * The top menu: accent strip, small back button and the lowercase menu words. Shown above every
 * screen except the playing window. The current section is white, the rest grey. In narrow windows
 * it stacks vertically on home (`stack`) and becomes one sideways-scrolling row elsewhere.
 */
export function TopMenu({ menu, current = 0, onBack, stack }: {
  menu: MenuEntry[]; current?: number; onBack?: () => void; stack?: boolean;
}) {
  return <div className={`top-menu${stack ? ' is-stacked' : ''}`}>
    <span className="home-strip" aria-hidden="true" />
    <header className="home-top" data-tauri-drag-region data-no-swipe>
      <button type="button" className="home-back" aria-label="back" title="back" disabled={!onBack} onClick={onBack}><BackIcon /></button>
      <nav className="home-nav" aria-label="Main menu">
        {menu.map((entry, i) => <button key={entry.label} type="button" className={`home-nav-item${i === current ? ' is-current' : ''}`}
          aria-current={i === current ? 'page' : undefined} onClick={entry.onClick}>{entry.label}</button>)}
      </nav>
    </header>
  </div>;
}

/**
 * Home: a panorama of tile clusters (pins, playlists, history) that scrolls sideways with the
 * mouse wheel. Pass `menu` to draw the top menu inside home; leave it out when the app shows
 * TopMenu above every screen.
 */
export function HomeScreen({ menu, sections, onBack }: { menu?: MenuEntry[]; sections: HomeSection[]; onBack?: () => void }) {
  const panorama = useRef<HTMLDivElement>(null);
  // The mouse wheel scrolls the panorama sideways when it's wider than the window.
  useEffect(() => {
    const el = panorama.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  let index = 0;
  return <div className="home">
    {menu && <TopMenu menu={menu} onBack={onBack} stack />}
    <div className="home-panorama" ref={panorama}>
      {sections.map(section => <section key={section.title} className={`qp-section${section.alignEnd ? ' is-end' : ''}`}>
        <h2 className={`qp-title${section.accent ? ' is-accent' : ''}`}>{section.title}</h2>
        {section.tiles.length === 0 && section.empty
          ? <p className="qp-empty">{section.empty}</p>
          : <div className="qp-tiles">
              {section.tiles.map(tile => <HomeTileButton key={tile.key} tile={tile} index={index++} />)}
              {section.hint && <p className="qp-hint">{section.hint}</p>}
              {Array.from({ length: section.placeholders ?? 0 }, (_, i) => <span key={`p${i}`} className="qp-placeholder" aria-hidden="true" />)}
            </div>}
      </section>)}
    </div>
  </div>;
}

/** Small caps heading plus a row of square tiles, used beside the home menu. */
export function TileStrip({ title, items, onMore }: {
  title: string;
  items: { key: string; art: string; label: string; onClick: () => void }[];
  onMore?: () => void;
}) {
  return <section className="strip">
    <div className="strip-head">
      <h2 className="strip-title">{title}</h2>
      {onMore && <button type="button" className="strip-more t-meta" onClick={onMore}>see all</button>}
    </div>
    <ul className="strip-tiles stagger">
      {items.map((item, i) => <li key={item.key} style={stagger(i)}>
        <button type="button" className="strip-tile" onClick={item.onClick} title={item.label}>
          <img src={item.art} alt="" />
          <span className="strip-label truncate">{item.label}</span>
        </button>
      </li>)}
    </ul>
  </section>;
}

/* ---------- text page: settings-style pages ---------- */

/** Back button, small kicker, huge bleeding lowercase title, then scrolling content. */
export function TextPage({ onBack, kicker, title, children }: {
  onBack?: () => void; kicker?: string; title: ReactNode; children: ReactNode;
}) {
  return <div className="text-page">
    {onBack && <BackButton onClick={onBack} />}
    <div className="text-page-scroll">
      <div className={`text-page-bar${onBack ? ' clear-back' : ''}`} data-tauri-drag-region data-no-swipe><span className="t-meta">{kicker}</span></div>
      <h1 className="text-page-title">{title}</h1>
      <div className="text-page-body">{children}</div>
    </div>
  </div>;
}

/** A labelled group inside a text page. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="section">
    <h2 className="section-title">{title}</h2>
    {children}
  </section>;
}

/* ---------- data states ---------- */

export type DataState = 'normal' | 'loading' | 'empty' | 'error' | 'rate-limited';

function Skeleton({ variant }: { variant: 'rows' | 'tiles' }) {
  if (variant === 'tiles') {
    return <ul className="tile-grid skeleton" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => <li key={i}><span className="sk-art" /><span className="sk-line" /><span className="sk-line sk-short" /></li>)}
    </ul>;
  }
  return <ul className="list skeleton" aria-label="Loading">
    {Array.from({ length: 7 }, (_, i) => <li key={i} className="sk-row"><span className="sk-thumb" />
      <span className="sk-copy"><span className="sk-line" /><span className="sk-line sk-short" /></span></li>)}
  </ul>;
}

/**
 * Wraps a data list and shows one of the four non-normal states instead:
 * loading (skeleton, no spinner), empty (one lowercase sentence), error (sentence + retry),
 * rate-limited (sentence with the Retry-After wait).
 */
export function DataView({ state, empty, variant = 'rows', retryAfter = 30, onRetry, children }: {
  state: DataState;
  empty: string;
  variant?: 'rows' | 'tiles';
  retryAfter?: number;
  onRetry?: () => void;
  children: ReactNode;
}) {
  switch (state) {
    case 'loading': return <Skeleton variant={variant} />;
    case 'empty': return <p className="empty">{empty}</p>;
    case 'error': return <div className="state-msg">
      <p className="state-title">couldn't load this</p>
      <p className="state-body">Check your connection, then try again.</p>
      {onRetry && <button type="button" className="text-link" onClick={onRetry}>retry</button>}
    </div>;
    case 'rate-limited': return <div className="state-msg">
      <p className="state-title">taking a short break</p>
      <p className="state-body">Spotify asked us to slow down. Trying again in {retryAfter} seconds.</p>
    </div>;
    default: return <>{children}</>;
  }
}

/* ---------- search box ---------- */

export function SearchBox({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return <label className="search-box" data-no-swipe>
    <SearchIcon />
    <input type="search" value={value} placeholder="type to search" autoFocus={autoFocus} spellCheck={false}
      aria-label="Search" onChange={event => onChange(event.target.value)} />
  </label>;
}
