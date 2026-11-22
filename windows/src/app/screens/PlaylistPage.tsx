import type { Playlist } from '@zplayer/library';
import { useInfiniteList, useLibraryContext } from '@zplayer/library/react';
import { ActionButton, DetailPage, Notice, PlayIcon } from '@zplayer/theme';
import { artOf } from '../format';
import { Infinite, SongRows, type Ctx } from './common';

/** A playlist. Spotify lists songs only for playlists you own or collaborate on; others play as a whole. */
export function PlaylistPage({ ctx, playlist }: { ctx: Ctx; playlist: Playlist }) {
  const { library } = useLibraryContext();
  const list = useInfiniteList(
    async offset => library ? library.playlistSongs(playlist.id, offset) : { items: [], next: null },
    [library, playlist.id], undefined, !!library && playlist.readable);
  return <DetailPage onBack={ctx.back} background={playlist.artwork} art={artOf(playlist.artwork)} kicker="playlist"
    title={playlist.title} subtitle={playlist.owner ? `by ${playlist.owner}` : undefined}
    actions={<ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.action(() => ctx.engine.playContext(playlist.uri))} />}>
    {playlist.readable
      ? <Infinite list={list} label="playlist songs" empty="this playlist is empty">
          {songs => <SongRows ctx={ctx} songs={songs} onPlay={song => ctx.engine.playContext(playlist.uri, song.uri)} />}
        </Infinite>
      : <Notice title="songs not listed">Spotify only shows the songs in playlists you own or collaborate on. You can still play this one from here, but its songs won't appear in songs, albums or artists.</Notice>}
  </DetailPage>;
}
