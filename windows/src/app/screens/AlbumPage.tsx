import { useAlbum } from '@zplayer/library/react';
import { ActionButton, DataView, DetailPage, List, PlayIcon } from '@zplayer/theme';
import { artOf, artistNames } from '../format';
import { SongRows, stateOfValue, type Ctx } from './common';

/** The full album in track order. Songs in your library carry a filled heart when liked. */
export function AlbumPage({ ctx, id, name, artwork }: { ctx: Ctx; id: string; name: string; artwork?: string }) {
  const album = useAlbum(id);
  const data = album.data;
  const context = `spotify:album:${id}`;
  return <DetailPage onBack={ctx.back} background={artwork} art={artOf(data?.album.artwork ?? artwork)} kicker="album"
    title={data?.album.name ?? name} subtitle={data ? artistNames(data.album) : undefined}
    meta={data ? `${data.songs.length} songs` : undefined}
    actions={<ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.action(() => ctx.engine.playContext(context))} />}>
    <DataView state={stateOfValue(album)} empty="this album has no songs" onRetry={album.retry}>
      <List label="album songs">
        <SongRows ctx={ctx} songs={data?.songs ?? []} numbered
          onPlay={song => ctx.engine.playContext(context, song.uri)} />
      </List>
    </DataView>
  </DetailPage>;
}
