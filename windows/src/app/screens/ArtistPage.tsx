import { useArtist } from '@zplayer/library/react';
import { DataView, DetailPage, EmptyState, List, Section } from '@zplayer/theme';
import { artOf } from '../format';
import { SongRows, stateOfValue, type Ctx } from './common';

/** Your songs by one artist, grouped by album. */
export function ArtistPage({ ctx, id, name }: { ctx: Ctx; id: string; name: string }) {
  const artist = useArtist(id);
  const page = artist.data;
  const state = stateOfValue(artist);
  const first = page?.albums[0]?.album;
  return <DetailPage onBack={ctx.back} background={first?.artwork} art={artOf(first?.artwork)} kicker="artist"
    title={page?.artist.name ?? name}
    meta={page ? `${page.artist.songCount} ${page.artist.songCount === 1 ? 'song' : 'songs'} in your library` : undefined}>
    <DataView state={state} empty="" onRetry={artist.retry}>
      {page && page.albums.length
        ? page.albums.map(group => <Section key={group.album.id} title={group.album.name.toLowerCase()}>
            <List label={group.album.name}>
              <SongRows ctx={ctx} songs={group.songs} />
            </List>
            <button type="button" className="text-link more"
              onClick={() => ctx.open({ kind: 'album', id: group.album.id, name: group.album.name, artwork: group.album.artwork })}>
              open album
            </button>
          </Section>)
        : <EmptyState>none of your songs are by this artist</EmptyState>}
    </DataView>
  </DetailPage>;
}
