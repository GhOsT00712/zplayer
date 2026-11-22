import { createRoot } from 'react-dom/client';
import '@zplayer/theme';
import './phone/fonts.css';
import './phone/phone.css';
import { LibraryProvider, type AuthPort } from '@zplayer/library/react';
import type { Song } from '@zplayer/library';
import { App, type Runtime } from './app/App';
import { inTauri, seedPrefsFromUrl } from './mock/bridge';
import { FakeEngine } from './mock/fakeEngine';
import { FakeSpotify, MOCK_ACCOUNT } from './mock/fakeSpotify';
import { startAndroid } from './platform/android';
import { PREFS_KEY } from './platform/usePrefs';
import { tauriAuth, tauriTransport } from './platform/transport';
import { AppRemoteEngine } from './playback/appRemoteEngine';
import { REQUIRED_SCOPES } from '@zplayer/library';
import { albums, allSongs, playlists as mockPlaylists, type MockSong } from './shared/data';

seedPrefsFromUrl(PREFS_KEY);
startAndroid();

/** The Android app: the Spotify app plays (App Remote) and the Web API serves the library. */
function realRuntime() {
  const remote = new AppRemoteEngine(tauriTransport, tauriAuth.clientId);
  const runtime: Runtime = { engine: remote, remote, clientId: tauriAuth.clientId, upcoming: () => remote.getSnapshot().upcoming };
  return { runtime, transport: tauriTransport, auth: tauriAuth as AuthPort };
}

const toSong = (song: MockSong): Song => ({
  id: song.id, uri: `spotify:track:${song.id}`, title: song.title, durationMs: song.durationMs, trackNumber: song.number,
  artists: [{ id: song.album.artist.id, name: song.artist }],
  album: { id: song.album.id, name: song.album.title, artwork: song.album.art },
});

/** A plain browser: invented library and a player that makes no sound. */
function mockRuntime() {
  const fake = new FakeSpotify();
  const byUri = new Map(allSongs.map(song => [`spotify:track:${song.id}`, toSong(song)]));
  const engine = new FakeEngine({
    song: uri => byUri.get(uri),
    context: uri => {
      const id = uri.split(':')[2];
      const found = uri.startsWith('spotify:album:') ? albums.find(a => a.id === id)?.tracks
        : mockPlaylists.find(p => p.id === id)?.tracks;
      return (found ?? []).map(toSong);
    },
  });
  const auth: AuthPort = {
    settings: async () => ({ clientId: '', redirectUri: 'preview' }),
    restore: async () => true,
    signIn: async () => {},
    signOut: async () => {},
    scopes: async () => [...REQUIRED_SCOPES],
  };
  const runtime: Runtime = { engine, fake, upcoming: () => engine.upcoming };
  void MOCK_ACCOUNT;
  return { runtime, transport: fake, auth };
}

const { runtime, transport, auth } = inTauri ? realRuntime() : mockRuntime();
createRoot(document.getElementById('root')!).render(
  <LibraryProvider transport={transport} engine={runtime.engine} auth={auth}>
    <App runtime={runtime} />
  </LibraryProvider>,
);
