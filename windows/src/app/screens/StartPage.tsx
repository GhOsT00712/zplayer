import { useHistory, usePlaylists } from '@zplayer/library/react';
import { HeartIcon, HomeScreen, type HomeTile } from '@zplayer/theme';
import { artistNames } from '../format';
import { PIVOT } from '../routes';
import type { Ctx } from './common';

/** The start page: liked songs, your playlists and recent history as tiles. */
export function StartPage({ ctx }: { ctx: Ctx }) {
  const playlists = usePlaylists();
  const history = useHistory();

  const songTiles: HomeTile[] = [
    { key: 'songs', label: 'songs', icon: <HeartIcon filled />, big: true, onClick: () => ctx.open({ kind: 'music', pivot: PIVOT.songs }) },
  ];
  const playlistTiles: HomeTile[] = (playlists.data ?? []).slice(0, 9).map((playlist, i) => ({
    key: playlist.id, label: playlist.title, art: playlist.artwork, big: i === 0,
    onClick: () => ctx.open({ kind: 'playlist', playlist }),
  }));
  const entries = history.items.slice(0, 9);
  const uris = entries.map(entry => entry.song.uri);
  const historyTiles: HomeTile[] = entries.map(({ song }, i) => ({
    key: `${song.id}-${i}`, label: `${song.title} · ${artistNames(song)}`, art: song.album.artwork, big: i === 0,
    onClick: () => ctx.action(() => ctx.engine.playSongs(uris, i)),
  }));

  return <HomeScreen sections={[
    { title: 'songs', accent: true, alignEnd: true, tiles: songTiles, placeholders: 3 },
    { title: 'playlists', tiles: playlistTiles, placeholders: playlists.loading ? 4 : 0, empty: 'you have no playlists yet' },
    { title: 'history', tiles: historyTiles, placeholders: history.loading && !entries.length ? 4 : 0, empty: 'nothing played yet' },
  ]} />;
}
