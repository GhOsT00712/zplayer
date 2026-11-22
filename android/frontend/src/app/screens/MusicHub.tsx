import { useAlbums, useArtists, useHistory, usePlaylists, useSongs } from '@zplayer/library/react';
import { Hub, List, Row, type PivotItem } from '@zplayer/theme';
import { artOf, artistNames } from '../format';
import { PIVOT } from '../routes';
import { Data, Infinite, SongRows, stateOfValue, useLong, type Ctx } from './common';

function SongsPane({ ctx }: { ctx: Ctx }) {
  const list = useSongs();
  return <Infinite list={list} label="songs" empty="like songs in Spotify, or add them to your playlists, to see them here">
    {songs => <SongRows ctx={ctx} songs={songs} />}
  </Infinite>;
}

function HistoryPane({ ctx }: { ctx: Ctx }) {
  const list = useHistory();
  return <Infinite list={list} label="history" empty="nothing played yet">
    {entries => <SongRows ctx={ctx} songs={entries.map(entry => entry.song)} />}
  </Infinite>;
}

function AlbumsPane({ ctx }: { ctx: Ctx }) {
  const list = useAlbums();
  const t = useLong();
  return <Infinite list={list} label="albums" empty="albums with your songs show up here">
    {albums => <>{albums.map((album, i) => <Row key={album.id} index={i} title={t(album.name)} art={artOf(album.artwork)}
      meta={[artistNames(album), `${album.songCount} ${album.songCount === 1 ? 'song' : 'songs'}`].filter(Boolean).join(' · ')}
      onClick={() => ctx.open({ kind: 'album', id: album.id, name: album.name, artwork: album.artwork })} />)}</>}
  </Infinite>;
}

function ArtistsPane({ ctx }: { ctx: Ctx }) {
  const list = useArtists();
  const t = useLong();
  return <Infinite list={list} label="artists" empty="artists on your songs show up here">
    {artists => <>{artists.map((artist, i) => <Row key={artist.id} index={i} title={t(artist.name).toLowerCase()} large
      meta={`${artist.songCount} ${artist.songCount === 1 ? 'song' : 'songs'}`}
      onClick={() => ctx.open({ kind: 'artist', id: artist.id, name: artist.name })} />)}</>}
  </Infinite>;
}

function PlaylistsPane({ ctx }: { ctx: Ctx }) {
  const playlists = usePlaylists();
  const t = useLong();
  const items = playlists.data ?? [];
  const state = stateOfValue(playlists);
  return <Data state={state === 'normal' && !items.length ? 'empty' : state} empty="you have no playlists yet" onRetry={playlists.retry}>
    <List label="playlists">
      {items.map((playlist, i) => <Row key={playlist.id} index={i} title={t(playlist.title)} art={artOf(playlist.artwork)}
        meta={playlist.owner ? `by ${playlist.owner}` : undefined}
        onClick={() => ctx.open({ kind: 'playlist', id: playlist.id, title: playlist.title })} />)}
    </List>
  </Data>;
}

export function MusicHub({ ctx, pivot = PIVOT.songs }: { ctx: Ctx; pivot?: number }) {
  // order must match PIVOT
  const pivots: PivotItem[] = [
    { id: 'songs', label: 'songs', render: () => <SongsPane ctx={ctx} /> },
    { id: 'history', label: 'history', render: () => <HistoryPane ctx={ctx} /> },
    { id: 'albums', label: 'albums', render: () => <AlbumsPane ctx={ctx} /> },
    { id: 'artists', label: 'artists', render: () => <ArtistsPane ctx={ctx} /> },
    { id: 'playlists', label: 'playlists', render: () => <PlaylistsPane ctx={ctx} /> },
  ];
  return <Hub title="music" items={pivots} initial={pivot} inputEnabled={ctx.inputEnabled} onBack={ctx.back} />;
}
