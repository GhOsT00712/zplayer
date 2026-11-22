import { useArtist } from '@zplayer/library/react';
import { DetailPage, EmptyState, List, Section } from '@zplayer/theme';
import { artOf } from '../format';
import { Data, SongRows, stateOfValue, useLong, type Ctx } from './common';

/** Your songs by one artist, grouped by album. */
export function ArtistPage({ ctx, id, name }: { ctx: Ctx; id: string; name: string }) {
  const artist = useArtist(id);
  const t = useLong();
  const page = artist.data;
  const first = page?.albums[0]?.album;
  return <DetailPage onBack={ctx.back} background={first?.artwork} art={artOf(first?.artwork)} kicker="artist"
    title={t(page?.artist.name ?? name)}
    meta={page ? `${page.artist.songCount} ${page.artist.songCount === 1 ? 'song' : 'songs'} in your library` : undefined}>
    <Data state={stateOfValue(artist)} empty="" onRetry={artist.retry}>
      {page && page.albums.length
        ? page.albums.map(group => <Section key={group.album.id} title={t(group.album.name).toLowerCase()}>
            <List label={group.album.name}>
              <SongRows ctx={ctx} songs={group.songs} />
            </List>
            <button type="button" className="text-link more"
              onClick={() => ctx.open({ kind: 'album', id: group.album.id, name: group.album.name, artwork: group.album.artwork })}>
              open album
            </button>
          </Section>)
        : <EmptyState>none of your songs are by this artist</EmptyState>}
    </Data>
  </DetailPage>;
}
