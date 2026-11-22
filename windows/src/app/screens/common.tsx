import type { ReactNode } from 'react';
import type { Song } from '@zplayer/library';
import { useLiked, type InfiniteList, type Value } from '@zplayer/library/react';
import { DataView, List, LoadingRow, Row, formatTime, type DataState } from '@zplayer/theme';
import type { PlaybackEngine } from '@zplayer/library';
import type { SdkEngine, EngineSnapshot } from '../../playback/sdkEngine';
import type { Environment } from '../../platform/environment';
import type { usePrefs } from '../../platform/usePrefs';
import { artOf, artistNames, statusOf } from '../format';
import type { Action, RouteName } from '../routes';

/** Everything a screen needs. Built once per render in App. */
export interface Ctx {
  engine: SdkEngine & PlaybackEngine;
  snapshot: EngineSnapshot;
  environment: Environment;
  prefs: ReturnType<typeof usePrefs>;
  open: (route: RouteName) => void;
  back: () => void;
  /** False while another layer (now playing) covers the page. */
  inputEnabled: boolean;
  action: Action;
  busy: boolean;
  /** Sync progress for settings and the first-run message. */
  sync: { syncing: boolean; error?: string; refresh: () => void };
  playingId?: string;
}

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

/** An infinite list: rows, then a sentinel row that loads the next page as it nears the screen. */
export function Infinite<T>({ list, empty, label, children }: {
  list: InfiniteList<T>;
  empty: string;
  label: string;
  children: (items: T[]) => ReactNode;
}) {
  return <DataView state={stateOf(list)} empty={empty} onRetry={list.retry}>
    <List label={label}>
      {children(list.items)}
      {list.error ? <LoadingRow failed onRetry={list.retry} sentinelRef={list.sentinelRef} />
        : !list.done && <LoadingRow sentinelRef={list.sentinelRef} />}
    </List>
  </DataView>;
}

/** Song rows with the heart. Tap plays from that song on. */
export function SongRows({ ctx, songs, trailingTime = true, numbered, onPlay }: {
  ctx: Ctx;
  /** Replaces the default "play this list from the tapped song" (an album plays as an album). */
  onPlay?: (song: Song, index: number) => Promise<unknown>;
  songs: (Song & { liked?: boolean; inLibrary?: boolean })[];
  trailingTime?: boolean;
  /** Album pages show the track number instead of artwork. */
  numbered?: boolean;
}) {
  const { isLiked, toggle } = useLiked();
  const uris = songs.map(song => song.uri);
  return <>{songs.map((song, i) => <Row key={`${song.id}-${i}`} index={i} title={song.title}
    art={numbered ? undefined : artOf(song.album.artwork)} number={numbered ? song.trackNumber ?? i + 1 : undefined}
    meta={numbered ? artistNames(song) : [artistNames(song), song.album.name].filter(Boolean).join(' · ')}
    trailing={trailingTime && song.durationMs ? formatTime(song.durationMs) : undefined}
    active={song.id === ctx.playingId} liked={isLiked(song.id)} onLike={() => void toggle(song)}
    onClick={() => ctx.action(() => onPlay ? onPlay(song, i) : ctx.engine.playSongs(uris, i))} />)}</>;
}
