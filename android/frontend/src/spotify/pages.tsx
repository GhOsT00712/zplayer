// The real library's screens inside the Android app (A4 step 3): album, playlist and artist pages,
// search, devices, and the real tabs of the music hub. Same theme components and layout as the
// signed-off mock pages (../mock/pages.tsx); only the data is real.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActionButton, CheckIcon, DataView, DetailPage, HeartIcon, Hub, List, Notice, PinIcon, PlayIcon, PlusIcon, Row,
  SearchBox, ShuffleIcon, TextPage, Tile, TileGrid, type DataState, type PivotItem,
} from '@zplayer/theme';
import type { MockSong } from '../shared/data';
import { SongRows, type PageContext } from '../mock/pages';
import {
  album as loadAlbum, artist as loadArtist, devices as loadDevices, inLibrary, playlist as loadPlaylist,
  search as runSearch, setInLibrary, transferTo, type RealAlbum, type RealArtist, type RealDevice, type RealPlaylist,
} from './library';
import { messageOf } from './spotify';

/** Something pinned to home: an album, playlist or artist, remembered on the phone. */
export interface RealPin { kind: 'album' | 'playlist' | 'artist'; id: string; title: string; art: string }

/** Loads data for a screen, with the theme's loading, error and rate-limited states. */
function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<DataState>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState('loading');
    load().then(
      value => { if (alive) { setData(value); setState('normal'); } },
      failure => { if (alive) { setError(messageOf(failure)); setState((failure as { status?: number })?.status === 429 ? 'rate-limited' : 'error'); } },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { data, state, error, retry: () => setAttempt(a => a + 1) };
}

/** Saved / liked / followed, read from and written to /me/library. */
function useInLibrary(uri: string | undefined) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { if (uri) inLibrary(uri).then(setOn, () => setOn(null)); }, [uri]);
  const toggle = () => {
    if (!uri || on === null) return;
    setOn(!on);
    setInLibrary(uri, !on).catch(() => setOn(on));
  };
  return { on, toggle };
}

function PinAction({ ctx, pin }: { ctx: PageContext; pin: RealPin }) {
  const pinned = !!ctx.spotify?.pins.some(p => p.kind === pin.kind && p.id === pin.id);
  return <ActionButton icon={<PinIcon filled={pinned} />} label={pinned ? 'pinned' : 'pin'} active={pinned}
    onClick={() => ctx.spotify?.togglePin(pin)} />;
}

/** A screen still loading or failed, before there's art and a title to show. */
function Waiting({ ctx, kicker, title, state, retry }: { ctx: PageContext; kicker: string; title: string; state: DataState; retry: () => void }) {
  return <TextPage onBack={ctx.back} kicker={kicker} title={title}>
    <DataView state={state} empty="nothing here" onRetry={retry}>{null}</DataView>
  </TextPage>;
}

const songWord = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;
const minutes = (songs: MockSong[]) => Math.round(songs.reduce((sum, s) => sum + s.durationMs, 0) / 60000);

/* ---------- album ---------- */

export function RealAlbumPage({ ctx, id, title }: { ctx: PageContext; id: string; title: string }) {
  const { data, state, retry } = useLoad(() => loadAlbum(id), [id]);
  const saved = useInLibrary(data?.album.uri);
  if (!data) return <Waiting ctx={ctx} kicker="album" title={title} state={state} retry={retry} />;
  const { album, songs } = data;
  return <DetailPage onBack={ctx.back} background={album.art} art={album.art} kicker={album.kind} title={album.title}
    subtitle={album.artistId
      ? <button type="button" onClick={() => ctx.open({ kind: 'sp-artist', id: album.artistId, name: album.artist })}>{album.artist}</button>
      : album.artist}
    meta={`${album.year || ''}${album.year ? ' · ' : ''}${songWord(songs.length)} · ${minutes(songs)} min`}
    actions={<>
      <ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.player.playList(songs, 0)} />
      <ActionButton icon={<ShuffleIcon />} label="shuffle" onClick={() => ctx.player.playShuffled(songs)} />
      {saved.on !== null && <ActionButton icon={<HeartIcon filled={saved.on} />} label={saved.on ? 'saved' : 'save'} active={saved.on} onClick={saved.toggle} />}
      <PinAction ctx={ctx} pin={{ kind: 'album', id: album.id, title: album.title, art: album.art }} />
    </>}>
    {songs.length ? <SongRows ctx={ctx} songs={songs} numbered /> : <p className="empty">this album has no playable songs</p>}
  </DetailPage>;
}

/* ---------- playlist ---------- */

export function RealPlaylistPage({ ctx, id, title }: { ctx: PageContext; id: string; title: string }) {
  const userId = ctx.spotify?.userId ?? '';
  const { data, state, retry } = useLoad(() => loadPlaylist(id, userId), [id, userId]);
  if (!data) return <Waiting ctx={ctx} kicker="playlist" title={title} state={state} retry={retry} />;
  const { playlist, songs } = data;
  const yours = playlist.ownerId === userId;
  return <DetailPage onBack={ctx.back} background={playlist.art} art={playlist.art}
    kicker={yours ? 'playlist · by you' : `playlist · by ${playlist.owner}`} title={playlist.title}
    meta={songs?.length ? `${songWord(playlist.count)} · ${minutes(songs)} min` : songWord(playlist.count)}
    actions={<>
      <ActionButton icon={<PlayIcon />} label="play" onClick={() => songs?.length ? ctx.player.playList(songs, 0) : ctx.playContext?.(playlist.uri)} />
      {songs && songs.length > 0 && <ActionButton icon={<ShuffleIcon />} label="shuffle" onClick={() => ctx.player.playShuffled(songs)} />}
      <PinAction ctx={ctx} pin={{ kind: 'playlist', id: playlist.id, title: playlist.title, art: playlist.art }} />
    </>}>
    {songs === null
      ? <Notice title="songs not listed">Spotify only shows the songs in playlists you own or collaborate on. You can still play this one from here.</Notice>
      : songs.length ? <SongRows ctx={ctx} songs={songs} /> : <p className="empty">this playlist is empty</p>}
  </DetailPage>;
}

/* ---------- artist ---------- */

export function RealArtistPage({ ctx, id, name }: { ctx: PageContext; id: string; name: string }) {
  const { data, state, retry } = useLoad(() => loadArtist(id), [id]);
  const following = useInLibrary(data?.artist.uri);
  if (!data) return <Waiting ctx={ctx} kicker="artist" title={name.toLowerCase()} state={state} retry={retry} />;
  const { artist, albums, singles } = data;
  const liked = (ctx.library?.liked ?? []).filter(s => s.artist.split(', ').includes(artist.name));
  const pivots: PivotItem[] = [
    { id: 'albums', label: 'albums', render: () => albums.length ? <AlbumTiles ctx={ctx} list={albums} meta={a => String(a.year || '')} /> : <p className="empty">no albums yet</p> },
    { id: 'singles', label: 'singles', render: () => singles.length ? <AlbumTiles ctx={ctx} list={singles} meta={a => String(a.year || '')} /> : <p className="empty">no singles yet</p> },
    {
      id: 'songs', label: 'in your library', render: () => <>
        <div className="actions pane-actions">
          {liked.length > 0 && <ActionButton icon={<PlayIcon />} label="play all" onClick={() => ctx.player.playList(liked, 0)} />}
          {liked.length > 0 && <ActionButton icon={<ShuffleIcon />} label="shuffle" onClick={() => ctx.player.playShuffled(liked)} />}
          <PinAction ctx={ctx} pin={{ kind: 'artist', id: artist.id, title: artist.name, art: artist.art }} />
        </div>
        {liked.length ? <SongRows ctx={ctx} songs={liked} /> : <p className="empty">none of their songs are in your liked songs yet</p>}
      </>,
    },
  ];
  return <Hub title={artist.name.toLowerCase()} brand={artist.genres.slice(0, 2).join(' · ')} items={pivots}
    inputEnabled={ctx.inputEnabled} background={artist.art} onBack={ctx.back}
    actions={following.on !== null
      ? <ActionButton icon={following.on ? <CheckIcon /> : <PlusIcon />} label={following.on ? 'following' : 'follow'} active={following.on} onClick={following.toggle} />
      : undefined} />;
}

/* ---------- lists, shared with the music hub and search ---------- */

export function AlbumTiles({ ctx, list, meta }: { ctx: PageContext; list: RealAlbum[]; meta?: (album: RealAlbum) => string }) {
  return <TileGrid label="albums">
    {list.map((a, i) => <Tile key={a.id} index={i} art={a.art} title={a.title} meta={meta ? meta(a) : a.artist}
      onClick={() => ctx.open({ kind: 'sp-album', id: a.id, title: a.title })} />)}
  </TileGrid>;
}

export function ArtistRows({ ctx, list }: { ctx: PageContext; list: RealArtist[] }) {
  return <List label="artists">
    {list.map((a, i) => <Row key={a.id} index={i} title={a.name.toLowerCase()} large art={a.art}
      onClick={() => ctx.open({ kind: 'sp-artist', id: a.id, name: a.name })} />)}
  </List>;
}

export function PlaylistRows({ ctx, list }: { ctx: PageContext; list: RealPlaylist[] }) {
  return <List label="playlists">
    {list.map((p, i) => <Row key={p.id} index={i} title={p.title} art={p.art}
      meta={`${songWord(p.count)} · by ${p.ownerId === ctx.spotify?.userId ? 'you' : p.owner}`}
      onClick={() => ctx.open({ kind: 'sp-playlist', id: p.id, title: p.title })} />)}
  </List>;
}

/** A list that may still be loading: the theme's states around it. */
export function Loaded<T>({ items, empty, tiles, children }: { items: T[] | null; empty: string; tiles?: boolean; children: (items: T[]) => ReactNode }) {
  const state: DataState = items === null ? 'loading' : items.length ? 'normal' : 'empty';
  return <DataView state={state} empty={empty} variant={tiles ? 'tiles' : 'rows'}>{items && items.length ? children(items) : null}</DataView>;
}

/* ---------- search ---------- */

export function RealSearchHub({ ctx }: { ctx: PageContext }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof runSearch>> | null>(null);
  const [state, setState] = useState<DataState>('normal');
  // search as you type, after a short pause
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setState('normal'); return; }
    setState('loading');
    let alive = true;
    const timer = window.setTimeout(() => {
      runSearch(q).then(r => { if (alive) { setResults(r); setState('normal'); } },
        failure => { if (alive) setState((failure as { status?: number })?.status === 429 ? 'rate-limited' : 'error'); });
    }, 350);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [query]);
  const pane = (label: string, count: number | undefined, body: ReactNode) => {
    if (!query.trim()) return <p className="empty">search songs, albums, artists and playlists</p>;
    return <DataView state={state} empty="" onRetry={() => setQuery(q => `${q}`)}>
      {count ? body : <p className="empty">no {label} match "{query.trim()}"</p>}
    </DataView>;
  };
  const pivots: PivotItem[] = [
    { id: 'songs', label: 'songs', render: () => pane('songs', results?.songs.length, results && <SongRows ctx={ctx} songs={results.songs} />) },
    { id: 'albums', label: 'albums', render: () => pane('albums', results?.albums.length, results && <AlbumTiles ctx={ctx} list={results.albums} />) },
    { id: 'artists', label: 'artists', render: () => pane('artists', results?.artists.length, results && <ArtistRows ctx={ctx} list={results.artists} />) },
    { id: 'playlists', label: 'playlists', render: () => pane('playlists', results?.playlists.length, results && <PlaylistRows ctx={ctx} list={results.playlists} />) },
  ];
  return <Hub title="search" items={pivots} inputEnabled={ctx.inputEnabled} onBack={ctx.back}
    subheader={<SearchBox value={query} onChange={setQuery} autoFocus />} />;
}

/* ---------- devices ---------- */

export function RealDevicesPage({ ctx }: { ctx: PageContext }) {
  const { data, state, retry } = useLoad<RealDevice[]>(loadDevices, []);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = (device: RealDevice) => {
    if (device.restricted || device.active) return;
    setMoving(device.id); setError(null);
    transferTo(device.id).then(() => { setMoving(null); retry(); }, failure => { setMoving(null); setError(messageOf(failure)); });
  };
  return <TextPage onBack={ctx.back} kicker="play on" title="devices">
    <p className="page-note">Spotify Connect devices signed in to your account. This phone's Spotify app shows up here once it has played.</p>
    <DataView state={state === 'normal' && !data?.length ? 'empty' : state} empty="no devices right now. play a song to wake this phone's spotify app." onRetry={retry}>
      <List label="devices">
        {(data ?? []).map((device, i) => <Row key={device.id} index={i} title={device.name.toLowerCase()} large active={device.active}
          disabled={device.restricted}
          meta={device.restricted ? `${device.type} · can't be controlled from here` : moving === device.id ? `${device.type} · moving playback here…` : device.active ? `${device.type} · playing here` : device.type}
          onClick={() => pick(device)} />)}
      </List>
    </DataView>
    {error && <p className="zp-error" role="alert">{error}</p>}
  </TextPage>;
}
