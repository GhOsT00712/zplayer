import { createContext, useContext, type ReactNode } from 'react';
import type { PlaybackEngine, Song } from '@zplayer/library';
import { useLiked, type InfiniteList, type Value } from '@zplayer/library/react';
import { DataView, List, LoadingRow, Row, formatTime, type DataState } from '@zplayer/theme';
import type { usePrefs } from '../../platform/usePrefs';
import type { RemoteSnapshot } from '../../playback/appRemoteEngine';
import { artOf, artistNames, statusOf } from '../format';
import type { RouteName } from '../routes';

/** What the phone's engines add to PlaybackEngine. */
export type PhoneEngine = PlaybackEngine & { playUpcoming(offset: number): Promise<void> };

/** Everything a screen needs. Built once per render in App. */
export interface Ctx {
  engine: PhoneEngine;
  open: (route: RouteName) => void;
  back: () => void;
  /** Opens now playing (the first word on home). */
  openNow: () => void;
  /** False while another layer (now playing, the lock screen) covers the page. */
  inputEnabled: boolean;
  prefs: ReturnType<typeof usePrefs>;
  signOut: () => void;
  account?: { name: string };
  /** The Spotify app connection inside the Android app. */
  remote?: RemoteSnapshot;
  sync: { syncing: boolean; error?: string; refresh: () => void };
  playingId?: string;
  /** Plays and reports a failure as a short notice. */
  run: (task: () => Promise<unknown>) => void;
}

/** Review panel overrides: force a data state or very long titles on every list. */
export const Forced = createContext<{ state: DataState; longTitles: boolean; retry: () => void }>({ state: 'normal', longTitles: false, retry: () => {} });
const LONG = ' (Extended Harbour Sessions Version, Recorded Live And Remastered)';
export const useLong = () => { const { longTitles } = useContext(Forced); return (text: string) => longTitles ? text + LONG : text; };

/** The theme's loading, empty, error and rate-limited looks around an infinite list. */
export function stateOf(list: Pick<InfiniteList<unknown>, 'items' | 'loading' | 'done' | 'error'>): DataState {
  if (list.items.length) return 'normal';
  if (list.error) return statusOf(list.error) === 429 ? 'rate-limited' : 'error';
  return list.loading || !list.done ? 'loading' : 'empty';
}

export function stateOfValue(value: Value<unknown>): DataState {
  if (value.error) return statusOf(value.error) === 429 ? 'rate-limited' : 'error';
  if (value.loading) return 'loading';
  return 'normal';
}

/** DataView that lets the review panel force a state. */
export function Data({ state, empty, onRetry, tiles, children }: {
  state: DataState; empty: string; onRetry?: () => void; tiles?: boolean; children: ReactNode;
}) {
  const forced = useContext(Forced);
  return <DataView state={forced.state !== 'normal' ? forced.state : state} empty={empty} variant={tiles ? 'tiles' : 'rows'}
    onRetry={forced.state !== 'normal' ? forced.retry : onRetry}>{children}</DataView>;
}

/** An infinite list: rows, then a sentinel row that loads the next page as it nears the screen. */
export function Infinite<T>({ list, empty, label, children }: {
  list: InfiniteList<T>; empty: string; label: string; children: (items: T[]) => ReactNode;
}) {
  return <Data state={stateOf(list)} empty={empty} onRetry={list.retry}>
    <List label={label}>
      {children(list.items)}
      {list.error ? <LoadingRow failed onRetry={list.retry} sentinelRef={list.sentinelRef} />
        : !list.done && <LoadingRow sentinelRef={list.sentinelRef} />}
    </List>
  </Data>;
}

/** Song rows with the heart. Tap plays from that song on. */
export function SongRows({ ctx, songs, numbered, onPlay }: {
  ctx: Ctx;
  songs: Song[];
  /** Album pages show the track number instead of artwork. */
  numbered?: boolean;
  /** Replaces the default "play this list from the tapped song" (an album plays as an album). */
  onPlay?: (song: Song, index: number) => Promise<unknown>;
}) {
  const { isLiked, toggle } = useLiked();
  const t = useLong();
  const uris = songs.map(song => song.uri);
  return <>{songs.map((song, i) => <Row key={`${song.id}-${i}`} index={i} title={t(song.title)}
    art={numbered ? undefined : artOf(song.album.artwork)} number={numbered ? song.trackNumber ?? i + 1 : undefined}
    meta={numbered ? undefined : [artistNames(song), t(song.album.name)].filter(Boolean).join(' · ')}
    trailing={song.durationMs ? formatTime(song.durationMs) : undefined}
    active={song.id === ctx.playingId} liked={isLiked(song.id)} onLike={() => void toggle(song)}
    onClick={() => ctx.run(() => onPlay ? onPlay(song, i) : ctx.engine.playSongs(uris, i))} />)}</>;
}
