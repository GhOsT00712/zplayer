import { useHistory, usePlaylists } from '@zplayer/library/react';
import { HeartIcon, HomeScreen, type HomeTile } from '@zplayer/theme';
import { artistNames } from '../format';
import { PIVOT } from '../routes';
import type { Ctx } from './common';

/** Home: space at the top, the menu, then songs, playlists and history tiles peeking up from below. */
export function HomePage({ ctx }: { ctx: Ctx }) {
  const playlists = usePlaylists();
  const history = useHistory();
  const entries = history.items.slice(0, 11);
  const uris = entries.map(entry => entry.song.uri);

  const songTiles: HomeTile[] = [
    { key: 'songs', label: 'songs', icon: <HeartIcon filled />, big: true, onClick: () => ctx.open({ kind: 'music', pivot: PIVOT.songs }) },
  ];
  const playlistTiles: HomeTile[] = (playlists.data ?? []).slice(0, 9).map((playlist, i) => ({
    key: playlist.id, label: playlist.title, art: playlist.artwork, big: i === 0,
    onClick: () => ctx.open({ kind: 'playlist', id: playlist.id, title: playlist.title }),
  }));
  const historyTiles: HomeTile[] = entries.map(({ song }, i) => ({
    key: `h${i}`, label: `${song.title} · ${artistNames(song)}`, art: song.album.artwork,
    onClick: () => ctx.run(() => ctx.engine.playSongs(uris, i)),
  }));
  const loadingHistory = history.loading && !entries.length;

  const menu: { label: string; go: () => void }[] = [
    { label: 'now playing', go: ctx.openNow },
    { label: 'artists', go: () => ctx.open({ kind: 'music', pivot: PIVOT.artists }) },
    { label: 'albums', go: () => ctx.open({ kind: 'music', pivot: PIVOT.albums }) },
    { label: 'songs', go: () => ctx.open({ kind: 'music', pivot: PIVOT.songs }) },
    { label: 'playlists', go: () => ctx.open({ kind: 'music', pivot: PIVOT.playlists }) },
    { label: 'search', go: () => ctx.open({ kind: 'search' }) },
    { label: 'settings', go: () => ctx.open({ kind: 'settings' }) },
  ];
  return <HomeScreen menu={menu.map(m => ({ label: m.label, onClick: m.go }))} sections={[
    { title: 'songs', accent: true, tiles: songTiles, placeholders: 3 },
    { title: 'history', tiles: historyTiles, placeholders: loadingHistory ? 6 : 0, empty: loadingHistory ? undefined : 'nothing played yet' },
    { title: 'playlists', tiles: playlistTiles, placeholders: playlists.loading ? 6 : 0, empty: playlists.loading ? undefined : 'you have no playlists yet' },
  ]} />;
}
