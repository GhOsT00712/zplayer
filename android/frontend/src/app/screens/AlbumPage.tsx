import { useAlbum } from '@zplayer/library/react';
import { ActionButton, DetailPage, List, PlayIcon } from '@zplayer/theme';
import { artOf, artistNames } from '../format';
import { Data, SongRows, stateOfValue, useLong, type Ctx } from './common';

/** The full album in track order. Songs you liked carry a filled heart. */
export function AlbumPage({ ctx, id, name, artwork }: { ctx: Ctx; id: string; name: string; artwork?: string }) {
  const album = useAlbum(id);
  const t = useLong();
  const data = album.data;
  const context = `spotify:album:${id}`;
  const artist = data?.album.artists[0];
  return <DetailPage onBack={ctx.back} background={artwork} art={artOf(data?.album.artwork ?? artwork)} kicker="album"
    title={t(data?.album.name ?? name)}
    subtitle={artist ? <button type="button" onClick={() => ctx.open({ kind: 'artist', id: artist.id, name: artist.name })}>{artistNames(data!.album)}</button> : undefined}
    meta={data ? `${data.songs.length} ${data.songs.length === 1 ? 'song' : 'songs'}` : undefined}
    actions={<ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.run(() => ctx.engine.playContext(context))} />}>
    <Data state={stateOfValue(album)} empty="this album has no songs" onRetry={album.retry}>
      <List label="album songs">
        <SongRows ctx={ctx} songs={data?.songs ?? []} numbered
          onPlay={(song, i) => ctx.engine.playContext(context, song.uri, i)} />
      </List>
    </Data>
  </DetailPage>;
}
