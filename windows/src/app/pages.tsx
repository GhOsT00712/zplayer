import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Environment } from '../environment';
import { probeDrm } from '../environment';
import type { Device, MusicProvider, Page, Playlist, ProviderSnapshot, Track } from '../music';
import { messageOf } from '../music';
import {
  ActionButton, DataView, DetailPage, HeartIcon, HomeScreen, Hub, List, Notice, PinIcon, PlayIcon, PlusIcon, Row, SearchBox,
  Section, TextPage, ThemeSwitch, Wordmark, formatTime, type HomeTile, type PivotItem,
} from '@zplayer/theme';
import { artOf, artistNames, usePaged } from './data';
import type { usePins } from './usePins';
import type { usePrefs } from './usePrefs';

export type RouteName =
  | { kind: 'home' }
  | { kind: 'quickplay'; pivot?: number }
  | { kind: 'music'; pivot?: number }
  | { kind: 'search' }
  | { kind: 'devices' }
  | { kind: 'settings' }
  | { kind: 'diagnostics' }
  | { kind: 'playlist'; playlist: Playlist };

export type Action = (task: () => Promise<unknown>) => void;

/** Everything a screen needs. Built once per render in App. */
export interface Ctx {
  provider: MusicProvider;
  snapshot: ProviderSnapshot;
  environment: Environment;
  prefs: ReturnType<typeof usePrefs>;
  open: (route: RouteName) => void;
  back: () => void;
  /** False while another layer (now playing) covers the page. */
  inputEnabled: boolean;
  action: Action;
  busy: boolean;
  pins: ReturnType<typeof usePins>;
}

const playingId = (ctx: Ctx) => ctx.snapshot.playback?.track?.id;

/* ---------- building blocks ---------- */

/** A paged Spotify list with the theme's loading, empty, error and rate-limited looks, plus "more". */
function Paged<T>({ fetchPage, listKey, empty, tiles, children }: {
  fetchPage: (offset: number) => Promise<Page<T>>;
  listKey: string;
  empty: string;
  tiles?: boolean;
  children: (items: T[]) => ReactNode;
}) {
  const list = usePaged(fetchPage, listKey);
  return <DataView state={list.state} empty={empty} variant={tiles ? 'tiles' : 'rows'} onRetry={list.retry}>
    {children(list.items)}
    {list.hasMore && <button type="button" className="text-link more" disabled={list.loadingMore} onClick={list.more}>
      {list.loadingMore ? 'loading…' : 'more'}
    </button>}
  </DataView>;
}

function TrackRows({ ctx, tracks }: { ctx: Ctx; tracks: Track[] }) {
  const current = playingId(ctx);
  return <List label="songs">
    {tracks.map((track, i) => <Row key={`${track.id}-${i}`} index={i} title={track.title}
      art={artOf(track.album?.artwork)} meta={[artistNames(track), track.album?.name].filter(Boolean).join(' · ')}
      trailing={track.durationMs ? formatTime(track.durationMs) : undefined}
      active={track.id === current} disabled={!track.playable}
      onClick={() => ctx.action(() => ctx.provider.playTracks(tracks, i))} />)}
  </List>;
}

function PlaylistRows({ ctx, playlists }: { ctx: Ctx; playlists: Playlist[] }) {
  return <List label="playlists">
    {playlists.map((playlist, i) => <Row key={playlist.id} index={i} title={playlist.title} art={artOf(playlist.artwork)}
      meta={playlist.owner ? `by ${playlist.owner}` : undefined} onClick={() => ctx.open({ kind: 'playlist', playlist })} />)}
  </List>;
}

/* ---------- home ---------- */

export function HomePage({ ctx }: { ctx: Ctx }) {
  const playlists = usePaged(offset => ctx.provider.playlists(offset), 'home-playlists');
  const history = usePaged(() => ctx.provider.tracks('recently played'), 'home-history');
  const { pins } = ctx.pins;

  const pinTiles: HomeTile[] = [
    { key: 'liked', label: 'liked songs', icon: <HeartIcon filled />, big: true, onClick: () => ctx.open({ kind: 'music', pivot: 0 }) },
    ...pins.slice(0, 8).map(playlist => ({
      key: playlist.id, label: playlist.title, art: playlist.artwork, onClick: () => ctx.open({ kind: 'playlist', playlist }),
    })),
  ];
  const playlistTiles: HomeTile[] = playlists.items.slice(0, 9).map((playlist, i) => ({
    key: playlist.id, label: playlist.title, art: playlist.artwork, big: i === 0,
    onClick: () => ctx.open({ kind: 'playlist', playlist }),
  }));
  const historyTiles: HomeTile[] = history.items.slice(0, 9).map((track, i) => ({
    key: `${track.id}-${i}`, label: `${track.title} · ${artistNames(track)}`, art: track.album?.artwork, big: i === 0,
    onClick: () => ctx.action(() => ctx.provider.playTracks(history.items, i)),
  }));
  const loading = (state: string) => state === 'loading' ? 4 : 0;

  return <HomeScreen sections={[
    { title: 'pins', accent: true, alignEnd: true, tiles: pinTiles, placeholders: Math.max(0, 4 - pins.length),
      hint: pins.length ? undefined : 'To pin a playlist here, open it and choose pin.' },
    { title: 'playlists', tiles: playlistTiles, placeholders: loading(playlists.state), empty: 'you have no playlists yet' },
    { title: 'history', tiles: historyTiles, placeholders: loading(history.state), empty: 'nothing played yet' },
  ]} />;
}

/* ---------- quickplay and music hubs ---------- */

export function QuickplayHub({ ctx, pivot = 0 }: { ctx: Ctx; pivot?: number }) {
  const pivots: PivotItem[] = [
    { id: 'history', label: 'history', render: () => <Paged listKey="recent" fetchPage={() => ctx.provider.tracks('recently played')}
      empty="nothing played yet">{tracks => <TrackRows ctx={ctx} tracks={tracks} />}</Paged> },
    { id: 'new', label: 'new', render: () => <>
      <p className="t-meta pane-label">recently liked songs</p>
      <Paged listKey="liked-new" fetchPage={offset => ctx.provider.tracks('liked songs', offset)}
        empty="like songs in Spotify to see them here">{tracks => <TrackRows ctx={ctx} tracks={tracks} />}</Paged>
    </> },
    { id: 'favourites', label: 'favourites', render: () => <>
      <p className="t-meta pane-label">your top songs lately</p>
      <Paged listKey="top" fetchPage={offset => ctx.provider.tracks('top tracks', offset)}
        empty="listen a little more to build your favourites">{tracks => <TrackRows ctx={ctx} tracks={tracks} />}</Paged>
    </> },
  ];
  return <Hub title="quickplay" items={pivots} initial={pivot} inputEnabled={ctx.inputEnabled} onBack={ctx.back} />;
}

export function MusicHub({ ctx, pivot = 0 }: { ctx: Ctx; pivot?: number }) {
  const pivots: PivotItem[] = [
    { id: 'songs', label: 'songs', render: () => <Paged listKey="liked" fetchPage={offset => ctx.provider.tracks('liked songs', offset)}
      empty="like songs in Spotify to see them here">{tracks => <TrackRows ctx={ctx} tracks={tracks} />}</Paged> },
    { id: 'playlists', label: 'playlists', render: () => <Paged listKey="playlists" fetchPage={offset => ctx.provider.playlists(offset)}
      empty="you have no playlists yet">{playlists => <PlaylistRows ctx={ctx} playlists={playlists} />}</Paged> },
  ];
  return <Hub title="music" items={pivots} initial={pivot} inputEnabled={ctx.inputEnabled} onBack={ctx.back} />;
}

/* ---------- search ---------- */

export function SearchHub({ ctx }: { ctx: Ctx }) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  // Search as you type, but wait for a pause so each word isn't a separate API call.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [draft]);
  const pivots: PivotItem[] = [
    { id: 'songs', label: 'songs', render: () => query.length < 2
      ? <p className="empty">search songs on Spotify</p>
      : <Paged listKey={`search:${query}`} fetchPage={offset => ctx.provider.search(query, offset)} empty={`no songs match "${query}"`}>
          {tracks => <TrackRows ctx={ctx} tracks={tracks} />}
        </Paged> },
  ];
  return <Hub title="search" items={pivots} inputEnabled={ctx.inputEnabled} onBack={ctx.back}
    subheader={<SearchBox value={draft} onChange={setDraft} autoFocus />} />;
}

/* ---------- playlist ---------- */

export function PlaylistPage({ ctx, playlist }: { ctx: Ctx; playlist: Playlist }) {
  const tracks = usePaged(offset => ctx.provider.playlistTracks(playlist.id, offset), `playlist:${playlist.id}`);
  const hidden = tracks.status === 403; // Spotify lists items only for playlists you own or collaborate on
  return <DetailPage onBack={ctx.back} background={playlist.artwork} art={artOf(playlist.artwork)} kicker="playlist"
    title={playlist.title} subtitle={playlist.owner ? `by ${playlist.owner}` : undefined}
    actions={<>
      <ActionButton icon={<PlayIcon />} label="play" onClick={() => ctx.action(() => ctx.provider.playPlaylist(playlist.id))} />
      <ActionButton icon={<PinIcon filled={ctx.pins.isPinned(playlist.id)} />} label={ctx.pins.isPinned(playlist.id) ? 'pinned' : 'pin'}
        active={ctx.pins.isPinned(playlist.id)} onClick={() => ctx.pins.togglePin(playlist)} />
      {playlist.sourceUrl && <ActionButton icon={<PlusIcon />} label="open in spotify"
        onClick={() => ctx.action(() => ctx.provider.openSource(playlist.sourceUrl!))} />}
    </>}>
    {hidden
      ? <Notice title="songs not listed">Spotify only shows the songs in playlists you own or collaborate on. You can still play this one from here.</Notice>
      : <DataView state={tracks.state} empty="this playlist is empty" onRetry={tracks.retry}>
          <TrackRows ctx={ctx} tracks={tracks.items} />
          {tracks.hasMore && <button type="button" className="text-link more" disabled={tracks.loadingMore} onClick={tracks.more}>
            {tracks.loadingMore ? 'loading…' : 'more'}</button>}
        </DataView>}
  </DetailPage>;
}

/* ---------- devices ---------- */

export function DevicesPage({ ctx }: { ctx: Ctx }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [state, setState] = useState<'loading' | 'normal' | 'empty' | 'error'>('loading');
  const [request, setRequest] = useState(0);
  const { snapshot, provider } = ctx;
  useEffect(() => {
    let live = true;
    void provider.devices().then(list => {
      if (!live) return;
      setDevices(list);
      setState(list.length ? 'normal' : 'empty');
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [provider, request, snapshot.mode, snapshot.targetId]);

  return <TextPage onBack={ctx.back} title="devices">
    <p className="page-note">Pick where music plays. Spotify Connect devices show up here while they're online.</p>
    <DataView state={state} empty="no devices available. open Spotify on a phone, speaker or computer." onRetry={() => setRequest(n => n + 1)}>
      <List label="devices">
        {devices.map((device, i) => {
          const selected = !!device.id && device.id === snapshot.targetId;
          const blocked = !device.id || device.restricted || (device.inApp && snapshot.mode !== 'in-app playback');
          const meta = [device.inApp ? 'this app' : device.type, selected && 'playing here', device.active && !selected && 'active',
            device.restricted && "can't be controlled from here"].filter(Boolean).join(' · ');
          return <Row key={device.id ?? i} index={i} title={device.name} meta={meta} large active={selected} disabled={blocked}
            onClick={() => ctx.action(async () => { await provider.selectDevice(device.id!); setRequest(n => n + 1); })} />;
        })}
      </List>
    </DataView>
    <button type="button" className="text-link more" onClick={() => setRequest(n => n + 1)}>refresh</button>
  </TextPage>;
}

/* ---------- settings and diagnostics ---------- */

export function SettingsPage({ ctx }: { ctx: Ctx }) {
  const { snapshot } = ctx;
  return <TextPage onBack={ctx.back} title="settings">
    <Section title="account">
      <p>Signed in to {ctx.provider.name} as {snapshot.account?.name ?? 'your account'}.</p>
      <button type="button" className="text-link" disabled={ctx.busy} onClick={() => ctx.action(() => ctx.provider.signOut())}>sign out</button>
    </Section>
    <Section title="theme">
      <ThemeSwitch theme={ctx.prefs.theme} accent={ctx.prefs.accent} onTheme={ctx.prefs.setTheme} onAccent={ctx.prefs.setAccent} />
    </Section>
    <Section title="animations">
      <div className="ts-modes" role="group" aria-label="Animations" data-no-swipe>
        {([['on', 'on'], ['off', 'off'], ['system', 'follow windows']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={ctx.prefs.motion === value} onClick={() => ctx.prefs.setMotion(value)}>{label}</button>)}
      </div>
      <p className="page-note">Pivots sliding, pages turning and the full-screen covers flipping.
        "follow windows" turns them off when Windows' Animation effects setting is off.</p>
    </Section>
    <Section title="playback">
      <p>{snapshot.mode === 'in-app playback' ? 'Playing in this app.'
        : snapshot.mode === 'remote control' ? `Controlling ${snapshot.targetName ?? 'another device'}.` : `Playback is ${snapshot.mode}.`}</p>
      {snapshot.reason && <p>{snapshot.reason}</p>}
      <button type="button" className="text-link" onClick={() => ctx.open({ kind: 'devices' })}>choose a device</button>
    </Section>
    <Section title="diagnostics">
      <p>Webview, DRM and SDK details for troubleshooting playback.</p>
      <button type="button" className="text-link" onClick={() => ctx.open({ kind: 'diagnostics' })}>open diagnostics</button>
    </Section>
  </TextPage>;
}

export function DiagnosticsPage({ snapshot, environment, onBack }: { snapshot: ProviderSnapshot; environment: Environment; onBack: () => void }) {
  const [drm, setDrm] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void probeDrm().then(value => { if (live) setDrm(value); });
    return () => { live = false; };
  }, []);
  const rows: [string, string][] = [
    ['mode', snapshot.mode],
    ['signed in as', snapshot.account ? `${snapshot.account.name} (${snapshot.account.id})` : '—'],
    ['SDK ready fired', String(snapshot.sdkReady)],
    ['SDK device id', snapshot.sdkDeviceId ?? '—'],
    ['active target', [snapshot.targetName, snapshot.targetId].filter(Boolean).join(' · ') || '—'],
    ['default origin', environment.initial.origin],
    ['default secure context', String(environment.initial.secureContext)],
    ['default standard EME API', String(environment.initial.eme)],
    ['current origin', environment.current.origin],
    ['current secure context', String(environment.current.secureContext)],
    ['current standard EME API', String(environment.current.eme)],
    ...['Widevine', 'PlayReady', 'FairPlay'].map(key => [key, drm[key] ?? 'checking…'] as [string, string]),
    ['user agent', environment.userAgent],
  ];
  return <TextPage onBack={onBack} kicker="settings" title="diagnostics">
    {environment.originNote && <p className="page-note">{environment.originNote}</p>}
    {snapshot.reason && <p className="page-note">{snapshot.reason}</p>}
    <Section title="environment">
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </Section>
    <Section title="event log">
      <pre className="log">{snapshot.log.join('\n') || 'no events yet'}</pre>
    </Section>
  </TextPage>;
}

/* ---------- signed out ---------- */

export function SignedOutPage({ provider, snapshot, busy, action, onDiagnostics }: {
  provider: MusicProvider; snapshot: ProviderSnapshot; busy: boolean; action: Action; onDiagnostics: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [redirect, setRedirect] = useState('');
  useEffect(() => {
    let live = true;
    void provider.settings().then(result => {
      if (!live) return;
      setClientId(previous => previous || result.clientId);
      setRedirect(result.redirectUri);
    }).catch(error => { if (live) setRedirect(messageOf(error)); });
    return () => { live = false; };
  }, [provider]);
  const connect = (event: FormEvent) => {
    event.preventDefault();
    if (clientId.trim()) action(() => provider.signIn(clientId.trim()));
  };
  return <TextPage title={<Wordmark />}>
    <Section title="connect spotify">
      {snapshot.reason && <p className="state-title">{snapshot.reason}</p>}
      <p>Sign in with a Spotify Premium account to play your music here. Your browser opens to finish signing in.</p>
      <p>Your Spotify developer app needs this redirect URI: <code className="code">{redirect || 'reading…'}</code></p>
      <form className="connect-form" onSubmit={connect} data-no-swipe>
        <input className="field" aria-label="Spotify Client ID" placeholder="client id" autoComplete="off" spellCheck={false}
          disabled={busy} value={clientId} onChange={event => setClientId(event.target.value)} />
        <ActionButton icon={<PlusIcon />} label={busy ? 'waiting for the browser…' : 'connect'}
          onClick={() => { if (clientId.trim() && !busy) action(() => provider.signIn(clientId.trim())); }} />
      </form>
    </Section>
    <Section title="trouble?">
      <button type="button" className="text-link" onClick={onDiagnostics}>open diagnostics</button>
    </Section>
  </TextPage>;
}

export function StartingPage() {
  return <TextPage title={<Wordmark />}><p className="page-note">starting…</p></TextPage>;
}

