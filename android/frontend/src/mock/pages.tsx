// Phone screens for the A2 mock. Built from the Windows theme components; adapted from
// ../../../design-mock/src/mock/pages.tsx. Differences on a phone:
// - no top menu: home is the menu, and the Android back gesture moves back
// - every screen except home has the back ring (the Android back gesture works too)
// - "this phone" is the Spotify app (App Remote); signing in needs the Spotify app installed
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActionButton, CheckIcon, DataView, DetailPage, HeartIcon, HomeScreen, Hub, List, Notice, PinIcon, PlayIcon, PlusIcon,
  Row, SearchBox, Section, ShuffleIcon, TextPage, Tile, TileGrid, Wordmark, formatTime,
  type DataState, type HomeTile, type PivotItem,
} from '@zplayer/theme';
import { Choices, Swatches } from '../phone/Choices';
import {
  account, albums, allSongs, artistByName, artists, findAlbum, findArtist, findPlaylist, likedSongs,
  newInLibrary, playlists, recentlyPlayed, searchLibrary, topArtists, topTracks, totalMinutes,
  type MockAlbum, type MockArtist, type MockPlaylist, type MockSong, type PinRef,
} from '../shared/data';
import type { Player } from '../shared/usePlayer';
import { diagnostics, phoneDevices } from './phoneData';
import type { PrefsApi } from './usePrefs';
import type { SpotifyAccount } from '../spotify/useSpotifyAccount';
import type { RealAlbum, RealArtist, RealPlaylist } from '../spotify/library';
import { AlbumTiles as RealAlbumTiles, ArtistRows as RealArtistRows, Loaded, PlaylistRows as RealPlaylistRows, type RealPin } from '../spotify/pages';

export type RouteName =
  | { kind: 'home' }
  | { kind: 'music'; pivot?: number }
  | { kind: 'quickplay'; pivot?: number }
  | { kind: 'search' }
  | { kind: 'devices' }
  | { kind: 'settings' }
  | { kind: 'diagnostics' }
  | { kind: 'artist'; artist: MockArtist }
  | { kind: 'album'; album: MockAlbum }
  | { kind: 'playlist'; playlist: MockPlaylist }
  // the real library inside the Android app (A4 step 3, spotify/pages.tsx)
  | { kind: 'sp-album'; id: string; title: string }
  | { kind: 'sp-playlist'; id: string; title: string }
  | { kind: 'sp-artist'; id: string; name: string };

export interface PageContext {
  player: Player;
  open: (route: RouteName) => void;
  back: () => void;
  /** Opens now playing (the first word on home). */
  openNow: () => void;
  inputEnabled: boolean;
  savedAlbums: Set<string>;
  toggleSaved: (id: string) => void;
  followed: Set<string>;
  toggleFollow: (id: string) => void;
  pins: PinRef[];
  togglePin: (pin: PinRef) => void;
  deviceId: string;
  selectDevice: (id: string) => void;
  signOut: () => void;
  /** The signed-in Spotify account, inside the Android app (A4). Absent in the mock. */
  spotifyAccount?: { name: string; premium: boolean } | null;
  /** Your real library inside the Android app (null while loading). Absent in the mock. */
  library?: { liked: MockSong[] | null; history: MockSong[] | null; playlists: RealPlaylist[] | null; error: string | null };
  /** Plays an album or playlist by its Spotify URI (Android app). */
  playContext?: (uri: string) => void;
  /** Real Spotify state for the Android app's own screens (spotify/pages.tsx). */
  spotify?: {
    userId: string;
    albums: RealAlbum[] | null; artists: RealArtist[] | null;
    pins: RealPin[]; togglePin: (pin: RealPin) => void;
  };
  /** The Spotify app connection inside the Android app. */
  remote?: { status: 'off' | 'connecting' | 'connected' | 'failed'; error: string | null };
  prefs: PrefsApi;
  /** Review-panel overrides. */
  dataState: DataState;
  retry: () => void;
  longTitles: boolean;
}

const LONG = ' (Extended Harbour Sessions Version, Recorded Live And Remastered)';
const t = (ctx: PageContext, text: string) => ctx.longTitles ? text + LONG : text;
const isCurrent = (ctx: PageContext, song: MockSong) => ctx.player.current?.id === song.id;
const isPinned = (ctx: PageContext, pin: PinRef) => ctx.pins.some(p => p.kind === pin.kind && p.id === pin.id);

function Data({ ctx, empty, tiles, children }: { ctx: PageContext; empty: string; tiles?: boolean; children: ReactNode }) {
  return <DataView state={ctx.dataState} empty={empty} variant={tiles ? 'tiles' : 'rows'} onRetry={ctx.retry}>{children}</DataView>;
}

export function SongRows({ ctx, songs, numbered = false }: { ctx: PageContext; songs: MockSong[]; numbered?: boolean }) {
  return <List label="songs">
    {songs.map((song, i) => <Row key={`${song.id}-${i}`} index={i} title={t(ctx, song.title)}
      art={numbered ? undefined : song.album.art} number={numbered ? song.number : undefined}
      meta={numbered ? undefined : `${song.artist} · ${t(ctx, song.album.title)}`} trailing={formatTime(song.durationMs)}
      active={isCurrent(ctx, song)} onClick={() => ctx.player.playList(songs, i)} />)}
  </List>;
}

function AlbumTiles({ ctx, list, meta }: { ctx: PageContext; list: MockAlbum[]; meta: (album: MockAlbum) => string }) {
  return <TileGrid label="albums">
    {list.map((album, i) => <Tile key={album.id} index={i} art={album.art} title={t(ctx, album.title)} meta={meta(album)}
      onClick={() => ctx.open({ kind: 'album', album })} />)}
  </TileGrid>;
}

function ArtistRows({ ctx, list }: { ctx: PageContext; list: MockArtist[] }) {
  return <List label="artists">
    {list.map((artist, i) => <Row key={artist.id} index={i} title={t(ctx, artist.name).toLowerCase()} large
      art={artist.image ?? albums.find(a => a.artist.id === artist.id)?.art}
      onClick={() => ctx.open({ kind: 'artist', artist })} />)}
  </List>;
}

function PlaylistRows({ ctx, list }: { ctx: PageContext; list: MockPlaylist[] }) {
  return <List label="playlists">
    {list.map((playlist, i) => <Row key={playlist.id} index={i} title={t(ctx, playlist.title)} art={playlist.art}
      meta={`${playlist.count} songs · by ${playlist.owner}`} onClick={() => ctx.open({ kind: 'playlist', playlist })} />)}
  </List>;
}

function pinTarget(ctx: PageContext, pin: PinRef) {
  if (pin.kind === 'album') { const album = findAlbum(pin.id); return album && { art: album.art, label: album.title, go: () => ctx.open({ kind: 'album', album }) }; }
  if (pin.kind === 'playlist') { const playlist = findPlaylist(pin.id); return playlist && { art: playlist.art, label: playlist.title, go: () => ctx.open({ kind: 'playlist', playlist }) }; }
  const artist = findArtist(pin.id);
  return artist && { art: artist.image ?? albums.find(a => a.artist.id === artist.id)!.art, label: artist.name, go: () => ctx.open({ kind: 'artist', artist }) };
}

function PinButton({ ctx, pin }: { ctx: PageContext; pin: PinRef }) {
  const pinned = isPinned(ctx, pin);
  return <ActionButton icon={<PinIcon filled={pinned} />} label={pinned ? 'pinned' : 'pin'} active={pinned} onClick={() => ctx.togglePin(pin)} />;
}

/** Tabs of the music hub, in order: songs first (owner, 18 Nov 2026). */
export const MUSIC_TAB = { songs: 0, artists: 1, albums: 2, playlists: 3 } as const;

/* ---------- home: space at the top, the menu, then pins peeking up from below (owner's layout, 18 Nov 2026) ---------- */

export function HomePage({ ctx }: { ctx: PageContext }) {
  // inside the Android app: your real pins (albums, playlists, artists pinned from their pages)
  const pinned = ctx.spotify
    ? ctx.spotify.pins.slice(0, 10).map(pin => ({ key: `${pin.kind}-${pin.id}`, label: pin.title, art: pin.art, onClick: () => ctx.open(
        pin.kind === 'album' ? { kind: 'sp-album', id: pin.id, title: pin.title }
        : pin.kind === 'playlist' ? { kind: 'sp-playlist', id: pin.id, title: pin.title }
        : { kind: 'sp-artist', id: pin.id, name: pin.title }) }))
    : ctx.pins.map(pin => ({ pin, target: pinTarget(ctx, pin) })).filter(p => p.target).slice(0, 10)
        .map(({ pin, target }) => ({ key: `${pin.kind}-${pin.id}`, label: target!.label, art: target!.art, onClick: target!.go }));
  const pinTiles: HomeTile[] = [
    { key: 'liked', label: 'liked songs', icon: <HeartIcon filled />, big: true, onClick: () => ctx.open({ kind: 'music', pivot: MUSIC_TAB.songs }) },
    ...pinned,
  ];
  const real = ctx.library;
  // inside the Android app: your real playlists and history (A4); in the mock: the fake ones
  const playlistTiles: HomeTile[] = real
    ? (real.playlists ?? []).slice(0, 9).map((playlist, i) => ({
        key: playlist.id, label: playlist.title, art: playlist.art, big: i === 0, onClick: () => ctx.open({ kind: 'sp-playlist', id: playlist.id, title: playlist.title }),
      }))
    : playlists.slice(0, 9).map((playlist, i) => ({
        key: playlist.id, label: playlist.title, art: playlist.art, big: i === 0, onClick: () => ctx.open({ kind: 'playlist', playlist }),
      }));
  const history = real ? real.history ?? [] : recentlyPlayed;
  const historyTiles: HomeTile[] = history.slice(0, 11).map((song, i) => ({
    key: `h${i}`, label: `${song.title} · ${song.artist}`, art: song.album.art, onClick: () => ctx.player.playList(history, i),
  }));
  const loading = ctx.dataState === 'loading' || (!!real && (real.history === null || real.playlists === null));
  const menu: { label: string; go: () => void }[] = [
    { label: 'now playing', go: ctx.openNow },
    { label: 'artists', go: () => ctx.open({ kind: 'music', pivot: MUSIC_TAB.artists }) },
    { label: 'albums', go: () => ctx.open({ kind: 'music', pivot: MUSIC_TAB.albums }) },
    { label: 'songs', go: () => ctx.open({ kind: 'music', pivot: MUSIC_TAB.songs }) },
    { label: 'playlists', go: () => ctx.open({ kind: 'music', pivot: MUSIC_TAB.playlists }) },
    { label: 'search', go: () => ctx.open({ kind: 'search' }) },
    { label: 'settings', go: () => ctx.open({ kind: 'settings' }) },
  ];
  return <HomeScreen menu={menu.map(m => ({ label: m.label, onClick: m.go }))} sections={[
    { title: 'pins', accent: true, tiles: pinTiles, placeholders: Math.max(0, 4 - pinned.length),
      hint: pinned.length ? undefined : 'To pin an album, playlist or artist here, open it and choose pin.' },
    { title: 'history', tiles: loading ? [] : historyTiles, placeholders: loading ? 6 : 0, empty: loading ? undefined : 'nothing played yet' },
    { title: 'playlists', tiles: loading ? [] : playlistTiles, placeholders: loading ? 6 : 0, empty: loading ? undefined : 'you have no playlists yet' },
  ]} />;
}

/* ---------- hubs ---------- */

export function QuickplayHub({ ctx, pivot = 0 }: { ctx: PageContext; pivot?: number }) {
  const pinTiles = ctx.pins.map(pin => ({ pin, target: pinTarget(ctx, pin) })).filter(p => p.target);
  const pivots: PivotItem[] = [
    {
      id: 'pins', label: 'pins', render: () => <Data ctx={ctx} tiles empty="pin albums, playlists and artists to keep them here">
        {pinTiles.length
          ? <TileGrid label="pins">{pinTiles.map(({ pin, target }, i) => <Tile key={`${pin.kind}-${pin.id}`} index={i}
              art={target!.art} title={t(ctx, target!.label)} meta={pin.kind} onClick={target!.go} />)}</TileGrid>
          : <p className="empty">pin albums, playlists and artists to keep them here</p>}
      </Data>,
    },
    { id: 'history', label: 'history', render: () => <Data ctx={ctx} empty="nothing played yet"><SongRows ctx={ctx} songs={recentlyPlayed} /></Data> },
    {
      id: 'new', label: 'new', render: () => <Data ctx={ctx} empty="nothing new in your library">
        <p className="t-meta pane-label">recently saved albums</p>
        <AlbumTiles ctx={ctx} list={newInLibrary.albums} meta={a => a.artist.name} />
        <p className="t-meta pane-label">recently liked songs</p>
        <SongRows ctx={ctx} songs={newInLibrary.songs} />
      </Data>,
    },
    {
      id: 'favourites', label: 'favourites', render: () => <Data ctx={ctx} empty="listen a little more to build your favourites">
        <p className="t-meta pane-label">your top artists</p>
        <TileGrid label="top artists">{topArtists.map((artist, i) => <Tile key={artist.id} index={i}
          art={artist.image ?? albums.find(a => a.artist.id === artist.id)!.art} title={t(ctx, artist.name)} meta={artist.genres[0]}
          onClick={() => ctx.open({ kind: 'artist', artist })} />)}</TileGrid>
        <p className="t-meta pane-label">your top songs</p>
        <SongRows ctx={ctx} songs={topTracks} />
      </Data>,
    },
  ];
  return <Hub title="quickplay" items={pivots} initial={pivot} inputEnabled={ctx.inputEnabled} onBack={ctx.back} />;
}

export function MusicHub({ ctx, pivot = 0 }: { ctx: PageContext; pivot?: number }) {
  // order must match MUSIC_TAB
  const pivots: PivotItem[] = [
    {
      id: 'songs', label: 'songs', render: () => {
        // inside the Android app: your real liked songs (A4); in the mock: the fake ones
        const songs = ctx.library ? ctx.library.liked ?? [] : likedSongs;
        const real = ctx.library ? <DataView state={ctx.library.error ? 'error' : ctx.library.liked === null ? 'loading' : songs.length ? 'normal' : 'empty'}
          empty="like songs to see them here" onRetry={ctx.retry}>{null}</DataView> : null;
        if (real && (ctx.library!.error || ctx.library!.liked === null || !songs.length)) return real;
        return <Data ctx={ctx} empty="like songs to see them here">
          <div className="actions pane-actions">
            <ActionButton icon={<PlayIcon />} label="play all" onClick={() => ctx.player.playList(songs, 0)} />
            <ActionButton icon={<ShuffleIcon />} label="shuffle" onClick={() => ctx.player.playShuffled(songs)} />
          </div>
          <SongRows ctx={ctx} songs={songs} />
        </Data>;
      },
    },
    {
      id: 'artists', label: 'artists', render: () => ctx.spotify
        ? <Loaded items={ctx.spotify.artists} empty="follow artists to see them here">{list => <RealArtistRows ctx={ctx} list={list} />}</Loaded>
        : <Data ctx={ctx} empty="follow artists to see them here"><ArtistRows ctx={ctx} list={artists} /></Data>,
    },
    {
      id: 'albums', label: 'albums', render: () => ctx.spotify
        ? <Loaded items={ctx.spotify.albums} tiles empty="save albums to see them here">{list => <RealAlbumTiles ctx={ctx} list={list} meta={a => a.kind === 'single' ? `${a.artist} · single` : a.artist} />}</Loaded>
        : <Data ctx={ctx} tiles empty="save albums to see them here">
            <AlbumTiles ctx={ctx} list={albums} meta={a => a.kind === 'single' ? `${a.artist.name} · single` : a.artist.name} />
          </Data>,
    },
    {
      id: 'playlists', label: 'playlists', render: () => ctx.library
        ? <Loaded items={ctx.library.playlists} empty="you have no playlists yet">{list => <RealPlaylistRows ctx={ctx} list={list} />}</Loaded>
        : <Data ctx={ctx} empty="you have no playlists yet"><PlaylistRows ctx={ctx} list={playlists} /></Data>,
    },
  ];
  return <Hub title="music" items={pivots} initial={pivot} inputEnabled={ctx.inputEnabled} onBack={ctx.back} />;
}

const PAGE = 10; // Spotify Development Mode caps search at 10 results per request.

export function SearchHub({ ctx }: { ctx: PageContext }) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState({ songs: PAGE, albums: PAGE, artists: PAGE, playlists: PAGE });
  useEffect(() => setShown({ songs: PAGE, albums: PAGE, artists: PAGE, playlists: PAGE }), [query]);
  const results = searchLibrary(query);
  const more = (key: keyof typeof shown, total: number) => total > shown[key]
    && <button type="button" className="text-link more" onClick={() => setShown(s => ({ ...s, [key]: s[key] + PAGE }))}>more</button>;
  const wrap = (key: keyof typeof shown, label: string, total: number, body: ReactNode, tiles = false) => {
    if (!query.trim()) return <p className="empty">search songs, albums, artists and playlists</p>;
    return <Data ctx={ctx} tiles={tiles} empty={`no ${label} match "${query.trim()}"`}>
      {total ? <>{body}{more(key, total)}</> : <p className="empty">no {label} match "{query.trim()}"</p>}
    </Data>;
  };
  const pivots: PivotItem[] = [
    { id: 'songs', label: 'songs', render: () => wrap('songs', 'songs', results.songs.length, <SongRows ctx={ctx} songs={results.songs.slice(0, shown.songs)} />) },
    { id: 'albums', label: 'albums', render: () => wrap('albums', 'albums', results.albums.length,
      <AlbumTiles ctx={ctx} list={results.albums.slice(0, shown.albums)} meta={a => a.artist.name} />, true) },
    { id: 'artists', label: 'artists', render: () => wrap('artists', 'artists', results.artists.length, <ArtistRows ctx={ctx} list={results.artists.slice(0, shown.artists)} />) },
    { id: 'playlists', label: 'playlists', render: () => wrap('playlists', 'playlists', results.playlists.length, <PlaylistRows ctx={ctx} list={results.playlists.slice(0, shown.playlists)} />) },
  ];
  return <Hub title="search" items={pivots} inputEnabled={ctx.inputEnabled} onBack={ctx.back}
    subheader={<SearchBox value={query} onChange={setQuery} autoFocus />} />;
}

/* ---------- text pages ---------- */

export function DevicesPage({ ctx }: { ctx: PageContext }) {
  return <TextPage onBack={ctx.back} kicker="play on" title="devices">
    <p className="page-note">Music plays through the Spotify app. Pick this phone, or a speaker or computer signed in to the same account.</p>
    <Data ctx={ctx} empty="no devices available. open Spotify on this phone first.">
      <List label="devices">
        {phoneDevices.map((device, i) => {
          const active = device.id === ctx.deviceId;
          const meta = device.restricted ? `${device.type} · can't be controlled from here`
            : active ? `${device.type} · playing here` : device.type;
          return <Row key={device.id} index={i} title={device.name.toLowerCase()} meta={meta} large active={active} disabled={device.restricted}
            onClick={() => ctx.selectDevice(device.id)} />;
        })}
      </List>
    </Data>
  </TextPage>;
}

export function SettingsPage({ ctx }: { ctx: PageContext }) {
  const device = phoneDevices.find(d => d.id === ctx.deviceId)!;
  const { prefs } = ctx;
  return <TextPage onBack={ctx.back} kicker="zplayer · android" title="settings">
    <Section title="theme">
      <Choices label="Theme" value={prefs.theme} onChange={prefs.setTheme}
        options={[['dark', 'dark'], ['light', 'light'], ['system', 'follow phone']] as const} />
      <Swatches value={prefs.accent} onChange={prefs.setAccent} />
    </Section>
    <Section title="animations">
      <Choices label="Animations" value={prefs.motion} onChange={prefs.setMotion}
        options={[['on', 'on'], ['off', 'off'], ['system', 'follow phone']] as const} />
    </Section>
    <Section title="playback">
      <p>{ctx.remote
        ? ctx.remote.status === 'connected' ? 'Connected to the Spotify app on this phone, through Spotify\'s Android SDK.'
          : ctx.remote.status === 'connecting' ? 'Connecting to the Spotify app…'
          : `Not connected to the Spotify app. ${ctx.remote.error ?? ''}`
        : device.local ? 'Playing through the Spotify app on this phone.' : `Controlling ${device.name}.`}</p>
      <button type="button" className="text-link" onClick={() => ctx.open({ kind: 'devices' })}>choose a device</button>
    </Section>
    <Section title="account">
      <p>Signed in to Spotify as {ctx.spotifyAccount?.name ?? account.name}.{(ctx.spotifyAccount ? ctx.spotifyAccount.premium : true) ? ' Premium.' : ' Playing on demand needs Premium.'}</p>
      <button type="button" className="text-link" onClick={ctx.signOut}>sign out</button>
    </Section>
    <Section title="diagnostics">
      <p>Spotify app, App Remote and WebView details for troubleshooting.</p>
      <button type="button" className="text-link" onClick={() => ctx.open({ kind: 'diagnostics' })}>open diagnostics</button>
    </Section>
  </TextPage>;
}

export function DiagnosticsPage({ ctx }: { ctx: PageContext }) {
  return <TextPage onBack={ctx.back} kicker="settings" title="diagnostics">
    <Section title="environment">
      <dl>{diagnostics.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </Section>
    <Section title="event log">
      <dl>{[['6:55:12 pm', 'Spotify app found'], ['6:55:13 pm', 'App Remote connected'], ['6:55:14 pm', 'player state subscribed']]
        .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </Section>
  </TextPage>;
}

/** Signed out. Without the Spotify app installed, it says so and offers its store page instead. */
export function SignedOutScreen({ spotifyInstalled, onConnect, onGetSpotify, auth }: {
  spotifyInstalled: boolean; onConnect: () => void; onGetSpotify: () => void;
  /** The real sign-in inside the Android app: shows the Client ID field and Spotify's errors. */
  auth?: SpotifyAccount;
}) {
  return <TextPage title={<Wordmark />}>
    {spotifyInstalled
      ? <Section title="connect spotify">
          <p>ZPLAYER plays your music through the Spotify app on this phone. Sign in with Spotify to start; full control needs Premium.</p>
          {auth && <>
            <input className="zp-field" aria-label="Spotify Client ID" placeholder="client id" autoComplete="off" autoCapitalize="none"
              spellCheck={false} inputMode="text" disabled={auth.busy} value={auth.clientId}
              onChange={event => auth.setClientId(event.target.value)} />
            <p className="zp-field-note">The Client ID from your app in the Spotify Developer Dashboard (the same one ZPLAYER for Windows uses).</p>
          </>}
          <ActionButton icon={<PlusIcon />} label={auth?.busy ? 'waiting for spotify…' : 'connect'}
            onClick={() => { if (!auth) onConnect(); else if (!auth.busy && auth.clientId.trim()) void auth.connect(); }} />
          {auth?.error && <p className="zp-error" role="alert">{auth.error}</p>}
        </Section>
      : <Section title="get spotify first">
          <p>ZPLAYER plays your music through the Spotify app, and it isn't on this phone yet. Install it, sign in, then come back.</p>
          <ActionButton icon={<PlusIcon />} label="get spotify" onClick={onGetSpotify} />
        </Section>}
  </TextPage>;
}

/* ---------- artist, album, playlist ---------- */

export function ArtistPage({ ctx, artist }: { ctx: PageContext; artist: MockArtist }) {
  const own = albums.filter(a => a.artist.id === artist.id);
  const full = own.filter(a => a.kind === 'album');
  const singles = own.filter(a => a.kind === 'single');
  const liked = likedSongs.filter(s => s.artist === artist.name);
  const everything = own.flatMap(a => a.tracks);
  const following = ctx.followed.has(artist.id);

  const pivots: PivotItem[] = [
    { id: 'albums', label: 'albums', render: () => <Data ctx={ctx} tiles empty="no albums yet">
      {full.length ? <AlbumTiles ctx={ctx} list={full} meta={a => String(a.year)} /> : <p className="empty">no albums yet</p>}</Data> },
    { id: 'singles', label: 'singles', render: () => <Data ctx={ctx} tiles empty="no singles yet">
      {singles.length ? <AlbumTiles ctx={ctx} list={singles} meta={a => String(a.year)} /> : <p className="empty">no singles yet</p>}</Data> },
    {
      id: 'songs', label: 'in your library', render: () => <>
        <div className="actions pane-actions">
          <ActionButton icon={<PlayIcon />} label="play all" onClick={() => ctx.player.playList(everything, 0)} />
          <ActionButton icon={<ShuffleIcon />} label="shuffle" onClick={() => ctx.player.playShuffled(everything)} />
          <PinButton ctx={ctx} pin={{ kind: 'artist', id: artist.id }} />
        </div>
        <Data ctx={ctx} empty="none of their songs are in your liked songs yet">
          {liked.length ? <SongRows ctx={ctx} songs={liked} /> : <p className="empty">none of their songs are in your liked songs yet</p>}
        </Data>
      </>,
    },
  ];
  return <Hub title={t(ctx, artist.name).toLowerCase()} brand={artist.genres.join(' · ')} items={pivots}
    inputEnabled={ctx.inputEnabled} background={artist.image} onBack={ctx.back}
    actions={<ActionButton icon={following ? <CheckIcon /> : <PlusIcon />} label={following ? 'following' : 'follow'}
      active={following} onClick={() => ctx.toggleFollow(artist.id)} />} />;
}

export function AlbumPage({ ctx, album }: { ctx: PageContext; album: MockAlbum }) {
  const saved = ctx.savedAlbums.has(album.id);
  const artist = artistByName(album.artist.name);
  return <DetailPage onBack={ctx.back} background={album.art} art={album.art} kicker={album.kind} title={t(ctx, album.title)}
    subtitle={artist ? <button type="button" onClick={() => ctx.open({ kind: 'artist', artist })}>{album.artist.name}</button> : album.artist.name}
    meta={`${album.year} · ${album.tracks.length} ${album.tracks.length === 1 ? 'song' : 'songs'} · ${totalMinutes(album.tracks)} min`}
    actions={<>
      <ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.player.playList(album.tracks, 0)} />
      <ActionButton icon={<ShuffleIcon />} label="shuffle" onClick={() => ctx.player.playShuffled(album.tracks)} />
      <ActionButton icon={<HeartIcon filled={saved} />} label={saved ? 'saved' : 'save'} active={saved} onClick={() => ctx.toggleSaved(album.id)} />
      <PinButton ctx={ctx} pin={{ kind: 'album', id: album.id }} />
    </>}>
    <Data ctx={ctx} empty="this album has no playable songs"><SongRows ctx={ctx} songs={album.tracks} numbered /></Data>
  </DetailPage>;
}

export function PlaylistPage({ ctx, playlist }: { ctx: PageContext; playlist: MockPlaylist }) {
  const playable = playlist.owned ? playlist.tracks : allSongs.slice(0, 20);
  const canPlay = playable.length > 0;
  return <DetailPage onBack={ctx.back} background={playlist.art} art={playlist.art}
    kicker={playlist.owned ? 'playlist · by you' : `playlist · by ${playlist.owner}`} title={t(ctx, playlist.title)}
    meta={playlist.owned && playlist.tracks.length ? `${playlist.count} songs · ${totalMinutes(playlist.tracks)} min` : `${playlist.count} songs`}
    actions={<>
      {canPlay && <ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.player.playList(playable, 0)} />}
      {canPlay && <ActionButton icon={<ShuffleIcon />} label="shuffle" onClick={() => ctx.player.playShuffled(playable)} />}
      <PinButton ctx={ctx} pin={{ kind: 'playlist', id: playlist.id }} />
    </>}>
    {!playlist.owned
      ? <Notice title="songs not listed">
          Spotify only shows the songs in playlists you own or collaborate on. You can still play this one from here.
        </Notice>
      : <Data ctx={ctx} empty="this playlist is empty">
          {playlist.tracks.length ? <SongRows ctx={ctx} songs={playlist.tracks} /> : <p className="empty">this playlist is empty</p>}
        </Data>}
  </DetailPage>;
}
