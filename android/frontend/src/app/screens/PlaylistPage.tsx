import { useInfiniteList, useLibraryContext, usePlaylists } from '@zplayer/library/react';
import { ActionButton, DetailPage, Notice, PlayIcon } from '@zplayer/theme';
import { artOf } from '../format';
import { Infinite, SongRows, useLong, type Ctx } from './common';

/** A playlist. Spotify lists songs only for playlists you own or collaborate on; others play as a whole. */
export function PlaylistPage({ ctx, id, title }: { ctx: Ctx; id: string; title: string }) {
  const { library } = useLibraryContext();
  const t = useLong();
  const playlist = (usePlaylists().data ?? []).find(item => item.id === id);
  const readable = playlist?.readable ?? false;
  const list = useInfiniteList(
    async offset => library ? library.playlistSongs(id, offset) : { items: [], next: null },
    [library, id], undefined, !!library && readable);
  const uri = playlist?.uri ?? `spotify:playlist:${id}`;
  return <DetailPage onBack={ctx.back} background={playlist?.artwork} art={artOf(playlist?.artwork)}
    kicker={playlist?.owner ? `playlist · by ${playlist.owner}` : 'playlist'} title={t(playlist?.title ?? title)}
    meta={playlist ? `${playlist.total} songs` : undefined}
    actions={<ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.run(() => ctx.engine.playContext(uri))} />}>
    {readable
      ? <Infinite list={list} label="playlist songs" empty="this playlist is empty">
          {songs => <SongRows ctx={ctx} songs={songs} />}
        </Infinite>
      : playlist
        ? <Notice title="songs not listed">Spotify only shows the songs in playlists you own or collaborate on. You can still play this one from here, but its songs won't appear in songs, albums or artists.</Notice>
        : null}
  </DetailPage>;
}
